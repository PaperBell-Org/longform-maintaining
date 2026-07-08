import type { CommandBuilder } from "./types";
import { translate } from "src/i18n";
import PandocMarketModal from "src/view/pandoc-market";

export const openPandocMarket: CommandBuilder = (plugin) => ({
  id: "longform-open-pandoc-market",
  name: translate("cmd.openMarket"),
  callback: () => {
    new PandocMarketModal(plugin.app, plugin).open();
  },
});
