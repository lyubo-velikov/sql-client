<script lang="ts">
  import DataGrid from './DataGrid.svelte'

  let { schema, table }: { schema: string; table: string } = $props()

  let rows = $state<Record<string, unknown>[]>([])
  let columns = $state<string[]>([])
  let totalCount = $state(0)
  let page = $state(1)
  let pageSize = $state(50)
  let loading = $state(false)
  let sortColumn = $state<string | undefined>(undefined)
  let sortDirection = $state<'asc' | 'desc' | undefined>(undefined)
  let error = $state<string | null>(null)
  let columnTypes = $state<Map<string, string>>(new Map())

  async function fetchSchema() {
    try {
      const result = await window.api.getTableSchema(schema, table)
      if (result.success && result.data) {
        columns = result.data.map((col) => col.column_name)
        const types = new Map<string, string>()
        for (const col of result.data) {
          types.set(col.column_name, col.data_type)
        }
        columnTypes = types
      }
    } catch (e) {
      console.error('Failed to fetch schema:', e)
    }
  }

  async function fetchData() {
    loading = true
    error = null
    try {
      const result = await window.api.getTableData({
        schema,
        table,
        page,
        pageSize,
        sortColumn,
        sortDirection
      })
      if (result.success && result.data) {
        rows = result.data.rows
        totalCount = result.data.totalCount
        // If columns not yet loaded from schema, derive from rows
        if (columns.length === 0 && rows.length > 0) {
          columns = Object.keys(rows[0])
        }
      } else {
        error = result.error ?? 'Failed to fetch data'
        rows = []
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      rows = []
    } finally {
      loading = false
    }
  }

  function handlePageChange(newPage: number) {
    page = newPage
  }

  function handleSort(column: string, direction: 'asc' | 'desc') {
    sortColumn = column
    sortDirection = direction
    page = 1
  }

  function handlePageSizeChange(newSize: number) {
    pageSize = newSize
  }

  function refresh() {
    fetchData()
  }

  // Fetch schema and data whenever schema/table changes
  $effect(() => {
    // Capture the props to track them
    const _s = schema
    const _t = table
    // Reset state
    page = 1
    sortColumn = undefined
    sortDirection = undefined
    rows = []
    columns = []
    totalCount = 0
    error = null
    // Fetch
    fetchSchema()
    fetchData()
  })

  // Refetch data when page, pageSize, sort changes
  $effect(() => {
    // Track reactive deps
    const _p = page
    const _ps = pageSize
    const _sc = sortColumn
    const _sd = sortDirection
    fetchData()
  })
</script>

<div class="flex flex-col h-full">
  <!-- Toolbar -->
  <div class="flex items-center gap-3 px-3 py-2 bg-surface-secondary border-b border-border-primary flex-shrink-0">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
      </svg>
      <span class="text-text-secondary text-xs font-mono">{schema}.</span>
      <span class="text-text-primary text-sm font-semibold">{table}</span>
    </div>

    {#if totalCount > 0}
      <span class="text-text-muted text-xs">
        {totalCount.toLocaleString()} rows
      </span>
    {/if}

    <div class="flex-1"></div>

    <button
      class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-text-secondary
        hover:text-text-primary hover:bg-surface-hover transition-colors"
      onclick={refresh}
      title="Refresh data"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 14.652" />
      </svg>
      Refresh
    </button>
  </div>

  <!-- Error banner -->
  {#if error}
    <div class="px-3 py-2 bg-red-900/20 border-b border-red-800/30 text-red-400 text-xs flex items-center gap-2">
      <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <span>{error}</span>
    </div>
  {/if}

  <!-- Data grid -->
  <div class="flex-1 min-h-0">
    <DataGrid
      {rows}
      {columns}
      {totalCount}
      {page}
      {pageSize}
      {loading}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
      onSort={handleSort}
      {sortColumn}
      {sortDirection}
    />
  </div>
</div>
