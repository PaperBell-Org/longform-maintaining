import type { CommandBuilder } from "./types";
import { PandocSetupModal } from "src/view/pandoc-setup-modal";
import { translate } from "src/i18n";

export const setupPandocExport: CommandBuilder = (plugin) => ({
  id: "longform-setup-pandoc-export",
  name: translate("cmd.setupPandoc"),
  callback: () => {
    new PandocSetupModal(plugin.app).open();
  },
});
