// Dev entry: loaded straight from TypeScript source by the repo-local
// tui.json and the global ~/.config/opencode/tui.json. Distinct id so a dev
// install is distinguishable from a published one.
import type { TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { installSessionIdPlugin } from "../src/index.js"

const module = {
  id: "opencode-session-id-dev",
  async tui(api: TuiPluginApi) {
    await installSessionIdPlugin(api)
  },
} satisfies TuiPluginModule

export default module
