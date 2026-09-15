import { expect, test } from "bun:test"
import server from "../../index.js"
import tui from "../../tui.js"
import pkg from "../../package.json"

test("exports distinct native V2 server and TUI entrypoints", () => {
  expect(server.id).toBe("op-session-id")
  expect(tui.id).toBe(server.id)
  expect(typeof server.setup).toBe("function")
  expect(typeof tui.setup).toBe("function")
  expect(pkg.exports["."]).toBe("./index.ts")
  expect(pkg.exports["./tui"]).toBe("./tui.ts")
})
