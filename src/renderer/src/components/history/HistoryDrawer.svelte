<script lang="ts">
  import { onMount } from 'svelte'
  import { historyStore } from '../../stores/history.svelte'
  import { tabStore } from '../../stores/tabs.svelte'
  import type { UndoData } from '../../../../shared/types'
  import UndoConfirmDialog from './UndoConfirmDialog.svelte'

  let { open = $bindable(false) } = $props<{ open?: boolean }>()

  let drawerHeight = $state(280)
  let isDragging = $state(false)
  let expandedId = $state<string | null>(null)
  let undoDialogOpen = $state(false)
  let undoDialogData = $state<UndoData | null>(null)
  let searchInput = $state('')
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let copiedId = $state<string | null>(null)
  let activeFilter = $state<'all' | 'manual' | 'transaction' | 'errors'>('all')

  let filteredEntries = $derived.by(() => {
    let entries = historyStore.entries
    switch (activeFilter) {
      case 'manual': return entries.filter((e) => e.source === 'manual')
      case 'transaction': return entries.filter((e) => e.source === 'transaction')
      case 'errors': return entries.filter((e) => e.status === 'error')
      default: return entries
    }
  })

  onMount(() => {
    if (open) historyStore.refresh()
  })

  $effect(() => {
    if (open) historyStore.refresh()
  })

  function handleDragStart(e: MouseEvent) {
    e.preventDefault()
    isDragging = true
    const startY = e.clientY
    const startHeight = drawerHeight

    function onMove(e: MouseEvent) {
      const delta = startY - e.clientY
      drawerHeight = Math.max(150, Math.min(startHeight + delta, window.innerHeight * 0.7))
    }
    function onUp() {
      isDragging = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleSearch() {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      historyStore.setSearch(searchInput)
    }, 300)
  }

  function formatTime(ts: number): string {
    const diff = Date.now() - ts
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function formatDuration(ms: number): string {
    if (ms < 1) return '<1ms'
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  function truncateSql(sql: string): string {
    const first = sql.split('\n')[0].trim()
    return first.length > 100 ? first.slice(0, 97) + '...' : first
  }

  async function copySql(sql: string, id: string) {
    try {
      await navigator.clipboard.writeText(sql)
      copiedId = id
      setTimeout(() => { copiedId = null }, 1500)
    } catch { /* ignore */ }
  }

  function runAgain(sql: string) {
    tabStore.addTab({
      type: 'query',
      title: 'Query (history)',
      query: sql
    })
    open = false
  }

  function exportHistory() {
    const entries = historyStore.entries
    if (entries.length === 0) return

    const lines = entries.map((e) => {
      const date = new Date(e.timestamp).toISOString()
      const status = e.status === 'success' ? 'OK' : 'ERROR'
      const dur = `${e.duration}ms`
      const rows = e.affectedRows !== undefined ? `, ${e.affectedRows} rows` : ''
      return `-- [${date}] ${status} (${dur}${rows}) [${e.database}]\n${e.sql};\n`
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-history-${new Date().toISOString().slice(0, 10)}.sql`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id
  }

  function openUndoDialog(data: UndoData) {
    // Deep-clone to strip Svelte reactive proxies
    undoDialogData = JSON.parse(JSON.stringify(data))
    undoDialogOpen = true
  }
</script>

{#if open}
  <div
    class="flex flex-col border-t border-border-primary bg-surface-primary shrink-0"
    style="height: {drawerHeight}px;"
  >
    <!-- Drag handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="h-1.5 cursor-row-resize flex-shrink-0 hover:bg-accent/20 transition-colors {isDragging ? 'bg-accent/30' : 'bg-surface-secondary'}"
      onmousedown={handleDragStart}
    ></div>

    <!-- Header -->
    <div class="flex items-center gap-3 px-3 py-1.5 bg-surface-secondary border-b border-border-primary flex-shrink-0">
      <span class="text-xs font-semibold text-text-secondary uppercase tracking-wider">History</span>
      {#if historyStore.total > 0}
        <span class="text-[10px] text-text-muted">{historyStore.total} entries</span>
      {/if}

      <!-- Filter chips -->
      <div class="flex items-center gap-1">
        {#each [['all', 'All'], ['manual', 'SQL'], ['transaction', 'TXN'], ['errors', 'Errors']] as [key, label]}
          <button
            class="px-1.5 py-0.5 rounded text-[10px] transition-colors
              {activeFilter === key
                ? 'bg-accent/20 text-accent'
                : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'}"
            onclick={() => { activeFilter = key as typeof activeFilter }}
          >{label}</button>
        {/each}
      </div>

      <div class="flex-1"></div>

      <!-- Search -->
      <div class="relative">
        <svg class="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          class="pl-6 pr-2 py-1 text-[11px] bg-surface-tertiary border border-border-primary rounded
                 text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 w-48"
          placeholder="Search queries..."
          bind:value={searchInput}
          oninput={handleSearch}
        />
      </div>

      <button
        class="text-[11px] text-text-muted hover:text-accent transition-colors"
        onclick={exportHistory}
        title="Export history as .sql file"
      >
        Export
      </button>

      <button
        class="text-[11px] text-text-muted hover:text-red-400 transition-colors"
        onclick={() => { historyStore.clear() }}
        title="Clear all history"
      >
        Clear
      </button>

      <button
        class="p-1 text-text-muted hover:text-text-primary transition-colors"
        onclick={() => { open = false }}
        title="Close history"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Entry list -->
    <div class="flex-1 overflow-y-auto min-h-0">
      {#if historyStore.loading}
        <div class="flex items-center justify-center h-full text-text-muted text-xs">Loading...</div>
      {:else if filteredEntries.length === 0}
        <div class="flex items-center justify-center h-full text-text-muted text-xs">
          {historyStore.entries.length === 0 ? 'No history yet' : 'No matching entries'}
        </div>
      {:else}
        {#each filteredEntries as entry (entry.id)}
          {@const isExpanded = expandedId === entry.id}
          {@const stmtCount = entry.source === 'transaction' ? entry.sql.split(';\n').filter(s => s.trim()).length : 0}
          <div class="border-b border-border-primary/50">
            <!-- Summary row -->
            <button
              class="flex items-center gap-2.5 w-full px-3 py-1.5 text-left hover:bg-surface-hover/50 transition-colors"
              onclick={() => toggleExpand(entry.id)}
            >
              <!-- Status dot -->
              <div class="w-1.5 h-1.5 rounded-full shrink-0 {entry.status === 'success' ? 'bg-green-400' : 'bg-red-400'}"></div>

              <!-- Source badge -->
              <span class="text-[9px] uppercase tracking-wider px-1 py-0 rounded shrink-0
                {entry.source === 'transaction' ? 'bg-amber-900/30 text-amber-400' : 'bg-blue-900/30 text-blue-400'}">
                {entry.source === 'transaction' ? 'TXN' : 'SQL'}
              </span>

              <!-- SQL preview -->
              <span class="text-xs text-text-primary font-mono truncate flex-1">{truncateSql(entry.sql)}</span>

              <!-- Statement count for multi-statement transactions -->
              {#if stmtCount > 1}
                <span class="text-[10px] bg-surface-tertiary text-text-muted px-1 rounded shrink-0">{stmtCount} stmts</span>
              {/if}

              <!-- Metadata -->
              {#if entry.affectedRows !== undefined && entry.affectedRows > 0}
                <span class="text-[10px] text-text-muted shrink-0">{entry.affectedRows} rows</span>
              {/if}
              <span class="text-[10px] text-text-muted shrink-0 tabular-nums">{formatDuration(entry.duration)}</span>
              <span class="text-[10px] text-text-muted shrink-0 w-16 text-right">{formatTime(entry.timestamp)}</span>

              <!-- Expand indicator -->
              <svg class="w-3 h-3 text-text-muted shrink-0 transition-transform {isExpanded ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            <!-- Expanded detail -->
            {#if isExpanded}
              <div class="px-3 pb-2 pt-0.5">
                {#if entry.error}
                  <div class="mb-1.5 px-2 py-1 bg-red-900/20 rounded text-red-400 text-[11px]">{entry.error}</div>
                {/if}
                {#if stmtCount > 1}
                  <div class="bg-surface-tertiary rounded overflow-hidden max-h-40 overflow-y-auto">
                    {#each entry.sql.split(';\n').filter(s => s.trim()) as stmt, i}
                      <div class="px-2 py-1.5 {i > 0 ? 'border-t border-border-primary/30' : ''}">
                        <span class="text-[10px] text-text-muted mr-1.5">{i + 1}.</span>
                        <span class="text-[11px] font-mono text-text-secondary">{stmt.trim()}</span>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <pre class="text-[11px] font-mono text-text-secondary bg-surface-tertiary rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">{entry.sql}</pre>
                {/if}
                <div class="flex items-center gap-2 mt-1.5">
                  <button
                    class="text-[11px] text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
                    onclick={() => copySql(entry.sql, entry.id)}
                  >
                    {#if copiedId === entry.id}
                      Copied!
                    {:else}
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      Copy
                    {/if}
                  </button>
                  <button
                    class="text-[11px] text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1"
                    onclick={() => runAgain(entry.sql)}
                  >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    Run again
                  </button>
                  {#if entry.undoData && entry.undoData.operations.length > 0}
                    <button
                      class="text-[11px] text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
                      onclick={() => openUndoDialog(entry.undoData!)}
                    >
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/>
                      </svg>
                      Undo
                    </button>
                  {/if}
                  <span class="text-[10px] text-text-muted ml-auto">{entry.database} &middot; {new Date(entry.timestamp).toLocaleString()}</span>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<UndoConfirmDialog bind:open={undoDialogOpen} undoData={undoDialogData} />
