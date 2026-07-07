<script lang="ts">
  // @ts-nocheck
  import { get } from "svelte/store";
  import { getContext } from "svelte";
  import { Notice } from "obsidian";

  import {
    calculateWorkflow,
    compile,
    formatStepKind,
    WorkflowError,
  } from "src/compile";
  import {
    selectedProject,
    currentWorkflow,
    workflows,
  } from "src/model/stores";
  import { draftTitle } from "src/model/draft-utils";
  import { projectRootPath } from "src/model/project-resources";
  import { useApp } from "../../utils";
  import { t } from "src/i18n";
  import SortableList from "../../sortable/SortableList.svelte";
  import {
    applyBatchOverrides,
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

  // Snapshot the project's drafts + resolve each draft's workflow into rows.
  function buildRows() {
    const projectDrafts = get(selectedProject) ?? [];
    const wfs = get(workflows);
    const cur = get(currentWorkflow);
    return projectDrafts.map((draft) => {
      const wf = draft.workflow ? wfs[draft.workflow] : cur;
      let steps = [];
      let runnable = false;
      let skipReason = "";
      if (!wf) {
        skipReason = "no workflow assigned";
      } else {
        const [valid, kinds] = calculateWorkflow(wf, draft.format === "scenes");
        if (valid.error !== WorkflowError.Valid) {
          skipReason = valid.error;
        } else {
          runnable = true;
          steps = wf.steps.map((s, i) => ({
            name: s.description.name,
            kind: formatStepKind(kinds[i]),
          }));
        }
      }
      return {
        id: draft.vaultPath,
        draft,
        title: draftTitle(draft),
        abbrev: draftAbbrev(draft.draftTitle || draft.title),
        steps,
        runnable,
        skipReason,
        state: { ...IDLE_ROW },
      };
    });
  }

  let rows = buildRows();
  $: anyRunnable = rows.some((r) => r.runnable);

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
    const wfs = get(workflows);
    const cur = get(currentWorkflow);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.runnable) {
        row.state = { status: "skipped", activeStep: -1, error: row.skipReason };
        rows = rows;
        continue;
      }
      const base = row.draft.workflow ? wfs[row.draft.workflow] : cur;
      const wf = applyBatchOverrides(base, { dryRun, openAfter, harvest });
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
        <span class="matrix-abbrev">{item.abbrev}</span>
        <span class="matrix-name" title={item.title}>{item.title}</span>
      </div>

      <div class="matrix-runway">
        {#if item.runnable}
          <div class="runway-track"></div>
          <div
            class="runway-fill"
            style="transform: scaleX({rowProgress(item.state, item.steps.length)})"
          ></div>
          <div class="runway-nodes">
            {#each item.steps as s, i}
              <div class="node {nodeClass(item.state, i)}" title={s.name}>
                {#if nodeClass(item.state, i) === "is-active"}
                  <span class="node-spinner"></span>
                {:else if nodeClass(item.state, i) === "is-done"}
                  <span class="node-glyph">✓</span>
                {:else if nodeClass(item.state, i) === "is-error"}
                  <span class="node-glyph">✕</span>
                {/if}
              </div>
            {/each}
          </div>
          <div class="runway-arrow">→</div>
          {#if item.state.status === "running" && item.steps[item.state.activeStep]}
            <div
              class="active-label"
              style="left: {item.steps.length > 1
                ? (item.state.activeStep / (item.steps.length - 1)) * 100
                : 0}%"
            >
              {item.steps[item.state.activeStep].name}
            </div>
          {/if}
        {:else}
          <div class="matrix-skip" title={item.skipReason}>
            {$t("matrix.skipped")} — {item.skipReason}
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
    align-items: center;
    gap: var(--size-2-3);
    width: 190px;
    min-width: 190px;
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
  .matrix-runway {
    position: relative;
    flex: 1;
    min-width: 160px;
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 var(--size-4-2);
    margin-top: 8px; /* room for the active-step label */
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
    width: 14px;
    height: 14px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    background: var(--background-primary);
    border: 2px solid var(--background-modifier-border);
    transition: background-color 0.2s, border-color 0.2s, transform 0.2s;
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
    width: 14px;
    height: 14px;
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
  .active-label {
    position: absolute;
    top: -10px;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: var(--font-smallest);
    color: var(--text-accent);
    pointer-events: none;
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
    .node.is-done {
      animation: none;
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
