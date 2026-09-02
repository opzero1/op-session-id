import { Plugin } from "@opencode-ai/plugin/tui"
import { spawn } from "node:child_process"
import { platform } from "node:os"

// Mirrors the TUI's own OSC 52 clipboard write: terminal-native, works over
// ssh; tmux/screen need the DCS passthrough wrapper.
function writeOsc52(text: string) {
  if (!process.stdout.isTTY) return
  const sequence = `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`
  try {
    process.stdout.write(process.env.TMUX || process.env.STY ? `\x1bPtmux;\x1b${sequence}\x1b\\` : sequence)
  } catch {}
}

function copy(text: string) {
  writeOsc52(text)
  if (platform() !== "darwin") return
  try {
    const child = spawn("pbcopy", { stdio: ["pipe", "ignore", "ignore"] })
    child.on("error", () => {})
    child.stdin.end(text)
  } catch {}
}

export default Plugin.define({
  id: "opencode-session-id",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "session-id.copy",
          title: "Copy session ID",
          group: "Session",
          palette: true,
          slash: { name: "session-id", aliases: ["id"] },
          run: () => {
            const route = context.ui.router.current()
            const sessionID =
              route && typeof route === "object" && "sessionID" in route ? String(route.sessionID) : undefined
            if (!sessionID) {
              context.ui.toast.show({ message: "No active session", variant: "error" })
              return
            }
            copy(sessionID)
            context.ui.toast.show({ title: "Session ID", message: `${sessionID} (copied)`, variant: "success" })
          },
        },
      ],
    }))
  },
})
