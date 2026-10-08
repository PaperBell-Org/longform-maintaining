<script lang="ts">
  /** The nearer metadata.json that overrides this field, if any (#47). */
  export let by: string | undefined;
</script>

{#if by}
  <span class="override-hint">Overridden by <code>{by}</code> for this draft.</span>
{/if}

<style>
  .override-hint {
    display: block;
    margin-top: 2px;
    color: var(--text-warning);
    font-size: var(--font-ui-smaller);
    line-height: var(--line-height-tight);
  }
</style>
