<script lang="ts">
  // @ts-nocheck
  import { get } from "svelte/store";
  import { getContext } from "svelte";
  import { Notice } from "obsidian";

  import {
    calculateWorkflow,
    compile,
    formatStepKind,
    explainStepKind,
    WorkflowError,
  } from "src/compile";
  import { CompileStepOptionType } from "src/compile/steps/abstract-compile-step";
  import {
    selectedProject,
    currentWorkflow,
    workflows,
    pandocTemplates,
  } from "src/model/stores";
  import { draftTitle } from "src/model/draft-utils";
  import { projectRootPath } from "src/model/project-resources";
  import { useApp } from "../../utils";
  import { t } from "src/i18n";
  import SortableList from "../../sortable/SortableList.svelte";
  import {
    applyBatchOverrides,
    cloneWorkflow,
    statusToRowState,
    draftAbbrev,
    rowProgress,
    IDLE_ROW,
  } from "./compile-matrix-utils";

  const app = useApp();
  const close: () => void = getContext("close");

  // Batch toggles (per-run; sensible batch defaults).
  let dryRun = false;
  let openAfter = false;
  let harvest = true;
  let running = false;

  const wfsSnapshot = get(workflows);
  const allWorkflowNames = Object.keys(wfsSnapshot).sort();

  // Resolve a (cloned, editable) workflow into the row fields the board renders:
  // node list + validity. Steps mirror `wf.steps`, so option edits keep them in sync.
  function resolveRow(draft, wf) {
    if (!wf) {
      return { steps: [], runnable: false, skipReason: "no workflow assigned" };
    }
    const [valid, kinds] = calculateWorkflow(wf, draft.format === "scenes");
    if (valid.error !== WorkflowError.Valid) {
      return { steps: [], runnable: false, skipReason: valid.error };
    }
    const steps = wf.steps.map((s, i) => ({
      name: s.description.name,
      kind: formatStepKind(kinds[i]),
      kindRaw: kinds[i],
    }));
    return { steps, runnable: true, skipReason: "" };
  }

  // Snapshot the project's drafts, resolving each to its default workflow. Each row
  // owns an editable clone of its workflow so per-step option edits and the workflow
  // picker stay local to this run and never touch the user's saved workflows.
  function buildRows() {
    const projectDrafts = get(selectedProject) ?? [];
    const cur = get(currentWorkflow);
    return projectDrafts.map((draft) => {
      const defaultName =
        (draft.workflow && wfsSnapshot[draft.workflow] ? draft.workflow : null) ??
        cur?.name ??
        allWorkflowNames[0] ??
        null;
      const source = defaultName ? wfsSnapshot[defaultName] : cur;
      const workflow = source ? cloneWorkflow(source) : null;
      return {
        id: draft.vaultPath,
        draft,
        title: draftTitle(draft),
        abbrev: draftAbbrev(draft.draftTitle || draft.title),
        workflowName: defaultName,
        workflow,
        openStep: -1,
        ...resolveRow(draft, workflow),
        state: { ...IDLE_ROW },
      };
    });
  }

  let rows = buildRows();
  $: anyRunnable = rows.some((r) => r.runnable);

  function selectWorkflow(row, name) {
    if (running) return;
    row.workflowName = name;
    row.workflow = wfsSnapshot[name] ? cloneWorkflow(wfsSnapshot[name]) : null;
    row.openStep = -1;
    row.state = { ...IDLE_ROW };
    Object.assign(row, resolveRow(row.draft, row.workflow));
    rows = rows;
  }

  function toggleStep(row, i) {
    row.openStep = row.openStep === i ? -1 : i;
    rows = rows;
  }

  // Slot `let:item` vars can't be `bind:`-ed in Svelte 3, so option inputs are
  // controlled: write straight into the row's cloned workflow and re-render.
  function setOption(row, stepIndex, optionId, value) {
    row.workflow.steps[stepIndex].optionValues[optionId] = value;
    rows = rows;
  }

  function onReorder(e) {
    rows = e.detail;
  }

  function nodeClass(state, i) {
    if (state.status === "error") {
      if (i === state.activeStep) return "is-error";
      if (i < state.activeStep) return "is-done";
      return "is-pending";
    }
    if (state.status === "done") return "is-done";
    if (state.status === "running") {
      if (i < state.activeStep) return "is-done";
      if (i === state.activeStep) return "is-active";
    }
    return "is-pending";
  }

  async function run() {
    if (running || !anyRunnable) return;
    running = true;
    const projectRoot = projectRootPath(rows.map((r) => r.draft));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.runnable) {
        row.state = { status: "skipped", activeStep: -1, error: row.skipReason };
        rows = rows;
        continue;
      }
      // Batch toggles win over per-step edits for their specific options; every
      // other manual edit on the row's cloned workflow is preserved.
      const wf = applyBatchOverrides(row.workflow, { dryRun, openAfter, harvest });
      const [, kinds] = calculateWorkflow(wf, row.draft.format === "scenes");
      try {
        await compile(
          app,
          row.draft,
          wf,
          kinds,
          (status) => {
            row.state = statusToRowState(status, row.state);
            rows = rows;
          },
          { suppressOpenAfter: !openAfter, projectRoot }
        );
      } catch (e) {
        row.state = { ...row.state, status: "error", error: String(e?.message ?? e) };
        rows = rows;
      }
    }

    running = false;
    const ok = rows.filter((r) => r.state.status === "done").length;
    new Notice(`Compiled ${ok} draft${ok === 1 ? "" : "s"}.`);
  }

  $: sortableOptions = {
    handle: ".matrix-drag",
    animation: 150,
    disabled: running,
  };
</script>

<div class="matrix">
  <div class="matrix-header">
    <div class="matrix-heading">
      <span class="matrix-title">{$t("matrix.title")}</span>
      <span class="matrix-count">{rows.length} {$t("matrix.drafts")}</span>
    </div>
    <div class="matrix-batch">
      <label class="batch-toggle" class:on={dryRun}>
        <input type="checkbox" bind:checked={dryRun} disabled={running} />
        {$t("matrix.dryRun")}
      </label>
      <label class="batch-toggle" class:on={openAfter}>
        <input type="checkbox" bind:checked={openAfter} disabled={running} />
        {$t("matrix.openPdf")}
      </label>
      <label class="batch-toggle" class:on={harvest}>
        <input type="checkbox" bind:checked={harvest} disabled={running} />
        {$t("matrix.harvest")}
      </label>
    </div>
    <button class="matrix-run" on:click={run} disabled={running || !anyRunnable}>
      {running ? $t("matrix.running") : $t("matrix.run")}
    </button>
  </div>

  <div class="matrix-hint">{$t("matrix.reorderHint")}</div>

  <SortableList items={rows} {sortableOptions} on:orderChanged={onReorder} let:item>
    <div
      class="matrix-row status-{item.state.status}"
      class:not-runnable={!item.runnable}
      style="animation-delay: {rows.indexOf(item) * 45}ms"
    >
      <div class="matrix-drag" title={$t("matrix.reorderHint")} aria-label="Reorder">⋮⋮</div>

      <div class="matrix-draft">
        <div class="matrix-draft-head">
          <span class="matrix-abbrev">{item.abbrev}</span>
          <span class="matrix-name" title={item.title}>{item.title}</span>
        </div>
        <select
          class="matrix-workflow"
          disabled={running}
          value={item.workflowName}
          on:change={(e) => selectWorkflow(item, e.currentTarget.value)}
          title={$t("matrix.workflow")}
        >
          {#each allWorkflowNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </div>

      <div class="matrix-progress">
        <div class="matrix-runway">
          {#if item.runnable}
            <div class="runway-track"></div>
            <div
              class="runway-fill"
              style="transform: scaleX({rowProgress(item.state, item.steps.length)})"
            ></div>
            <div class="runway-nodes">
              {#each item.steps as s, i}
                <button
                  type="button"
                  class="node {nodeClass(item.state, i)}"
                  class:is-open={item.openStep === i}
                  title={s.name}
                  aria-label={s.name}
                  aria-expanded={item.openStep === i}
                  on:click={() => toggleStep(item, i)}
                >
                  {#if nodeClass(item.state, i) === "is-active"}
                    <span class="node-spinner"></span>
                  {:else if nodeClass(item.state, i) === "is-done"}
                    <span class="node-glyph">✓</span>
                  {:else if nodeClass(item.state, i) === "is-error"}
                    <span class="node-glyph">✕</span>
                  {/if}
                </button>
              {/each}
            </div>
            <div class="runway-arrow">→</div>
          {:else}
            <div class="matrix-skip" title={item.skipReason}>
              {$t("matrix.skipped")} — {item.skipReason}
            </div>
          {/if}
        </div>
        {#if item.runnable}
          <!-- Fixed caption: never jumps to the active node, so fast early steps
               don't make it flicker across the runway. -->
          <div class="runway-caption">
            {#if item.state.status === "running" && item.steps[item.state.activeStep]}
              <span class="caption-counter"
                >{item.state.activeStep + 1}/{item.steps.length}</span
              >
              <span class="caption-name">{item.steps[item.state.activeStep].name}</span>
            {:else if item.state.status === "done"}
              <span class="caption-name">{$t("matrix.finished")}</span>
            {:else if item.state.status === "error"}
              <span class="caption-name caption-error"
                >{item.steps[item.state.activeStep]?.name ?? ""} — {item.state.error}</span
              >
            {:else}
              <span class="caption-hint">{$t("matrix.clickStepHint")}</span>
            {/if}
          </div>
        {/if}
      </div>

      <div class="matrix-status" aria-label={item.state.status}>
        {#if item.state.status === "running"}
          <span class="status-spinner"></span>
        {:else if item.state.status === "done"}
          <span class="status-done">✓</span>
        {:else if item.state.status === "error"}
          <span class="status-error" title={item.state.error}>✕</span>
        {:else if item.state.status === "skipped"}
          <span class="status-skip">–</span>
        {/if}
      </div>
    </div>

    {#if item.runnable && item.openStep >= 0 && item.workflow.steps[item.openStep]}
      {@const step = item.workflow.steps[item.openStep]}
      <div class="step-editor">
        <div class="step-editor-head">
          <h4>
            <span class="step-editor-ord">{item.openStep + 1}</span>
            {step.description.name}
          </h4>
          <span class="step-editor-kind" title={explainStepKind(item.steps[item.openStep]?.kindRaw)}>
            {item.steps[item.openStep]?.kind}
          </span>
          <button class="step-editor-close" title="Close" on:click={() => toggleStep(item, item.openStep)}>✕</button>
        </div>
        <p class="step-editor-desc">{step.description.description}</p>
        {#if step.description.options.length > 0}
          <div class="step-editor-options">
            {#each step.description.options as option}
              <div class="step-editor-option">
                {#if option.type === CompileStepOptionType.Text}
                  <label for={step.id + "-" + option.id}>{option.name}</label>
                  <input
                    id={step.id + "-" + option.id}
                    type="text"
                    disabled={running}
                    placeholder={String(option.default ?? "").replace(/\n/g, "\\n")}
                    value={step.optionValues[option.id] ?? ""}
                    on:input={(e) =>
                      setOption(item, item.openStep, option.id, e.currentTarget.value)}
                  />
                {:else if option.type === CompileStepOptionType.MultilineText}
                  <label for={step.id + "-" + option.id}>{option.name}</label>
                  <textarea
                    id={step.id + "-" + option.id}
                    disabled={running}
                    placeholder="key: value"
                    value={step.optionValues[option.id] ?? ""}
                    on:input={(e) =>
                      setOption(item, item.openStep, option.id, e.currentTarget.value)}
                  />
                {:else if option.type === CompileStepOptionType.Dropdown}
                  <label for={step.id + "-" + option.id}>{option.name}</label>
                  <select
                    id={step.id + "-" + option.id}
                    disabled={running}
                    value={step.optionValues[option.id] ?? ""}
                    on:change={(e) =>
                      setOption(item, item.openStep, option.id, e.currentTarget.value)}
                  >
                    <option value="">{option.emptyLabel ?? "(default)"}</option>
                    {#each option.dynamicChoices === "pandoc-templates" ? $pandocTemplates : option.choices ?? [] as choice}
                      <option value={choice}>{choice}</option>
                    {/each}
                  </select>
                {:else}
                  <div class="step-editor-checkbox">
                    <input
                      id={step.id + "-" + option.id}
                      type="checkbox"
                      disabled={running}
                      checked={!!step.optionValues[option.id]}
                      on:change={(e) =>
                        setOption(item, item.openStep, option.id, e.currentTarget.checked)}
                    />
                    <label for={step.id + "-" + option.id}>{option.name}</label>
                  </div>
                {/if}
                <p class="step-editor-option-desc">{option.description}</p>
              </div>
            {/each}
          </div>
        {:else}
          <p class="step-editor-noopts">{$t("matrix.noOptions")}</p>
        {/if}
      </div>
    {/if}
  </SortableList>
</div>

<style>
  .matrix {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-2);
  }

  /* ── header ── */
  .matrix-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--size-4-3);
    padding-bottom: var(--size-4-2);
    border-bottom: 1px solid var(--background-modifier-border);
  }
  .matrix-heading {
    display: flex;
    align-items: baseline;
    gap: var(--size-4-2);
    margin-right: auto;
  }
  .matrix-title {
    font-weight: 700;
    font-size: var(--font-ui-large, 1.1em);
    color: var(--text-normal);
  }
  .matrix-count {
    font-size: var(--font-ui-smaller);
    color: var(--text-faint);
  }
  .matrix-batch {
    display: flex;
    gap: var(--size-2-2);
    flex-wrap: wrap;
  }
  .batch-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--size-2-1);
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    padding: 2px var(--size-2-3);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-l);
    cursor: pointer;
    user-select: none;
    transition: color 0.15s, border-color 0.15s, background-color 0.15s;
  }
  .batch-toggle.on {
    color: var(--text-accent);
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
  }
  .batch-toggle input {
    margin: 0;
  }
  .matrix-run {
    font-weight: 700;
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border: none;
    border-radius: var(--radius-s);
    padding: var(--size-2-2) var(--size-4-4);
    cursor: pointer;
    transition: background-color 0.15s, transform 0.1s;
  }
  .matrix-run:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }
  .matrix-run:active:not(:disabled) {
    transform: translateY(1px);
  }
  .matrix-run:disabled {
    background: var(--background-modifier-border);
    color: var(--text-faint);
    cursor: default;
  }
  .matrix-hint {
    font-size: var(--font-smallest);
    color: var(--text-faint);
    margin-top: calc(-1 * var(--size-2-1));
  }

  /* ── rows ── */
  :global(.matrix ul) {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .matrix-row {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    padding: var(--size-4-2) var(--size-4-1);
    border-radius: var(--radius-m, 8px);
    background: var(--background-secondary-alt);
    border: 1px solid transparent;
    margin-bottom: var(--size-2-3);
    animation: matrix-in 0.32s cubic-bezier(0.2, 0.7, 0.2, 1) both;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .matrix-row.status-running {
    border-color: color-mix(in srgb, var(--interactive-accent) 55%, transparent);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--interactive-accent) 25%, transparent);
  }
  .matrix-row.status-done {
    border-color: color-mix(in srgb, var(--interactive-success) 45%, transparent);
  }
  .matrix-row.status-error {
    border-color: color-mix(in srgb, var(--text-error) 55%, transparent);
  }
  .matrix-row.not-runnable {
    opacity: 0.55;
  }

  .matrix-drag {
    cursor: grab;
    color: var(--text-faint);
    letter-spacing: -3px;
    padding: 0 var(--size-2-1);
    line-height: 1;
    user-select: none;
  }
  .matrix-drag:hover {
    color: var(--text-muted);
  }

  .matrix-draft {
    display: flex;
    flex-direction: column;
    gap: var(--size-2-1);
    width: 200px;
    min-width: 200px;
  }
  .matrix-draft-head {
    display: flex;
    align-items: center;
    gap: var(--size-2-3);
  }
  .matrix-workflow {
    max-width: 100%;
    font-size: var(--font-smallest);
    color: var(--text-muted);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    padding: 1px var(--size-2-2);
    cursor: pointer;
  }
  .matrix-workflow:disabled {
    cursor: default;
    opacity: 0.7;
  }
  .matrix-abbrev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.1em;
    height: 1.7em;
    padding: 0 var(--size-2-2);
    font-size: var(--font-smallest);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-on-accent);
    background: color-mix(
      in srgb,
      var(--text-accent) 55%,
      var(--background-modifier-border) 45%
    );
    border-radius: var(--radius-s);
  }
  .matrix-name {
    color: var(--text-normal);
    font-size: var(--font-ui-smaller);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── the runway ── */
  .matrix-progress {
    flex: 1;
    min-width: 160px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .matrix-runway {
    position: relative;
    min-width: 160px;
    height: 28px;
    display: flex;
    align-items: center;
    padding: 0 var(--size-4-2);
  }
  .runway-track {
    position: absolute;
    left: var(--size-4-2);
    right: var(--size-4-4);
    top: 50%;
    height: 2px;
    transform: translateY(-50%);
    background: var(--background-modifier-border);
    border-radius: 2px;
  }
  .runway-fill {
    position: absolute;
    left: var(--size-4-2);
    right: var(--size-4-4);
    top: 50%;
    height: 2px;
    transform-origin: left center;
    transform: translateY(-50%) scaleX(0);
    background: var(--interactive-accent);
    border-radius: 2px;
    transition: transform 0.4s cubic-bezier(0.3, 0.7, 0.3, 1);
  }
  .runway-nodes {
    position: relative;
    z-index: 1;
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .node {
    width: 16px;
    height: 16px;
    padding: 0;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: var(--background-primary);
    border: 2px solid var(--background-modifier-border);
    cursor: pointer;
    transition: background-color 0.2s, border-color 0.2s, transform 0.2s,
      box-shadow 0.2s;
  }
  .node:hover {
    border-color: var(--text-accent);
    transform: scale(1.15);
  }
  .node.is-open {
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--text-accent) 60%, transparent);
  }
  .node:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--text-accent);
  }
  .node.is-done {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    animation: node-pop 0.25s ease;
  }
  .node.is-active {
    border-color: var(--text-accent);
    background: var(--background-primary);
    animation: node-pulse 1.4s ease-in-out infinite;
  }
  .node.is-error {
    background: var(--text-error);
    border-color: var(--text-error);
  }
  .node-glyph {
    font-size: 9px;
    line-height: 1;
    color: var(--text-on-accent);
    font-weight: 800;
  }
  .node-spinner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: var(--text-accent);
    border-right-color: var(--text-accent);
    animation: matrix-spin 0.7s linear infinite;
  }
  .runway-arrow {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-faint);
    font-size: 1.1em;
    line-height: 1;
  }
  /* fixed caption under the runway — always left-anchored, never jumps */
  .runway-caption {
    display: flex;
    align-items: baseline;
    gap: var(--size-2-2);
    min-height: 1.1em;
    padding: 0 var(--size-4-2);
    font-size: var(--font-smallest);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .caption-counter {
    flex: none;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    color: var(--text-accent);
  }
  .caption-name {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .caption-error {
    color: var(--text-error);
  }
  .caption-hint {
    color: var(--text-faint);
    font-style: italic;
  }
  .matrix-skip {
    font-size: var(--font-ui-smaller);
    color: var(--text-faint);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── status column ── */
  .matrix-status {
    width: 24px;
    min-width: 24px;
    text-align: center;
    font-weight: 800;
  }
  .status-done {
    color: var(--interactive-success);
  }
  .status-error {
    color: var(--text-error);
  }
  .status-skip {
    color: var(--text-faint);
  }
  .status-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--background-modifier-border);
    border-top-color: var(--text-accent);
    animation: matrix-spin 0.7s linear infinite;
  }

  /* ── per-step editor (opens under a row when a node is clicked) ── */
  .step-editor {
    margin: calc(-1 * var(--size-2-2)) 0 var(--size-2-3) 0;
    padding: var(--size-4-2) var(--size-4-3);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-top: 2px solid var(--interactive-accent);
    border-radius: 0 0 var(--radius-m, 8px) var(--radius-m, 8px);
    animation: step-editor-in 0.2s ease both;
  }
  .step-editor-head {
    display: flex;
    align-items: center;
    gap: var(--size-2-3);
  }
  .step-editor-head h4 {
    margin: 0;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    display: flex;
    align-items: center;
    gap: var(--size-2-2);
  }
  .step-editor-ord {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5em;
    height: 1.5em;
    font-size: var(--font-smallest);
    font-weight: 700;
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border-radius: 50%;
  }
  .step-editor-kind {
    font-size: var(--font-smallest);
    color: var(--text-muted);
    padding: 1px var(--size-2-2);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
  }
  .step-editor-close {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    padding: 2px var(--size-2-2);
    border-radius: var(--radius-s);
    font-weight: 700;
  }
  .step-editor-close:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
  .step-editor-desc {
    margin: var(--size-2-2) 0 var(--size-2-3) 0;
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }
  .step-editor-option {
    margin-bottom: var(--size-4-2);
  }
  .step-editor-option > label {
    display: block;
    font-size: var(--font-ui-smaller);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 2px;
  }
  .step-editor-option input[type="text"],
  .step-editor-option textarea,
  .step-editor-option select {
    width: 100%;
    box-sizing: border-box;
  }
  .step-editor-option textarea {
    min-height: 4.5em;
    resize: vertical;
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
  }
  .step-editor-checkbox {
    display: flex;
    align-items: center;
    gap: var(--size-2-2);
  }
  .step-editor-checkbox label {
    font-size: var(--font-ui-smaller);
    color: var(--text-normal);
  }
  .step-editor-option-desc {
    margin: 2px 0 0 0;
    font-size: var(--font-smallest);
    color: var(--text-faint);
  }
  .step-editor-noopts {
    margin: 0;
    font-size: var(--font-ui-smaller);
    color: var(--text-faint);
    font-style: italic;
  }
  @keyframes step-editor-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes matrix-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes matrix-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes node-pop {
    0% {
      transform: scale(0.6);
    }
    60% {
      transform: scale(1.25);
    }
    100% {
      transform: scale(1);
    }
  }
  @keyframes node-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0
        color-mix(in srgb, var(--text-accent) 45%, transparent);
    }
    50% {
      box-shadow: 0 0 0 5px transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .matrix-row,
    .node.is-done,
    .step-editor {
      animation: none;
    }
    .node:hover {
      transform: none;
    }
    .node.is-active {
      animation: none;
      border-color: var(--text-accent);
    }
    .node-spinner,
    .status-spinner {
      animation: none;
      border-top-color: var(--text-accent);
      border-right-color: var(--text-accent);
    }
    .runway-fill {
      transition: none;
    }
  }
</style>
