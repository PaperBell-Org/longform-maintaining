<script lang="ts">
  import { Notice, TFile } from "obsidian";
  import { getContext, onMount } from "svelte";
  import { useApp } from "../utils";
  import Icon from "../components/Icon.svelte";

  export let projectPath: string;
  export let projectTitle: string;

  const app = useApp();
  const close: () => void = getContext("close");

  type CreatorRow = { name: string; affiliation: string; orcid: string };
  type FormState = {
    title: string;
    publication_date: string;
    description: string;
    keywords: string;
    journal_title: string;
    version: string;
    creators: CreatorRow[];
    acronym: string;
    csl: string;
    template: string;
    lineno: boolean;
    figuresAtEnd: boolean;
  };

  // Round-trip preservation: keep the parsed JSON so unknown fields survive save.
  let originalJson: Record<string, unknown> = {};
  let filePath = `${projectPath}/metadata.json`;
  let fileExists = false;
  let loading = true;

  let form: FormState = blankForm();

  function blankForm(): FormState {
    return {
      title: projectTitle ?? "",
      publication_date: new Date().toISOString().slice(0, 10),
      description: "",
      keywords: "",
      journal_title: "",
      version: "",
      creators: [{ name: "", affiliation: "", orcid: "" }],
      acronym: "",
      csl: "",
      template: "",
      lineno: false,
      figuresAtEnd: false,
    };
  }

  onMount(async () => {
    const candidates = [
      `${projectPath}/metadata.json`,
      `${projectPath}/source/metadata.json`,
    ];
    let loadedFrom = "";
    let loadedRaw = "";
    for (const path of candidates) {
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) {
        loadedFrom = path;
        loadedRaw = await app.vault.cachedRead(f);
        break;
      }
    }

    if (loadedFrom) {
      filePath = loadedFrom;
      fileExists = true;
      try {
        const parsed = JSON.parse(loadedRaw) as Record<string, unknown>;
        originalJson = parsed;
        form = parsedToForm(parsed);
      } catch (e) {
        new Notice(
          `metadata.json is invalid JSON; opening blank form. (${
            (e as Error).message
          })`
        );
        originalJson = {};
      }
    }
    loading = false;
  });

  function parsedToForm(j: Record<string, unknown>): FormState {
    const ext = (j._longform as Record<string, unknown>) ?? {};
    const creators = Array.isArray(j.creators)
      ? (j.creators as Record<string, unknown>[]).map((c) => ({
          name: String(c?.name ?? ""),
          affiliation: String(c?.affiliation ?? ""),
          orcid: String(c?.orcid ?? ""),
        }))
      : [{ name: "", affiliation: "", orcid: "" }];
    const keywords = Array.isArray(j.keywords)
      ? (j.keywords as unknown[]).map((k) => String(k)).join(", ")
      : "";
    return {
      title: String(j.title ?? projectTitle ?? ""),
      publication_date: String(
        j.publication_date ?? new Date().toISOString().slice(0, 10)
      ),
      description: String(j.description ?? ""),
      keywords,
      journal_title: String(j.journal_title ?? ""),
      version: String(j.version ?? ""),
      creators: creators.length > 0 ? creators : [{ name: "", affiliation: "", orcid: "" }],
      acronym: String(ext.acronym ?? ""),
      csl: String(ext.csl ?? ""),
      template: String(ext.template ?? ""),
      lineno: Boolean(ext.lineno),
      figuresAtEnd: Boolean(ext.figures_at_end),
    };
  }

  function buildOutputJson(): Record<string, unknown> {
    const out: Record<string, unknown> = { ...originalJson };

    out.title = form.title;
    out.publication_date = form.publication_date;
    if (!out.upload_type) out.upload_type = "publication";
    if (!out.publication_type) out.publication_type = "article";
    out.description = form.description;

    out.creators = form.creators
      .filter((c) => c.name.trim() !== "")
      .map((c) => {
        const o: Record<string, unknown> = { name: c.name.trim() };
        if (c.affiliation.trim()) o.affiliation = c.affiliation.trim();
        if (c.orcid.trim()) o.orcid = c.orcid.trim();
        return o;
      });

    const kws = form.keywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (kws.length > 0) out.keywords = kws;
    else delete out.keywords;

    if (form.journal_title.trim()) out.journal_title = form.journal_title.trim();
    else delete out.journal_title;

    if (form.version.trim()) out.version = form.version.trim();
    else delete out.version;

    const prevExt = (originalJson._longform as Record<string, unknown>) ?? {};
    const ext: Record<string, unknown> = { ...prevExt };
    setOrDelete(ext, "acronym", form.acronym.trim());
    setOrDelete(ext, "csl", form.csl.trim());
    setOrDelete(ext, "template", form.template.trim());
    ext.lineno = form.lineno;
    ext.figures_at_end = form.figuresAtEnd;
    if (!form.lineno) delete ext.lineno;
    if (!form.figuresAtEnd) delete ext.figures_at_end;

    if (Object.keys(ext).length > 0) out._longform = ext;
    else delete out._longform;

    return out;
  }

  function setOrDelete(
    obj: Record<string, unknown>,
    key: string,
    value: string
  ): void {
    if (value && value.length > 0) obj[key] = value;
    else delete obj[key];
  }

  $: titleOk = form.title.trim().length > 0;
  $: creatorsOk = form.creators.some((c) => c.name.trim().length > 0);
  $: canSave = !loading && titleOk && creatorsOk;

  function addCreator() {
    form.creators = [...form.creators, { name: "", affiliation: "", orcid: "" }];
  }
  function removeCreator(i: number) {
    form.creators = form.creators.filter((_, idx) => idx !== i);
    if (form.creators.length === 0) {
      form.creators = [{ name: "", affiliation: "", orcid: "" }];
    }
  }
  function moveCreator(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= form.creators.length) return;
    const next = form.creators.slice();
    [next[i], next[j]] = [next[j], next[i]];
    form.creators = next;
  }

  async function onSave() {
    if (!canSave) return;
    const data = buildOutputJson();
    const text = JSON.stringify(data, null, 2) + "\n";
    try {
      const existing = app.vault.getAbstractFileByPath(filePath);
      if (existing instanceof TFile) {
        await app.vault.modify(existing, text);
      } else {
        const parent = filePath.split("/").slice(0, -1).join("/");
        if (parent && !(await app.vault.adapter.exists(parent))) {
          await app.vault.createFolder(parent);
        }
        await app.vault.create(filePath, text);
      }
      new Notice("Metadata saved.");
      close();
    } catch (e) {
      new Notice(`Failed to save metadata: ${(e as Error).message}`);
    }
  }

  async function onCreateFile() {
    fileExists = true;
  }
</script>

<div class="metadata-modal-root">
  {#if loading}
    <p class="muted">Loading metadata…</p>
  {:else if !fileExists}
    <div class="empty-state">
      <p>
        No <code>metadata.json</code> found in
        <code>{projectPath}</code>.
      </p>
      <p class="muted">
        Create one to describe authors, abstract, journal, and more for the
        <em>Add Zenodo Frontmatter</em> compile step.
      </p>
      <button type="button" class="primary" on:click={onCreateFile}>
        Create metadata.json
      </button>
    </div>
  {:else}
    <form on:submit|preventDefault={onSave}>
      <section>
        <h3>Basics</h3>
        <label class="field">
          <span>Title<span class="req">*</span></span>
          <input type="text" bind:value={form.title} placeholder="Manuscript title" />
        </label>
        <div class="row two-col">
          <label class="field">
            <span>Publication date</span>
            <input type="date" bind:value={form.publication_date} />
          </label>
          <label class="field">
            <span>Version</span>
            <input type="text" bind:value={form.version} placeholder="v1.0" />
          </label>
        </div>
        <label class="field">
          <span>Journal</span>
          <input
            type="text"
            bind:value={form.journal_title}
            placeholder="Nature"
          />
        </label>
        <label class="field">
          <span>Abstract / description</span>
          <textarea
            rows="5"
            bind:value={form.description}
            placeholder="Manuscript abstract."
          />
        </label>
        <label class="field">
          <span>Keywords</span>
          <input
            type="text"
            bind:value={form.keywords}
            placeholder="comma, separated, list"
          />
        </label>
      </section>

      <section>
        <div class="section-head">
          <h3>
            Creators
            {#if !creatorsOk}<span class="req">*</span>{/if}
          </h3>
          <button type="button" class="ghost" on:click={addCreator} title="Add creator">
            <Icon iconName="plus-with-circle" />
          </button>
        </div>
        <p class="muted small">
          Zenodo treats <code>affiliation</code> as a single string. For
          multi-affiliation authors, edit
          <code>_longform.author_affiliations</code> directly in the JSON file.
        </p>
        <div class="creators">
          {#each form.creators as creator, i (i)}
            <div class="creator-row">
              <div class="creator-fields">
                <input
                  type="text"
                  bind:value={creator.name}
                  placeholder="Family, Given"
                  class="creator-name"
                />
                <input
                  type="text"
                  bind:value={creator.affiliation}
                  placeholder="Affiliation"
                  class="creator-affil"
                />
                <input
                  type="text"
                  bind:value={creator.orcid}
                  placeholder="0000-0000-0000-0000"
                  class="creator-orcid"
                />
              </div>
              <div class="creator-actions">
                <button
                  type="button"
                  class="ghost"
                  on:click={() => moveCreator(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                >▲</button>
                <button
                  type="button"
                  class="ghost"
                  on:click={() => moveCreator(i, 1)}
                  disabled={i === form.creators.length - 1}
                  title="Move down"
                >▼</button>
                <button
                  type="button"
                  class="ghost danger"
                  on:click={() => removeCreator(i)}
                  title="Remove creator"
                >✕</button>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <section>
        <h3>Longform extras</h3>
        <p class="muted small">
          Plugin-specific keys under <code>_longform</code>. Zenodo ignores
          these on upload.
        </p>
        <div class="row two-col">
          <label class="field">
            <span>Acronym</span>
            <input type="text" bind:value={form.acronym} placeholder="MYPAPER" />
          </label>
          <label class="field">
            <span>CSL style</span>
            <input type="text" bind:value={form.csl} placeholder="nature" />
          </label>
        </div>
        <label class="field">
          <span>Pandoc template</span>
          <input type="text" bind:value={form.template} placeholder="default" />
        </label>
        <div class="row two-col toggles">
          <label class="toggle">
            <input type="checkbox" bind:checked={form.lineno} />
            <span>Line numbers</span>
          </label>
          <label class="toggle">
            <input type="checkbox" bind:checked={form.figuresAtEnd} />
            <span>Figures at end</span>
          </label>
        </div>
      </section>

      <footer>
        <p class="muted small file-path">
          Saving to <code>{filePath}</code>
        </p>
        <div class="actions">
          <button type="button" class="ghost" on:click={close}>Cancel</button>
          <button type="submit" class="primary" disabled={!canSave}>
            Save
          </button>
        </div>
      </footer>
    </form>
  {/if}
</div>

<style>
  .metadata-modal-root {
    width: 100%;
    max-width: 640px;
  }

  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: var(--font-ui-smaller);
    line-height: var(--line-height-tight);
  }
  .req {
    color: var(--text-error);
    margin-left: 2px;
  }

  section {
    border-top: var(--border-width) solid var(--background-modifier-border);
    padding: var(--size-4-4) 0 var(--size-4-2) 0;
  }
  section:first-of-type {
    border-top: none;
    padding-top: 0;
  }

  section h3 {
    margin: 0 0 var(--size-4-2) 0;
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--size-4-1);
  }
  .section-head h3 {
    margin: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    margin-top: var(--size-4-3);
  }
  .field > span {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    margin-bottom: var(--size-4-1);
  }
  .field input,
  .field textarea {
    width: 100%;
  }
  .field textarea {
    font-family: var(--font-text);
    resize: vertical;
    min-height: 6em;
  }

  .row.two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--size-4-3);
  }
  .row.two-col .field {
    margin-top: var(--size-4-3);
  }

  .toggles {
    align-items: center;
    margin-top: var(--size-4-3);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    color: var(--text-normal);
    font-size: var(--font-ui-small);
  }
  .toggle input {
    margin: 0;
  }

  .creators {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-2);
    margin-top: var(--size-4-2);
  }
  .creator-row {
    display: flex;
    align-items: stretch;
    gap: var(--size-4-2);
    padding: var(--size-4-2);
    border: var(--border-width) solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    background: var(--background-secondary);
  }
  .creator-fields {
    display: grid;
    grid-template-columns: 1.2fr 1.6fr 1fr;
    gap: var(--size-4-2);
    flex: 1;
  }
  .creator-fields input {
    width: 100%;
  }
  .creator-actions {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: stretch;
    justify-content: center;
  }
  .creator-actions button {
    padding: var(--size-2-1) var(--size-4-2);
    line-height: 1;
    font-size: var(--font-ui-smaller);
    min-width: 1.8em;
  }

  button.ghost {
    background: transparent;
    color: var(--text-muted);
    box-shadow: none;
    border: var(--border-width) solid var(--background-modifier-border);
  }
  button.ghost:hover:not(:disabled) {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
  button.ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  button.ghost.danger:hover:not(:disabled) {
    color: var(--text-error);
    border-color: var(--text-error);
  }

  button.primary {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  button.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  footer {
    margin-top: var(--size-4-4);
    padding-top: var(--size-4-3);
    border-top: var(--border-width) solid var(--background-modifier-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--size-4-2);
  }
  footer .file-path {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;
  }
  footer .actions {
    display: flex;
    gap: var(--size-4-2);
  }

  .empty-state {
    text-align: center;
    padding: var(--size-4-6) var(--size-4-4);
  }
  .empty-state p {
    margin: 0 0 var(--size-4-2) 0;
  }
  .empty-state button.primary {
    margin-top: var(--size-4-3);
  }

  code {
    font-size: 0.9em;
  }
</style>
