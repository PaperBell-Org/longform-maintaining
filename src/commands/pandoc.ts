import type { CommandBuilder } from "./types";
import { PandocSetupModal } from "src/view/pandoc-setup-modal";

export const setupPandocExport: CommandBuilder = (plugin) => ({
  id: "longform-setup-pandoc-export",
  name: "Set up Pandoc export",
  callback: () => {
    new PandocSetupModal(plugin.app).open();
  },
});
