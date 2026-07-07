/**
 * English message catalog — the source of truth for message keys. `zh.ts` must
 * provide the same keys (enforced by `Messages` typing in `index.ts`).
 *
 * `{name}`-style placeholders are filled by the translator's `vars` argument.
 */
export const en = {
  // ── Commands (command palette) ──────────────────────────────────────────
  "cmd.compileCurrent": "Compile current project with current workflow",
  "cmd.compileProject": "Compile project…",
  "cmd.setupPandoc": "Set up Pandoc export",
  "cmd.openCurrentProject": "Open current note’s project",
  "cmd.previousScene": "Previous scene",
  "cmd.previousSceneAtIndent": "Previous scene at indent level",
  "cmd.nextScene": "Next scene",
  "cmd.nextSceneAtIndent": "Next scene at indent level",
  "cmd.indentScene": "Indent scene",
  "cmd.unindentScene": "Unindent scene",
  "cmd.jumpToProject": "Jump to project",
  "cmd.jumpToScene": "Jump to scene in current project",
  "cmd.openPane": "Open PaperOut pane",
  "cmd.revealProject": "Reveal current project in navigation",
  "cmd.focusNewScene": "Focus new scene field",
  "cmd.insertMultiScene": "Insert multi-scene frontmatter",
  "cmd.insertSingleScene": "Insert single-scene frontmatter",
  "cmd.startSession": "Start new writing session",
  "cmd.markManuscriptSpan": "Mark manuscript reference span",
  "cmd.insertManuscriptRef": "Insert manuscript reference",

  // ── Notices & menus ─────────────────────────────────────────────────────
  "notice.pdfExport":
    "PaperOut To-Authors: PDF export is available. Run “Set up Pandoc export” from the command palette to check prerequisites.",
  "notice.goalMet": "Writing goal met!",
  "menu.createProject": "Create PaperOut Project",

  // ── Explorer pane ───────────────────────────────────────────────────────
  "explorer.paneTitle": "PaperOut To-Authors",
  "explorer.tab.scenes": "Scenes",
  "explorer.tab.project": "Project",
  "explorer.tab.compile": "Compile",
  "explorer.migration.body1":
    "PaperOut To-Authors has been upgraded and requires a migration to a new format. Deprecated index files will be deleted, and some scene files may move. It’s recommended to back up your vault before migrating.",
  "explorer.migration.body2Prefix":
    "You can view the docs and an explanation of what this migration does ",
  "explorer.migration.body2Link": "here",
  "explorer.migration.button": "Migrate",
  "explorer.syncWaiting": "Waiting for Obsidian Sync to complete...",

  // ── Settings: Language ──────────────────────────────────────────────────
  "settings.language.heading": "Language",
  "settings.language.name": "Display language",
  "settings.language.desc":
    "Language for the PaperOut To-Authors interface. “Auto” follows PaperBell (when connected) or Obsidian’s language.",
  "settings.language.auto": "Auto (follow PaperBell / Obsidian)",
  "settings.language.en": "English",
  "settings.language.zh": "中文",

  // ── Settings: Composition ───────────────────────────────────────────────
  "settings.composition.heading": "Composition",
  "settings.sceneTemplate.name": "New scene template",
  "settings.sceneTemplate.desc":
    "This file will be used as a template when creating new scenes via the New Scene… field. If you use a templating plugin (Templater or the core plugin) it will be used to process this template. This setting applies to all projects and can be overridden per-project in the Project > Project Metadata settings in the PaperOut pane.",
  "settings.numberScenes.name": "Show scene numbers in Scenes tab",
  "settings.numberScenes.desc":
    "If on, shows numbers for scenes with subscenes separated by periods, e.g. 1.1.2. Create subscenes by dragging a scene to an indent under an existing scene, or use an indent command.",
  "settings.writeProperty.name": "Write scene index to frontmatter",
  "settings.writeProperty.desc":
    "If enabled, will add a scene index, and scene number, to the frontmatter of scene files.",

  // ── Settings: Compile ───────────────────────────────────────────────────
  "settings.compile.heading": "Compile",
  "settings.pandocExport.name": "Pandoc export",
  "settings.pandocExport.desc":
    "Settings for the ‘Run Pandoc Export’ compile step. The Pandoc toolchain (filters, templates, CSL) is downloaded on demand, so most fields can stay empty.",
  "settings.pandocExport.button": "Set up Pandoc export…",
  "settings.pandocUrl.name": "Pandoc assets URL",
  "settings.pandocUrl.desc":
    "Link to the Pandoc toolchain .zip (filters/templates/CSL). Used by ‘Set up Pandoc export → Download assets’.",
  "settings.pandocFolder.name": "Pandoc assets folder",
  "settings.pandocFolder.desc":
    "Folder containing defaults/ and csl/. Leave empty for the default download location (PaperBell/pandoc). Absolute or vault-relative.",
  "settings.pandocOutput.name": "Pandoc output folder",
  "settings.pandocOutput.desc":
    "Folder to write <acronym>_<date>.pdf into. Vault-relative, or an absolute path to export outside your vault (e.g. ~/Papers — ~ expands to your home folder; it’s created if missing). Leave empty to write next to the compiled manuscript.",
  "settings.bibliography.name": "Bibliography",
  "settings.bibliography.desc":
    "Path to a .bib for citations. Leave empty to auto-detect references.bib / mybib.bib in the project.",
  "settings.pandocBinary.name": "Pandoc binary",
  "settings.pandocBinary.desc":
    "Path to the pandoc executable, or just ‘pandoc’. Common Homebrew/MacTeX dirs are added to PATH automatically.",
  "settings.userScriptFolder.name": "User script step folder",
  "settings.userScriptFolder.desc":
    ".js files in this folder will be available as User Script Steps in the Compile panel.",
  "settings.userSteps.loaded": "Loaded {count} step{plural}:",
  "settings.userSteps.none": "No steps loaded.",
  "settings.userSteps.desc":
    "User Script Steps are automatically loaded from this folder. Changes to .js files in this folder are synced with PaperOut To-Authors after a slight delay. If your script does not appear here or in the Compile tab, you may have an error in your script — check the dev console for it.",

  // ── Settings: Word Counts & Sessions ────────────────────────────────────
  "settings.wordCounts.heading": "Word Counts & Sessions",
  "settings.showWordCount.name": "Show word counts in status bar",
  "settings.showWordCount.desc":
    "Click the status item to show the focused note’s project.",
  "settings.newSessionDaily.name": "Start new writing sessions each day",
  "settings.newSessionDaily.desc":
    "You can always manually start a new session by running the Start New Writing Session command. Turning this off will cause writing sessions to carry over across multiple days until you manually start a new one.",
  "settings.sessionGoal.name": "Session word count goal",
  "settings.sessionGoal.desc":
    "A number of words to target for a given writing session.",
  "settings.goalAppliesTo.name": "Goal applies to",
  "settings.goalAppliesTo.desc":
    "You can set your word count goal to target all your writing, or you can make each project or scene have its own discrete goal.",
  "settings.goalAppliesTo.all": "words written across all projects",
  "settings.goalAppliesTo.project": "each project individually",
  "settings.goalAppliesTo.note": "each scene or single-scene project",
  "settings.notifyOnGoal.name": "Notify on goal reached",
  "settings.countDeletions.name": "Count deletions against goal",
  "settings.countDeletions.desc":
    "If on, deleting words will count as negative words written. You cannot go below zero for a session.",
  "settings.sessionsToKeep.name": "Sessions to keep",
  "settings.sessionsToKeep.desc": "Number of sessions to store locally.",
  "settings.storeSession.name": "Store session data",
  "settings.storeSession.desc":
    "Where your writing session data is stored. By default, data is stored alongside other settings in the plugin’s data.json file. You may instead store it in a separate .json file in the plugin folder, or in a file in your vault. You may want to do this for selective sync or git reasons.",
  "settings.storeSession.data": "with plugin settings",
  "settings.storeSession.pluginFolder":
    "as a .json file in the plugin folder",
  "settings.storeSession.file": "as a file in your vault",
  "settings.sessionFile.name": "Session storage file",
  "settings.sessionFile.desc":
    "Location in your vault to store session JSON. Created if it does not exist, overwritten if it does.",

  // ── Settings: Troubleshooting ───────────────────────────────────────────
  "settings.troubleshooting.heading": "Troubleshooting",
  "settings.waitForSync.name": "Wait for Obsidian Sync",
  "settings.waitForSync.desc":
    "Prevent PaperOut To-Authors from running until Obsidian Sync completes its first sync. If you are using Sync, you may want to enable this if you experience issues with scenes disappearing or falsely being shown as new.",
  "settings.fallbackWait.name": "Enable fallback wait",
  "settings.fallbackWait.desc":
    "If sync status cannot be detected, wait for the time specified below before looking for scenes.",
  "settings.fallbackWaitTime.name": "Fallback wait time",
  "settings.fallbackWaitTime.desc":
    "Time to wait in seconds if sync status cannot be detected.",

  // ── Settings: PaperBell ─────────────────────────────────────────────────
  "settings.paperbell.heading": "PaperBell",
  "settings.paperbell.connectedWithName": "Connected to PaperBell — {name}{plan}.",
  "settings.paperbell.connected": "Connected to PaperBell.",
  "settings.paperbell.account.name": "Account & shared settings",
  "settings.paperbell.account.desc":
    "Fetch your PaperBell account and shared config (language, AI). PaperBell asks for your consent the first time.",
  "settings.paperbell.button.connect": "Connect",
  "settings.paperbell.button.refresh": "Refresh",
  "settings.paperbell.aiAvailable":
    "AI features are available through PaperBell — no API key is stored in this plugin.",
  "settings.paperbell.notConnected":
    "PaperBell is not connected. Install and enable the PaperBell plugin to follow its language and enable AI features. This plugin works fully without it.",

  // ── Settings: Credits ───────────────────────────────────────────────────
  "settings.credits.heading": "Credits",
  "settings.credits.body":
    'PaperOut To-Authors — part of the PaperBell suite, a fork of <a href="https://github.com/kevboh/longform">Longform</a>, originally written by <a href="https://kevinbarrett.org">Kevin Barrett</a>. Maintained by <a href="https://github.com/PaperBell-Org">PaperBell-Org</a>.',
  "settings.credits.source":
    'Read the source code and report issues at <a href="https://github.com/PaperBell-Org">https://github.com/PaperBell-Org</a>.',
  "settings.credits.icon":
    'Icon made by <a href="https://www.flaticon.com/authors/zlatko-najdenovski" title="Zlatko Najdenovski">Zlatko Najdenovski</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a>.',
} as const;
