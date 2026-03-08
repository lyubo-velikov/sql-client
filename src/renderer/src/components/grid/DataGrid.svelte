<script lang="ts">
  let {
    rows = [],
    columns = [],
    totalCount = 0,
    page = 1,
    pageSize = 50,
    loading = false,
    onPageChange,
    onPageSizeChange,
    onSort,
    sortColumn = undefined,
    sortDirection = undefined
  }: {
    rows: Record<string, unknown>[]
    columns: string[]
    totalCount: number
    page: number
    pageSize: number
    loading: boolean
    onPageChange: (page: number) => void
    onPageSizeChange?: (pageSize: number) => void
    onSort: (column: string, direction: 'asc' | 'desc') => void
    sortColumn?: string
    sortDirection?: 'asc' | 'desc'
  } = $props()

  let selectedRow = $state<number | null>(null)
  let copiedCell = $state<{ row: number; col: string } | null>(null)

  let totalPages = $derived(Math.max(1, Math.ceil(totalCount / pageSize)))
  let startRow = $derived((page - 1) * pageSize + 1)
  let endRow = $derived(Math.min(page * pageSize, totalCount))

  const pageSizeOptions = [25, 50, 100, 500]

  function handleSort(column: string) {
    if (sortColumn === column) {
      onSort(column, sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(column, 'asc')
    }
  }

  function handlePageSizeChange(e: Event) {
    const target = e.target as HTMLSelectElement
    const newSize = parseInt(target.value, 10)
    onPageSizeChange?.(newSize)
    onPageChange(1)
  }

  function goToPage(p: number) {
    if (p >= 1 && p <= totalPages) {
      onPageChange(p)
    }
  }

  function formatCellValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'object') {
      if (value instanceof Date) {
        return value.toLocaleString()
      }
      try {
        const str = JSON.stringify(value)
        return str.length > 80 ? str.slice(0, 77) + '...' : str
      } catch {
        return String(value)
      }
    }
    const str = String(value)
    return str.length > 200 ? str.slice(0, 197) + '...' : str
  }

  function getFullValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  function getCellType(value: unknown): 'null' | 'boolean' | 'number' | 'json' | 'date' | 'string' {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'number' || typeof value === 'bigint') return 'number'
    if (value instanceof Date) return 'date'
    if (typeof value === 'object') return 'json'
    // Check if string looks like a date
    if (typeof value === 'string') {
      const datePattern = /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}/
      if (datePattern.test(value)) return 'date'
    }
    return 'string'
  }

  async function copyCell(row: number, col: string, value: unknown) {
    const text = getFullValue(value)
    try {
      await navigator.clipboard.writeText(text)
      copiedCell = { row, col }
      setTimeout(() => {
        copiedCell = null
      }, 1000)
    } catch {
      // Clipboard not available
    }
  }

  // Skeleton rows for loading state
  let skeletonRows = $derived(Array.from({ length: Math.min(pageSize, 15) }, (_, i) => i))
</script>

<div class="flex flex-col h-full bg-surface-primary">
  <!-- Table container -->
  <div class="flex-1 overflow-auto min-h-0">
    {#if loading}
      <!-- Loading skeleton -->
      <table class="w-full border-collapse">
        <thead class="sticky top-0 z-10">
          <tr class="bg-surface-secondary">
            <th class="datagrid-th w-12 text-center">#</th>
            {#each columns as col}
              <th class="datagrid-th">{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each skeletonRows as i}
            <tr class="border-b border-border-primary">
              <td class="datagrid-td text-center text-text-muted w-12">{i + 1}</td>
              {#each columns as _}
                <td class="datagrid-td">
                  <div class="h-3.5 bg-surface-tertiary rounded animate-pulse" style="width: {60 + Math.random() * 40}%"></div>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if rows.length === 0}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center h-full text-text-muted py-16">
        <svg class="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        <p class="text-sm">No data to display</p>
      </div>
    {:else}
      <!-- Data table -->
      <table class="w-full border-collapse">
        <thead class="sticky top-0 z-10">
          <tr class="bg-surface-secondary">
            <th class="datagrid-th w-12 text-center text-text-muted select-none">#</th>
            {#each columns as col}
              <th
                class="datagrid-th cursor-pointer select-none group"
                onclick={() => handleSort(col)}
                title="Click to sort by {col}"
              >
                <div class="flex items-center gap-1.5">
                  <span class="truncate">{col}</span>
                  {#if sortColumn === col}
                    <span class="text-accent text-[10px] flex-shrink-0">
                      {sortDirection === 'asc' ? '\u25B2' : '\u25BC'}
                    </span>
                  {:else}
                    <span class="text-text-muted text-[10px] opacity-0 group-hover:opacity-50 flex-shrink-0">\u25B2</span>
                  {/if}
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as row, rowIndex}
            <tr
              class="border-b border-border-primary transition-colors duration-75 cursor-default
                {selectedRow === rowIndex ? 'bg-surface-active' : rowIndex % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/30'}
                hover:bg-surface-hover"
              onclick={() => selectedRow = selectedRow === rowIndex ? null : rowIndex}
            >
              <td class="datagrid-td text-center text-text-muted w-12 select-none text-[11px]">
                {startRow + rowIndex}
              </td>
              {#each columns as col}
                {@const value = row[col]}
                {@const cellType = getCellType(value)}
                <td
                  class="datagrid-td font-mono relative
                    {cellType === 'number' ? 'text-right' : ''}
                    {copiedCell?.row === rowIndex && copiedCell?.col === col ? 'bg-accent/10' : ''}"
                  title={getFullValue(value)}
                  ondblclick={() => copyCell(rowIndex, col, value)}
                >
                  {#if cellType === 'null'}
                    <span class="italic text-text-muted text-xs">NULL</span>
                  {:else if cellType === 'boolean'}
                    <span class="inline-flex items-center px-1.5 py-0 rounded text-[11px] font-medium
                      {value ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}">
                      {value ? 'true' : 'false'}
                    </span>
                  {:else if cellType === 'json'}
                    <span class="text-amber-400/80 font-mono text-xs">{formatCellValue(value)}</span>
                  {:else if cellType === 'number'}
                    <span class="text-blue-400/80 tabular-nums">{formatCellValue(value)}</span>
                  {:else if cellType === 'date'}
                    <span class="text-purple-400/70">{formatCellValue(value)}</span>
                  {:else}
                    <span class="truncate block max-w-xs">{formatCellValue(value)}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <!-- Pagination bar -->
  {#if totalCount > 0 || loading}
    <div class="flex items-center justify-between px-3 py-1.5 bg-surface-secondary border-t border-border-primary text-xs text-text-secondary flex-shrink-0">
      <div class="flex items-center gap-2">
        <span>
          {#if loading}
            Loading...
          {:else}
            Showing {startRow.toLocaleString()}-{endRow.toLocaleString()} of {totalCount.toLocaleString()} rows
          {/if}
        </span>
      </div>

      <div class="flex items-center gap-3">
        <!-- Page size selector -->
        <div class="flex items-center gap-1.5">
          <span class="text-text-muted">Rows:</span>
          <select
            class="bg-surface-tertiary border border-border-primary rounded px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border-accent cursor-pointer"
            value={pageSize}
            onchange={handlePageSizeChange}
          >
            {#each pageSizeOptions as size}
              <option value={size} selected={size === pageSize}>{size}</option>
            {/each}
          </select>
        </div>

        <!-- Page navigation -->
        <div class="flex items-center gap-1">
          <button
            class="datagrid-page-btn"
            onclick={() => goToPage(1)}
            disabled={page <= 1 || loading}
            title="First page"
          >
            \u00AB
          </button>
          <button
            class="datagrid-page-btn"
            onclick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading}
            title="Previous page"
          >
            \u2039
          </button>
          <span class="px-2 text-text-primary tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            class="datagrid-page-btn"
            onclick={() => goToPage(page + 1)}
            disabled={page >= totalPages || loading}
            title="Next page"
          >
            \u203A
          </button>
          <button
            class="datagrid-page-btn"
            onclick={() => goToPage(totalPages)}
            disabled={page >= totalPages || loading}
            title="Last page"
          >
            \u00BB
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .datagrid-th {
    padding: 6px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-secondary);
    white-space: nowrap;
    position: sticky;
    top: 0;
    background: var(--color-surface-secondary);
    min-width: 80px;
  }

  .datagrid-td {
    padding: 4px 10px;
    font-size: 12px;
    line-height: 24px;
    height: 32px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 400px;
    color: var(--color-text-primary);
    vertical-align: middle;
  }

  .datagrid-page-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid var(--color-border-primary);
    background: var(--color-surface-tertiary);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.1s;
  }

  .datagrid-page-btn:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
    border-color: var(--color-border-secondary);
  }

  .datagrid-page-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  table {
    font-family: var(--font-mono);
  }
</style>
