import { Plugin } from "@opencode/plugin/tui"
import { createClipboard, createHostClipboard, createRendererClipboardAdapter } from "@opentui/core"
import { sessionIdCommand } from "./src/command.js"

export default Plugin.define({
  id: "op-session-id",
  setup(context) {
    const clipboard = createClipboard({
      host: createHostClipboard(),
      terminal: createRendererClipboardAdapter(context.renderer),
    })
    const removeSlot = context.ui.slot({
      append: "app",
      render() {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [sessionIdCommand({ ...context.ui, clipboard })],
        }))
        return null
      },
    })
    return async () => {
      removeSlot()
      await clipboard.dispose()
    }
  },
})
