export const LONGFORM_CURRENT_PLUGIN_DATA_VERSION = 3;
export const LONGFORM_CURRENT_INDEX_VERSION = 1;

export type IndentedScene = {
  title: string;
  indent: number;
};

export type MultipleSceneDraft = {
  format: "scenes";
  title: string;
  titleInFrontmatter: boolean;
  draftTitle: string | null;
  vaultPath: string;
  workflow: string | null;
  sceneFolder: string;
  scenes: IndentedScene[];
  ignoredFiles: string[] | null;
  unknownFiles: string[];
  sceneTemplate: string | null;
  /**
   * When this draft is one asset of a single-file `format: project` index,
   * the real path of that shared index file. `null`/absent for a legacy draft
   * whose own file *is* the index. See {@link draftIndexPath}.
   */
  indexPath?: string | null;
  /** Stable id of this asset within its project index (`null` for legacy). */
  assetId?: string | null;
};

export type SingleSceneDraft = {
  format: "single";
  title: string;
  titleInFrontmatter: boolean;
  draftTitle: string | null;
  vaultPath: string;
  workflow: string | null;
  /** See {@link MultipleSceneDraft.indexPath}. */
  indexPath?: string | null;
  /** See {@link MultipleSceneDraft.assetId}. */
  assetId?: string | null;
  /**
   * For a single asset of a `format: project` index, the real path of the
   * external body note this asset exports. `null`/absent for a legacy single
   * draft whose own index file *is* the body.
   */
  bodyPath?: string | null;
};

export type Draft = MultipleSceneDraft | SingleSceneDraft;

/**
 * On-disk shape of a `format: project` index's `longform` frontmatter and its
 * `assets` entries. These are the parsed-YAML types — NOT `Draft`s. A project
 * index is not itself a draft; it expands into one `Draft` per asset (see
 * `expandProjectIndex` in `draft-utils.ts`).
 */
export type ProjectScenesAsset = {
  name: string;
  id?: string;
  format: "scenes";
  folder: string;
  workflow?: string | null;
  scenes?: unknown[];
  sceneTemplate?: string | null;
  ignoredFiles?: string[] | null;
};

export type ProjectSingleAsset = {
  name: string;
  id?: string;
  format: "single";
  file: string;
  workflow?: string | null;
};

export type ProjectAsset = ProjectScenesAsset | ProjectSingleAsset;

export type ProjectIndexEntry = {
  format: "project";
  title: string;
  assets: ProjectAsset[];
};

export type SerializedStep = {
  id: string;
  optionValues: { [id: string]: unknown };
};

export type SerializedWorkflow = {
  name: string;
  description: string;
  steps: SerializedStep[];
};

/**
 * Draft vault paths to either a map of scene names to word counts or,
 * in the case of single-scene drafts, the word count.
 */
export type DraftWordCounts = Record<string, Record<string, number> | number>;

export type WordCountSession = {
  /**
   * Start date for this session.
   */
  start: Date;

  /**
   * Total number of words written in this session.
   */
  total: number;

  /**
   * Stats in this session per draft.
   */
  drafts: Record<
    string,
    {
      /**
       * Total words written in this draft in this session.
       */
      total: number;

      /**
       * Stats in this session per scene.
       */
      scenes: Record<string, number>;
    }
  >;
};

export interface LongformPluginSettings {
  version: number;
  // UI language: an explicit locale, or "auto" to follow PaperBell / Obsidian.
  language: "auto" | "en" | "zh";
  selectedDraftVaultPath: string | null;
  workflows: Record<string, SerializedWorkflow> | null;
  userScriptFolder: string | null;
  sessionStorage: "data" | "plugin-folder" | "file";
  sessions: WordCountSession[];
  showWordCountInStatusBar: boolean;
  startNewSessionEachDay: boolean;
  sessionGoal: number;
  applyGoalTo: "all" | "project" | "note";
  notifyOnGoal: boolean;
  countDeletionsForGoal: boolean;
  keepSessionCount: number;
  sessionFile: string;
  numberScenes: boolean;
  sceneTemplate: string | null;
  waitForSync: boolean;
  fallbackWaitEnabled: boolean;
  fallbackWaitTime: number;
  writeProperty: boolean;
  // Pandoc export (Run Pandoc Export compile step).
  pandocAssetsUrl: string; // URL of the toolchain zip to download
  pandocAssetsFolder: string; // "" = the default download folder (PaperBell/pandoc)
  pandocOutputFolder: string; // "" = write next to the manuscript
  pandocBinary: string; // "pandoc" or an absolute path
  pandocBibliography: string; // "" = auto-detect project references.bib/mybib.bib
  pandocGlobalBibliography: string; // vault-wide bib(s), comma/newline separated, merged into every export
  pandocSetupDismissed: boolean; // true once the user has seen the setup prompt
  pandocMarketIndexUrl: string; // "" = the built-in default marketplace index
  // DEPRECATED. To be removed in future, needed now for migrations.
  projects: {
    [path: string]: {
      indexFile: string;
      draftsPath: string;
    };
  };
}

export const DEFAULT_SESSION_FILE = "longform-sessions.json";

export const DEFAULT_SETTINGS: LongformPluginSettings = {
  version: LONGFORM_CURRENT_PLUGIN_DATA_VERSION,
  language: "auto",
  selectedDraftVaultPath: null,
  workflows: null,
  userScriptFolder: null,
  sessionStorage: "data",
  sessions: [],
  showWordCountInStatusBar: true,
  startNewSessionEachDay: true,
  sessionGoal: 500,
  applyGoalTo: "all",
  notifyOnGoal: true,
  countDeletionsForGoal: false,
  keepSessionCount: 30,
  sessionFile: DEFAULT_SESSION_FILE,
  numberScenes: false,
  sceneTemplate: null,
  writeProperty: false,
  projects: {},
  waitForSync: false,
  fallbackWaitEnabled: true,
  fallbackWaitTime: 5,
  pandocAssetsUrl: "",
  pandocAssetsFolder: "",
  pandocOutputFolder: "",
  pandocBinary: "pandoc",
  pandocBibliography: "",
  pandocGlobalBibliography: "",
  pandocSetupDismissed: false,
  pandocMarketIndexUrl: "",
};

export const TRACKED_SETTINGS_PATHS: (keyof LongformPluginSettings)[] = [
  "version",
  "language",
  "projects",
  "selectedDraftVaultPath",
  "userScriptFolder",
  "sessionStorage",
  "sessions",
  "showWordCountInStatusBar",
  "startNewSessionEachDay",
  "sessionGoal",
  "applyGoalTo",
  "notifyOnGoal",
  "countDeletionsForGoal",
  "keepSessionCount",
  "sessionFile",
  "numberScenes",
  "sceneTemplate",
  "waitForSync",
  "fallbackWaitEnabled",
  "fallbackWaitTime",
  "writeProperty",
  "pandocAssetsUrl",
  "pandocAssetsFolder",
  "pandocOutputFolder",
  "pandocBinary",
  "pandocBibliography",
  "pandocGlobalBibliography",
  "pandocSetupDismissed",
  "pandocMarketIndexUrl",
];

export const PASSTHROUGH_SAVE_SETTINGS_PATHS: (keyof LongformPluginSettings)[] =
  [
    "language",
    "sessionStorage",
    "userScriptFolder",
    "showWordCountInStatusBar",
    "startNewSessionEachDay",
    "sessionGoal",
    "applyGoalTo",
    "notifyOnGoal",
    "countDeletionsForGoal",
    "keepSessionCount",
    "sessionFile",
    "numberScenes",
    "sceneTemplate",
    "waitForSync",
    "fallbackWaitEnabled",
    "fallbackWaitTime",
    "writeProperty",
    "pandocAssetsUrl",
    "pandocAssetsFolder",
    "pandocOutputFolder",
    "pandocBinary",
    "pandocBibliography",
    "pandocSetupDismissed",
    "pandocMarketIndexUrl",
  ];
