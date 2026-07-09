<script lang="ts">
  // @ts-nocheck
  import { onMount, getContext } from "svelte";
  import { get } from "svelte/store";
  import { Component, MarkdownRenderer, Notice, Platform } from "obsidian";

  import { pluginSettings } from "src/model/stores";
  import { DEFAULT_ASSETS_DIR } from "src/compile/steps/pandoc-export-utils";
  import {
    fetchMarketIndex,
    fetchMarketReadme,
    installMarketBundle,
    installAssetWithDeps,
    readInstalledManifest,
    detectPresentIds,
  } from "src/model/pandoc-assets";
  import {
    DEFAULT_MARKET_INDEX_URL,
    installStateFor,
  } from "src/model/pandoc-market";
  import { useApp } from "../utils";
  import { t, locale } from "src/i18n";

  const app = useApp();
  const close: () => void = getContext("close");
  const refresh: () => void = getContext("refresh");
  const installWorkflows: (w: unknown[]) => Promise<string[]> =
    getContext("installWorkflows");

  const settings = get(pluginSettings);
  const indexUrl =
    (settings.pandocMarketIndexUrl || "").trim() || DEFAULT_MARKET_INDEX_URL;
  const destFolder =
    (settings.pandocAssetsFolder || "").trim() || DEFAULT_ASSETS_DIR;

  let loading = true;
  let error = "";
  let index = null;
  let manifest = {};
  let present = new Set();
  let query = "";
  let busy = {};

  async function load() {
    loading = true;
    error = "";
    try {
      index = await fetchMarketIndex(indexUrl, get(locale));
      manifest = await readInstalledManifest(app, destFolder);
      present = await detectPresentIds(app, index, destFolder);
    } catch (e) {
      error = String(e?.message ?? e);
    }
    loading = false;
  }
  onMount(load);

  // ── Asset detail ("how to use") ─────────────────────────────────────────
  let detail = null; // the asset/bundle whose README is shown, or null for the grid
  let readme = "";
  let readmeState = ""; // "loading" | "ok" | "none" | "error"

  async function openDetail(item) {
    detail = item;
    readme = "";
    if (!item.readmeUrl) {
      readmeState = "none";
      return;
    }
    readmeState = "loading";
    try {
      readme = await fetchMarketReadme(item.readmeUrl);
      readmeState = "ok";
    } catch (e) {
      readmeState = "error";
    }
  }

  // Svelte action: render markdown into a node via Obsidian's renderer.
  function renderMarkdown(node, md) {
    const comp = new Component();
    const draw = (m) => {
      node.innerHTML = "";
      if (m) MarkdownRenderer.renderMarkdown(m, node, "", comp);
    };
    draw(md);
    return { update: draw, destroy: () => comp.unload() };
  }

  function matches(x) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      `${x.name} ${x.description ?? ""} ${(x.tags ?? []).join(" ")} ${x.id}`
        .toLowerCase()
        .includes(q)
    );
  }

  // User-facing assets are recipes and CSL styles. Filters/templates/include
  // install automatically as a recipe's dependencies, so they aren't listed; CSL
  // is listed because recipes don't declare a csl dependency (it's injected via
  // --csl), so a style must be installable on its own.
  $: bundles = index ? index.bundles.filter(matches) : [];
  $: assets = index
    ? index.assets.filter(
        (a) => (a.type === "recipe" || a.type === "csl") && matches(a)
      )
    : [];

  const stateLabel = (s) =>
    s === "installed"
      ? $t("market.installed")
      : s === "update-available"
      ? $t("market.update")
      : s === "present"
      ? $t("market.reinstall")
      : $t("market.install");
  const isPresent = (s) => s !== "not-installed";

  async function installBundle(b) {
    if (busy[b.id]) return;
    busy = { ...busy, [b.id]: true };
    const n = new Notice($t("market.installing") + " " + b.name, 0);
    try {
      const rec = await installMarketBundle(app, b, destFolder);
      manifest[rec.id] = rec;
      if (b.workflows?.length) {
        const added = await installWorkflows(b.workflows);
        if (added.length) new Notice(`+ ${added.join(", ")}`);
      }
      refresh();
      manifest = { ...manifest };
      new Notice($t("market.installedNotice") + " " + b.name);
    } catch (e) {
      new Notice($t("market.failed") + " " + String(e?.message ?? e));
    } finally {
      n.hide();
      busy = { ...busy, [b.id]: false };
    }
  }

  async function installAsset(a) {
    if (busy[a.id]) return;
    busy = { ...busy, [a.id]: true };
    const n = new Notice($t("market.installing") + " " + a.name, 0);
    try {
      const recs = await installAssetWithDeps(app, index, a.id, destFolder);
      for (const r of recs) manifest[r.id] = r;
      refresh();
      manifest = { ...manifest };
      const extra = recs.length - 1;
      new Notice(
        $t("market.installedNotice") +
          " " +
          a.name +
          (extra > 0 ? ` (+${extra})` : "")
      );
    } catch (e) {
      new Notice($t("market.failed") + " " + String(e?.message ?? e));
    } finally {
      n.hide();
      busy = { ...busy, [a.id]: false };
    }
  }

  const assetName = (id) => index?.assets.find((a) => a.id === id)?.name ?? id;
</script>

<div class="market">
  <div class="market-header">
    <div class="market-heading">
      <span class="market-title">{$t("market.title")}</span>
      {#if index}
        <span class="market-count"
          >{index.bundles.length + index.assets.length} {$t("market.items")}</span
        >
      {/if}
    </div>
    <input
      class="market-search"
      type="text"
      placeholder={$t("market.search")}
      bind:value={query}
      disabled={!index}
    />
    <button class="market-reload" on:click={load} disabled={loading}>
      {$t("market.reload")}
    </button>
  </div>

  {#if !Platform.isDesktop}
    <div class="market-note">{$t("market.desktopNote")}</div>
  {/if}

  {#if loading}
    <div class="market-state"><span class="market-spinner"></span></div>
  {:else if error}
    <div class="market-state market-error">
      <p>{$t("market.loadError")}</p>
      <p class="market-error-detail">{error}</p>
      <button class="market-reload" on:click={load}>{$t("market.reload")}</button>
    </div>
  {:else if index && detail}
    {@const dstate = installStateFor(manifest, detail.id, detail.version, present)}
    <div class="detail">
      <button class="detail-back" on:click={() => (detail = null)}>
        ← {$t("market.back")}
      </button>
      <div class="detail-head">
        <span class="card-type type-{detail.type ?? 'bundle'}">
          {detail.type ?? "bundle"}
        </span>
        {#if isPresent(dstate)}<span class="installed-check" title={$t("market.installed")}>✓</span>{/if}
        <span class="detail-name">{detail.name}</span>
        <span class="card-version">v{detail.version}</span>
      </div>
      {#if detail.description}<p class="detail-desc">{detail.description}</p>{/if}
      {#if detail.reviewed === false}
        <div class="card-meta card-sysdep">⚠ {$t("market.unverified")}</div>
      {/if}
      {#if detail.requires?.length}
        <div class="card-meta">
          {$t("market.requires")}: {detail.requires.map(assetName).join(", ")}
        </div>
      {/if}
      {#if detail.systemDeps?.length}
        <div class="card-meta card-sysdep">
          {$t("market.systemDeps")}: {detail.systemDeps.join(", ")}
        </div>
      {/if}
      <div class="detail-readme">
        {#if readmeState === "loading"}
          <span class="market-spinner"></span>
        {:else if readmeState === "ok"}
          <div class="markdown-rendered" use:renderMarkdown={readme}></div>
        {:else if readmeState === "error"}
          <p class="card-meta card-sysdep">{$t("market.readmeError")}</p>
        {:else}
          <p class="card-meta">{$t("market.noReadme")}</p>
        {/if}
      </div>
      <div class="detail-actions">
        <button
          class="card-install"
          class:is-installed={dstate === "installed"}
          disabled={busy[detail.id] || dstate === "installed"}
          on:click={() =>
            detail.download ? installBundle(detail) : installAsset(detail)}
        >
          {busy[detail.id] ? $t("market.installing") : stateLabel(dstate)}
        </button>
      </div>
    </div>
  {:else if index}
    {#if bundles.length}
      <div class="market-section-title">{$t("market.bundles")}</div>
      <div class="market-grid">
        {#each bundles as b (b.id)}
          {@const state = installStateFor(manifest, b.id, b.version, present)}
          <div class="card card-bundle clickable" on:click={() => openDetail(b)}>
            <div class="card-top">
              {#if isPresent(state)}<span class="installed-check" title={$t("market.installed")}>✓</span>{/if}
              <span class="card-name">{b.name}</span>
              <span class="card-version">v{b.version}</span>
            </div>
            {#if b.description}<p class="card-desc">{b.description}</p>{/if}
            {#if b.assets?.length}
              <div class="card-meta">{b.assets.length} {$t("market.assetsIncluded")}</div>
            {/if}
            <div class="card-actions">
              <button
                class="card-install"
                class:is-installed={state === "installed"}
                disabled={busy[b.id] || state === "installed"}
                on:click|stopPropagation={() => installBundle(b)}
              >
                {busy[b.id] ? $t("market.installing") : stateLabel(state)}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if assets.length}
      <div class="market-section-title">{$t("market.assets")}</div>
      <div class="market-grid">
        {#each assets as a (a.id)}
          {@const state = installStateFor(manifest, a.id, a.version, present)}
          <div class="card clickable" on:click={() => openDetail(a)}>
            <div class="card-top">
              <span class="card-type type-{a.type}">{a.type}</span>
              {#if isPresent(state)}<span class="installed-check" title={$t("market.installed")}>✓</span>{/if}
              <span class="card-name">{a.name}</span>
              <span class="card-version">v{a.version}</span>
            </div>
            {#if a.description}<p class="card-desc">{a.description}</p>{/if}
            {#if a.reviewed === false}
              <div class="card-meta card-sysdep">⚠ {$t("market.unverified")}</div>
            {/if}
            {#if a.systemDeps?.length}
              <div class="card-meta card-sysdep">
                {$t("market.systemDeps")}: {a.systemDeps.join(", ")}
              </div>
            {/if}
            <div class="card-hint">{$t("market.clickForDetails")}</div>
            <div class="card-actions">
              <button
                class="card-install"
                class:is-installed={state === "installed"}
                disabled={busy[a.id] || state === "installed"}
                on:click|stopPropagation={() => installAsset(a)}
              >
                {busy[a.id] ? $t("market.installing") : stateLabel(state)}
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if !bundles.length && !assets.length}
      <div class="market-state">{$t("market.empty")}</div>
    {/if}
  {/if}
</div>

<style>
  .market {
    display: flex;
    flex-direction: column;
    gap: var(--size-4-2);
  }
  .market-header {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    padding-bottom: var(--size-4-2);
    border-bottom: 1px solid var(--background-modifier-border);
  }
  .market-heading {
    display: flex;
    align-items: baseline;
    gap: var(--size-2-3);
    margin-right: auto;
  }
  .market-title {
    font-weight: 700;
    font-size: var(--font-ui-large, 1.1em);
    color: var(--text-normal);
  }
  .market-count {
    font-size: var(--font-ui-smaller);
    color: var(--text-faint);
  }
  .market-search {
    flex: 1;
    max-width: 260px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    padding: 4px var(--size-2-3);
    color: var(--text-normal);
    font-size: var(--font-ui-smaller);
  }
  .market-reload {
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    padding: 4px var(--size-4-2);
    cursor: pointer;
  }
  .market-reload:hover:not(:disabled) {
    color: var(--text-normal);
    border-color: var(--text-accent);
  }
  .market-note {
    font-size: var(--font-smallest);
    color: var(--text-muted);
    background: var(--background-secondary);
    border-radius: var(--radius-s);
    padding: var(--size-2-2) var(--size-2-3);
  }
  .market-section-title {
    font-size: var(--font-ui-smaller);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin-top: var(--size-2-2);
  }
  .market-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: var(--size-2-3);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--size-2-2);
    padding: var(--size-4-2) var(--size-4-3);
    background: var(--background-secondary-alt);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m, 8px);
  }
  .card-bundle {
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, var(--background-modifier-border));
  }
  .card-top {
    display: flex;
    align-items: baseline;
    gap: var(--size-2-2);
    flex-wrap: wrap;
  }
  .card-name {
    font-weight: 600;
    color: var(--text-normal);
    font-size: var(--font-ui-small);
  }
  .card-version {
    margin-left: auto;
    font-size: var(--font-smallest);
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .card-type {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border-radius: var(--radius-s);
    color: var(--text-on-accent);
    background: var(--text-accent);
  }
  .type-filter { background: var(--color-green, #4caf7d); }
  .type-template { background: var(--color-orange, #e0883a); }
  .type-csl { background: var(--color-cyan, #3a9bd0); }
  .card-desc {
    margin: 0;
    font-size: var(--font-ui-smaller);
    color: var(--text-muted);
  }
  .card-meta {
    font-size: var(--font-smallest);
    color: var(--text-faint);
  }
  .card-sysdep {
    color: var(--text-warning, var(--text-muted));
  }
  .card-actions {
    margin-top: auto;
    display: flex;
    justify-content: flex-end;
  }
  .card-install {
    font-weight: 600;
    font-size: var(--font-ui-smaller);
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border: none;
    border-radius: var(--radius-s);
    padding: 4px var(--size-4-3);
    cursor: pointer;
    transition: background-color 0.15s;
  }
  .card-install:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }
  .card-install.is-installed {
    background: transparent;
    color: var(--interactive-success);
    border: 1px solid color-mix(in srgb, var(--interactive-success) 45%, transparent);
    cursor: default;
  }
  .card-install:disabled:not(.is-installed) {
    opacity: 0.6;
    cursor: default;
  }
  .installed-check {
    color: var(--interactive-success);
    font-weight: 800;
    font-size: var(--font-ui-smaller);
  }
  .clickable {
    cursor: pointer;
    transition: border-color 0.15s, transform 0.1s;
  }
  .clickable:hover {
    border-color: var(--text-accent);
  }
  .card-hint {
    font-size: var(--font-smallest);
    color: var(--text-faint);
    font-style: italic;
  }

  /* ── asset detail ("how to use") ── */
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--size-2-3);
  }
  .detail-back {
    align-self: flex-start;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px 0;
    font-size: var(--font-ui-smaller);
  }
  .detail-back:hover {
    color: var(--text-normal);
  }
  .detail-head {
    display: flex;
    align-items: baseline;
    gap: var(--size-2-2);
    flex-wrap: wrap;
  }
  .detail-name {
    font-weight: 700;
    font-size: var(--font-ui-large);
    color: var(--text-normal);
  }
  .detail-desc {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-ui-small);
  }
  .detail-readme {
    border-top: 1px solid var(--background-modifier-border);
    padding-top: var(--size-4-2);
    margin-top: var(--size-2-2);
    max-height: 52vh;
    overflow-y: auto;
  }
  .detail-readme :global(h1),
  .detail-readme :global(h2),
  .detail-readme :global(h3) {
    margin-top: var(--size-4-3);
  }
  .detail-readme :global(pre) {
    overflow-x: auto;
  }
  .detail-readme :global(img) {
    max-width: 100%;
  }
  .detail-actions {
    display: flex;
    justify-content: flex-end;
  }

  .market-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--size-2-2);
    padding: var(--size-4-6, 24px);
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
  }
  .market-error-detail {
    font-size: var(--font-smallest);
    color: var(--text-error);
    font-family: var(--font-monospace);
    word-break: break-word;
  }
  .market-spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 3px solid var(--background-modifier-border);
    border-top-color: var(--text-accent);
    animation: market-spin 0.8s linear infinite;
  }
  @keyframes market-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .market-spinner {
      animation: none;
    }
  }
</style>
