import { get } from "svelte/store";

import type LongformPlugin from "src/main";
import { translate } from "src/i18n";
import { workflows } from "src/model/stores";
import { isExportableNote, workflowCommandId } from "./run-workflow-utils";
import { runWorkflowOnActiveNote } from "./run-workflow";

/**
 * `Plugin.removeCommand` does not exist in the Obsidian API (1.4.x typings and
 * runtime alike); the removal entry point is `app.commands.removeCommand`, which
 * takes the *prefixed* id `<plugin id>:<command id>`. Typed loosely and called
 * defensively so an Obsidian build without it degrades to leaving the command
 * registered — where its `checkCallback` will report it as unavailable.
 */
type CommandsApi = { removeCommand?: (id: string) => void };

/**
 * Registers one command per compile workflow — "Run workflow: <name>" — and
 * keeps that set in sync as workflows are created, renamed, and deleted.
 *
 * The commands run against the *active note* rather than the pane's selected
 * draft, so a single markdown file can be compiled and exported straight from a
 * hotkey without first being made into a project. See `runWorkflowOnActiveNote`.
 */
export function registerWorkflowCommands(plugin: LongformPlugin): void {
  const registered = new Set<string>();

  const sync = (names: string[]): void => {
    const wanted = new Set(names);
    const added: string[] = [];
    const removed: string[] = [];

    for (const name of wanted) {
      if (registered.has(name)) {
        continue;
      }
      plugin.addCommand({
        id: workflowCommandId(name),
        // Obsidian prefixes the plugin name in the palette, so this must not
        // repeat it: "PaperOut To-Authors: Run workflow: PaperBell Manuscript".
        name: `${translate("cmd.runWorkflow")}: ${name}`,
        checkCallback: (checking: boolean) => {
          if (!get(workflows)[name]) {
            return false;
          }
          if (!isExportableNote(plugin.app.workspace.getActiveFile())) {
            return false;
          }
          if (checking) {
            return true;
          }
          void runWorkflowOnActiveNote(plugin, name);
        },
      });
      registered.add(name);
      added.push(name);
    }

    for (const name of [...registered]) {
      if (wanted.has(name)) {
        continue;
      }
      const commands = (plugin.app as unknown as { commands: CommandsApi })
        .commands;
      commands?.removeCommand?.(
        `${plugin.manifest.id}:${workflowCommandId(name)}`
      );
      registered.delete(name);
      removed.push(name);
    }

    if (added.length > 0 || removed.length > 0) {
      console.log(
        `[PaperOut] Workflow commands: +[${added.join(", ")}] -[${removed.join(
          ", "
        )}] — now ${registered.size} registered.`
      );
    }
  };

  // The store is rewritten on every keystroke in the compile pane's description
  // field (and wholesale whenever user scripts reload), so only ever act on a
  // change to the *set of names*. Re-adding an id would also leak an unload
  // closure per call, since Plugin.addCommand registers one each time.
  const unsubscribe = workflows.subscribe((all) => sync(Object.keys(all)));
  plugin.register(unsubscribe);
}
