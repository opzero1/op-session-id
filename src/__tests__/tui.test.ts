import { expect, test } from "bun:test"
import type { TuiPluginApi, TuiToast } from "@opencode-ai/plugin/tui"
import { installSessionIdPlugin } from "../index.js"

type PaletteCommand = {
  slashName?: string
  run: () => boolean
}

function harness() {
  const toasts: TuiToast[] = []
  const commands: PaletteCommand[] = []
  const handlers = new Map<string, (event: unknown) => void>()
  const disposers: Array<() => void | Promise<void>> = []
  const route: { current: { name: string; params?: Record<string, unknown> } } = { current: { name: "home" } }
  const api = {
    route,
    ui: {
      toast: (input: TuiToast) => {
        toasts.push(input)
      },
    },
    keymap: {
      registerLayer: (layer: { commands?: PaletteCommand[] }) => {
        commands.push(...(layer.commands ?? []))
        return () => {}
      },
    },
    event: {
      on: (type: string, handler: (event: unknown) => void) => {
        handlers.set(type, handler)
        return () => {}
      },
    },
    lifecycle: {
      signal: new AbortController().signal,
      onDispose: (fn: () => void | Promise<void>) => {
        disposers.push(fn)
        return () => {}
      },
    },
  }
  return { api: api as unknown as TuiPluginApi, toasts, commands, handlers, disposers, route }
}

// Clipboard writes are gated on process.stdout.isTTY; force the non-TTY path
// so interactive `bun test` runs never touch the real clipboard.
async function withNonTTY(fn: () => void | Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY")
  Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true })
  try {
    await fn()
  } finally {
    if (descriptor) Object.defineProperty(process.stdout, "isTTY", descriptor)
  }
}

test("registers a palette command with /id slash", async () => {
  const { api, commands } = harness()
  await installSessionIdPlugin(api)
  expect(commands.length).toBe(1)
  expect(commands[0]!.slashName).toBe("id")
})

test("/id without a session shows an error toast", async () => {
  const { api, toasts, commands } = harness()
  await installSessionIdPlugin(api)
  commands[0]!.run()
  expect(toasts.length).toBe(1)
  expect(toasts[0]!.variant).toBe("error")
})

test("/id on the session route toasts the full session ID", async () => {
  const { api, toasts, commands, route } = harness()
  await installSessionIdPlugin(api)
  route.current = { name: "session", params: { sessionID: "ses_route123" } }
  await withNonTTY(() => {
    commands[0]!.run()
  })
  expect(toasts[0]!.variant).toBe("success")
  expect(toasts[0]!.message).toContain("ses_route123")
})

test("/id falls back to the session tracked from events", async () => {
  const { api, toasts, commands, handlers } = harness()
  await installSessionIdPlugin(api)
  handlers.get("tui.session.select")!({ properties: { sessionID: "ses_event456" } })
  await withNonTTY(() => {
    commands[0]!.run()
  })
  expect(toasts[0]!.message).toContain("ses_event456")
})

test("exit handler prints session ID and resume command; dispose removes it", async () => {
  const before = process.listeners("exit")
  const { api, handlers, disposers } = harness()
  await installSessionIdPlugin(api)
  const added = process.listeners("exit").filter((listener) => !before.includes(listener))
  expect(added.length).toBe(1)

  handlers.get("session.status")!({ properties: { sessionID: "ses_exit789" } })
  const output: string[] = []
  const write = process.stderr.write
  process.stderr.write = ((chunk: string | Uint8Array) => {
    output.push(String(chunk))
    return true
  }) as typeof process.stderr.write
  try {
    added[0]!(0)
  } finally {
    process.stderr.write = write
  }
  expect(output.join("")).toContain("opencode session: ses_exit789")
  expect(output.join("")).toContain("opencode --session ses_exit789")

  for (const dispose of disposers) await dispose()
  expect(process.listeners("exit")).toEqual(before)
})
