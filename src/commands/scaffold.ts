import { TFolder } from "obsidian";

import type { CommandBuilder } from "./types";
import { translate } from "src/i18n";
import NewPaperModal from "src/view/project-lifecycle/new-paper-modal";

export const newPaperProject: CommandBuilder = (plugin) => ({
  id: "longform-new-paper-project",
  name: translate("cmd.newPaperProject"),
  callback: () => {
    // No folder context from the palette: scaffold under the active file's folder,
    // falling back to the vault root.
    const active = plugin.app.workspace.getActiveFile();
    const parent =
      active?.parent instanceof TFolder
        ? active.parent
        : plugin.app.vault.getRoot();
    new NewPaperModal(plugin.app, parent).open();
  },
});
