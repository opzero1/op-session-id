import type { KeymapCommand, UI } from "@opencode/plugin/tui/context"
import type { ClipboardService } from "@opentui/core"

export function sessionIdCommand(input: {
  router: Pick<UI["router"], "current">
  toast: UI["toast"]
  clipboard: Pick<ClipboardService, "writeText">
}): KeymapCommand {
  return {
    id: "op-session-id.copy",
    title: "Copy session ID",
    description: "Copy the current session ID to the clipboard",
    group: "Session",
    palette: true,
    slash: { name: "session-id", aliases: ["id"] },
    async run() {
      const route = input.router.current()
      if (route.type !== "session") {
        input.toast.show({ message: "Open a session to copy its ID.", variant: "info" })
        return
      }

      try {
        const result = await input.clipboard.writeText(route.sessionID, { destination: "all-available" })
        if (result.host.status === "written") {
          input.toast.show({
            title: "Session ID copied",
            message: route.sessionID,
            variant: "success",
            duration: 4000,
          })
          return
        }
        if (result.terminal.status === "attempted") {
          input.toast.show({
            title: "Session ID sent to terminal clipboard",
            message: route.sessionID,
            variant: "info",
            duration: 4000,
          })
          return
        }
      } catch {}

      input.toast.show({
        title: "Could not copy session ID",
        message: route.sessionID,
        variant: "error",
        duration: 6000,
      })
    },
  }
}
