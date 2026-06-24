import { expect, test } from "bun:test"

// Pin every entry module to the loader contract (default export with exactly
// one of `server`/`tui`) so refactors never regress to the legacy path.

test("src entry default-exports { id, tui } without server", async () => {
  const mod = await import("../index.js")
  expect(mod.default.id).toBe("opencode-session-id")
  expect(typeof mod.default.tui).toBe("function")
  expect("server" in mod.default).toBe(false)
})

test("dev entry default-exports { id, tui } with distinct dev id", async () => {
  const mod = await import("../../dev/tui.js")
  expect(mod.default.id).toBe("opencode-session-id-dev")
  expect(typeof mod.default.tui).toBe("function")
  expect("server" in mod.default).toBe(false)
})

test("package.json exports resolve the tui entry", async () => {
  const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json()
  expect(pkg.exports["./tui"]).toBe("./src/index.ts")
  expect(pkg.main).toBe("./src/index.ts")
  expect(await Bun.file(new URL("../../src/index.ts", import.meta.url)).exists()).toBe(true)
})
