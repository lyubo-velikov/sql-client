<script lang="ts">
  let {
    history,
    onSelect,
    onClear,
    onClose
  }: {
    history: Array<{ query: string; timestamp: number; success: boolean; rowCount?: number; duration?: number }>
    onSelect: (query: string) => void
    onClear: () => void
    onClose: () => void
  } = $props()

  function formatTimestamp(ts: number): string {
    const d = new Date(ts)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()

    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

    if (isToday) return time
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time
  }

  function truncateQuery(query: string, maxLen: number = 120): string {
    const normalized = query.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLen) return normalized
    return normalized.slice(0, maxLen - 3) + '...'
  }
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-10"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
></div>

<!-- Panel -->
<div class="relative z-20 w-80 h-full bg-surface-secondary border-l border-border-primary flex flex-col shadow-xl">
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2.5 border-b border-border-primary flex-shrink-0">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span class="text-sm font-medium text-text-primary">Query History</span>
      {#if history.length > 0}
        <span class="text-[10px] text-text-muted bg-surface-tertiary px-1.5 py-0.5 rounded">{history.length}</span>
      {/if}
    </div>

    <div class="flex items-center gap-1">
      {#if history.length > 0}
        <button
          class="p-1 rounded text-text-muted hover:text-red-400 hover:bg-surface-hover transition-colors"
          onclick={onClear}
          title="Clear history"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      {/if}
      <button
        class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
        onclick={onClose}
        title="Close"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- History list -->
  <div class="flex-1 overflow-y-auto min-h-0">
    {#if history.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-text-muted py-8">
        <svg class="w-8 h-8 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-xs">No queries yet</p>
      </div>
    {:else}
      {#each history as entry, i}
        <button
          class="w-full text-left px-3 py-2.5 border-b border-border-primary hover:bg-surface-hover transition-colors group cursor-pointer"
          onclick={() => onSelect(entry.query)}
          title={entry.query}
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] text-text-muted">{formatTimestamp(entry.timestamp)}</span>
            <div class="flex items-center gap-2">
              {#if entry.duration !== undefined}
                <span class="text-[10px] text-text-muted">{entry.duration}ms</span>
              {/if}
              {#if entry.success}
                <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              {:else}
                <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
              {/if}
            </div>
          </div>
          <p class="text-xs font-mono text-text-secondary group-hover:text-text-primary leading-relaxed transition-colors">
            {truncateQuery(entry.query)}
          </p>
          {#if entry.rowCount !== undefined}
            <span class="text-[10px] text-text-muted mt-1 block">{entry.rowCount} rows</span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>
