import { spawn } from "node:child_process"
import { platform } from "node:os"
import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"

// Mirrors packages/tui/src/clipboard.ts writeOsc52: terminal-native clipboard
// that also works over ssh; tmux/screen need the DCS passthrough wrapper.
function writeOsc52(text: string) {
  if (!process.stdout.isTTY) return
  const sequence = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`
  try {
    process.stdout.write(process.env.TMUX || process.env.STY ? `\x1bPtmux;\x1b${sequence}\x1b\\` : sequence)
  } catch {
    // Plugin command handlers run inside TUI dispatch; never throw from here.
  }
}

function copy(text: string) {
  // Clipboard writes only make sense from an interactive terminal; this also
  // keeps hook-level tests from clobbering the real clipboard.
  if (!process.stdout.isTTY) return
  writeOsc52(text)
  if (platform() !== "darwin") return
  try {
    const child = spawn("pbcopy", { stdio: ["pipe", "ignore", "ignore"] })
    child.on("error", () => {})
    child.stdin.end(text)
  } catch {}
}

function routeSessionID(api: TuiPluginApi) {
  const route = api.route.current
  const sessionID = route.name === "session" ? route.params?.sessionID : undefined
  return typeof sessionID === "string" ? sessionID : undefined
}

function readSessionID(properties: unknown) {
  const record = properties && typeof properties === "object" ? (properties as Record<string, unknown>) : undefined
  const sessionID = record?.sessionID ?? record?.sessionId ?? record?.session_id
  return typeof sessionID === "string" ? sessionID : undefined
}

export async function installSessionIdPlugin(api: TuiPluginApi): Promise<void> {
  let activeSessionID: string | undefined
  const setActiveSession = (sessionID?: string) => {
    if (sessionID) activeSessionID = sessionID
  }

  const current = () => routeSessionID(api) ?? activeSessionID

  const showSessionID = () => {
    const sessionID = current()
    if (!sessionID) {
      api.ui.toast({ message: "No session selected yet.", variant: "error" })
      return
    }
    copy(sessionID)
    api.ui.toast({ title: "Session ID", message: `${sessionID} (copied)`, variant: "success", duration: 8000 })
  }

  if (typeof api.keymap?.registerLayer === "function") {
    api.keymap.registerLayer({
      commands: [
        {
          namespace: "palette",
          name: "session-id",
          title: "Copy session ID",
          desc: "Show the current session ID and copy it to the clipboard",
          category: "Session",
          slashName: "id",
          run() {
            showSessionID()
            return true
          },
        },
      ],
    })
  } else {
    api.command?.register(() => [
      {
        title: "Copy session ID",
        value: "session-id",
        description: "Show the current session ID and copy it to the clipboard",
        category: "Session",
        slash: { name: "id" },
        onSelect: showSessionID,
      },
    ])
  }

  api.event.on("tui.session.select", (event) => setActiveSession(event.properties.sessionID))
  api.event.on("session.created", (event) => setActiveSession(event.properties.sessionID))
  api.event.on("session.updated", (event) => setActiveSession(event.properties.sessionID))
  api.event.on("session.status", (event) => setActiveSession(readSessionID(event.properties)))

  // Best-effort: print the last session ID to the normal screen after the TUI
  // tears down, so it is visible in scrollback once opencode closes.
  const printOnExit = () => {
    const sessionID = current()
    if (!sessionID) return
    try {
      process.stderr.write(`\nopencode session: ${sessionID}\nresume: opencode --session ${sessionID}\n`)
    } catch {}
  }
  process.on("exit", printOnExit)
  api.lifecycle.onDispose(() => {
    process.removeListener("exit", printOnExit)
  })
}

const plugin: TuiPluginModule = {
  id: "opencode-session-id",
  tui: installSessionIdPlugin,
}

export default plugin
