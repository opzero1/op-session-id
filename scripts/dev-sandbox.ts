import { mkdir } from "node:fs/promises"
import { join, resolve } from "node:path"

const repo = resolve(import.meta.dirname, "..")
const sandbox = join(repo, ".sandbox", "dev")
await mkdir(sandbox, { recursive: true })
await Bun.write(join(sandbox, "opencode.json"), JSON.stringify({
  plugins: ["-session-id", repo],
}, null, 2) + "\n")

if (Bun.argv.includes("--print")) {
  console.log(sandbox)
} else {
  const child = Bun.spawn(["opencode", sandbox], { stdio: ["inherit", "inherit", "inherit"] })
  process.exit(await child.exited)
}
