import { expect, test } from "bun:test"
import type { ClipboardWriteResult } from "@opentui/core"
import type { Route, UI } from "@opencode/plugin/tui/context"
import { sessionIdCommand } from "../command.js"

type ToastOptions = Parameters<UI["toast"]["show"]>[0]
const written: ClipboardWriteResult = {
  host: { status: "written" },
  terminal: { status: "not-attempted", capability: "unknown" },
}

function harness(write: (text: string) => Promise<ClipboardWriteResult> = async () => written) {
  const toasts: ToastOptions[] = []
  const copies: string[] = []
  let route: Route = { type: "session", sessionID: "ses_clipboard_test" }
  const command = sessionIdCommand({
    router: { current: () => route },
    toast: { show: (toast) => { toasts.push(toast) } },
    clipboard: { writeText: async (text) => { copies.push(text); return write(text) } },
  })
  return { command, toasts, copies, navigate(next: Route) { route = next } }
}

test("registers /session-id and /id in the palette", () => {
  const { command } = harness()
  expect(command.slash).toEqual({ name: "session-id", aliases: ["id"] })
  expect(command.palette).toBe(true)
})

test("does not copy without a selected session", async () => {
  const h = harness()
  h.navigate({ type: "home" })
  await h.command.run()
  expect(h.copies).toEqual([])
  expect(h.toasts).toEqual([{ message: "Open a session to copy its ID.", variant: "info" }])
})

test("waits for clipboard completion before reporting success", async () => {
  const copy = Promise.withResolvers<ClipboardWriteResult>()
  const h = harness(() => copy.promise)
  const running = h.command.run()
  expect(h.toasts).toEqual([])
  copy.resolve(written)
  await running
  expect(h.copies).toEqual(["ses_clipboard_test"])
  expect(h.toasts).toEqual([{
    title: "Session ID copied", message: "ses_clipboard_test", variant: "success", duration: 4000,
  }])
})

test("reads the current route on each invocation", async () => {
  const h = harness()
  h.navigate({ type: "session", sessionID: "ses_second" })
  await h.command.run()
  expect(h.copies).toEqual(["ses_second"])
})

test.each(["unsupported", "cancelled", "timed-out"] as const)("reports %s without claiming success", async (status) => {
  const h = harness(async () => ({ host: { status }, terminal: { status: "not-attempted", capability: "unknown" } }))
  await h.command.run()
  expect(h.toasts[0]?.variant).toBe("error")
})

test("reports a clipboard exception as an error toast", async () => {
  const h = harness(async () => { throw new Error("clipboard unavailable") })
  await h.command.run()
  expect(h.toasts[0]?.variant).toBe("error")
})

test("distinguishes unacknowledged terminal delivery from host success", async () => {
  const h = harness(async () => ({
    host: { status: "not-attempted" },
    terminal: { status: "attempted", capability: "supported" },
  }))
  await h.command.run()
  expect(h.toasts[0]?.variant).toBe("info")
  expect(h.toasts[0]?.title).toBe("Session ID sent to terminal clipboard")
})
