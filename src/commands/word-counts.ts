import type { CommandBuilder } from "./types";
import { translate } from "src/i18n";

export const startNewSession: CommandBuilder = (plugin) => ({
  id: "longform-start-new-session",
  name: translate("cmd.startSession"),
  callback: () => {
    plugin.writingSessionTracker.startNewSession();
  },
});
