import type { App } from "obsidian";

import type { CompileStatusError } from "src/compile";
import { RECOVERABLE_PANDOC_SETUP } from "src/compile/recoverable";
import { PandocSetupModal } from "./pandoc-setup-modal";
import type { ErrorModalAction } from "./error-modal";

/**
 * The marketplace command's own id. Obsidian namespaces it as
 * `<plugin id>:<command id>`, and this helper has no plugin handle to build that
 * prefix from — so match on the suffix rather than hardcoding the plugin id,
 * which would be a third literal for any future id migration to hunt down.
 */
const MARKET_COMMAND_SUFFIX = ":longform-open-pandoc-market";

type CommandsApi = {
  commands?: Record<string, unknown>;
  executeCommandById?: (id: string) => boolean;
};

/**
 * The "fix this" buttons for a compile failure, if it is one we know how to fix.
 *
 * Shared by every place that surfaces a compile error — the workflow commands
 * and the compile pane each have their own status handler, and a one-off at
 * either site would silently drift from the other.
 */
export function recoverableActions(
  app: App,
  status: CompileStatusError
): ErrorModalAction[] {
  if (status.recoverable !== RECOVERABLE_PANDOC_SETUP) {
    return [];
  }
  return [
    {
      text: "Set up Pandoc export",
      // PandocSetupModal's plugin argument is optional; without it the modal
      // still runs the ✓/✗ prerequisite checks, which is what's needed here.
      onClick: () => new PandocSetupModal(app).open(),
    },
    {
      text: "Browse asset marketplace",
      // PandocMarketModal *requires* a plugin handle, which this helper has no
      // business holding — go through the command instead.
      onClick: () => {
        const commands = (app as unknown as { commands?: CommandsApi }).commands;
        const id = Object.keys(commands?.commands ?? {}).find((k) =>
          k.endsWith(MARKET_COMMAND_SUFFIX)
        );
        if (id) commands?.executeCommandById?.(id);
      },
    },
  ];
}
