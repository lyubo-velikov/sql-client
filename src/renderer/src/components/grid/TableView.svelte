<script lang="ts">
  import { untrack } from 'svelte'
  import DataGrid from './DataGrid.svelte'
  import { tabStore } from '../../stores/tabs.svelte'
  import { createChangeBuffer } from '../../stores/changeBuffer.svelte'
  import { notificationStore } from '../../stores/notifications.svelte'
  import { buildUpdateStatements, buildInsertStatements, buildDeleteStatements } from '../../utils/sqlBuilder'

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
  let primaryKeyColumns = $state<string[]>([])
  let saving = $state(false)

  // Change buffer for tracking edits
  const changeBuffer = createChangeBuffer()

  let editable = $derived(primaryKeyColumns.length > 0)

  // Filter state
  interface Filter {
    column: string
    operator: string
    value: string
  }

  const OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL']
  const NULLARY_OPERATORS = ['IS NULL', 'IS NOT NULL']

  let filters = $state<Filter[]>([])
  let showFilters = $state(false)
  let filterDebounceTimer: ReturnType<typeof setTimeout> | undefined

  let activeFilterCount = $derived(
    filters.filter((f) => NULLARY_OPERATORS.includes(f.operator) || f.value.trim() !== '').length
  )

  function getActiveFilters(): Filter[] {
    return filters.filter((f) => NULLARY_OPERATORS.includes(f.operator) || f.value.trim() !== '')
  }

  function addFilter() {
    filters.push({
      column: columns[0] ?? '',
      operator: '=',
      value: ''
    })
    if (!showFilters) showFilters = true
  }

  function removeFilter(index: number) {
    filters.splice(index, 1)
    scheduleFilterRefetch()
  }

  function updateFilterColumn(index: number, column: string) {
    filters[index].column = column
    scheduleFilterRefetch()
  }

  function updateFilterOperator(index: number, operator: string) {
    filters[index].operator = operator
    if (NULLARY_OPERATORS.includes(operator)) {
      filters[index].value = ''
    }
    scheduleFilterRefetch()
  }

  function updateFilterValue(index: number, value: string) {
    filters[index].value = value
    scheduleFilterRefetch()
  }

  function clearFilters() {
    filters = []
    scheduleFilterRefetch()
  }

  function scheduleFilterRefetch() {
    clearTimeout(filterDebounceTimer)
    filterDebounceTimer = setTimeout(() => {
      page = 1
      pinActiveTab()
      fetchData()
    }, 400)
  }

  // Version counter to discard stale responses
  let fetchVersion = 0

  async function fetchSchema() {
    const targetSchema = schema
    const targetTable = table
    try {
      const result = await window.api.getTableSchema(targetSchema, targetTable)
      // Discard if table changed while awaiting
      if (schema !== targetSchema || table !== targetTable) return
      if (result.success && result.data) {
        columns = result.data.map((col) => col.column_name)
        const types = new Map<string, string>()
        const pks: string[] = []
        for (const col of result.data) {
          types.set(col.column_name, col.data_type)
          if (col.is_primary_key) pks.push(col.column_name)
        }
        columnTypes = types
        primaryKeyColumns = pks
      }
    } catch (e) {
      console.error('Failed to fetch schema:', e)
    }
  }

  async function fetchData() {
    const version = ++fetchVersion
    loading = true
    error = null
    try {
      const active = getActiveFilters()
      const result = await window.api.getTableData({
        schema,
        table,
        page,
        pageSize,
        sortColumn,
        sortDirection,
        filters: active.length > 0
          ? active.map((f) => ({ column: f.column, operator: f.operator, value: f.value }))
          : undefined
      })
      // Discard stale response
      if (version !== fetchVersion) return
      if (result.success && result.data) {
        rows = result.data.rows
        totalCount = result.data.totalCount
        if (columns.length === 0 && rows.length > 0) {
          columns = Object.keys(rows[0])
        }
      } else {
        error = result.error ?? 'Failed to fetch data'
        rows = []
      }
    } catch (e) {
      if (version !== fetchVersion) return
      error = e instanceof Error ? e.message : String(e)
      rows = []
    } finally {
      if (version === fetchVersion) loading = false
    }
  }

  function pinActiveTab() {
    if (tabStore.activeTabId) {
      tabStore.pinTab(tabStore.activeTabId)
    }
  }

  function handlePageChange(newPage: number) {
    if (changeBuffer.hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return
      changeBuffer.clearAll()
    }
    page = newPage
    pinActiveTab()
  }

  function handleSort(column: string, direction: 'asc' | 'desc') {
    if (changeBuffer.hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return
      changeBuffer.clearAll()
    }
    sortColumn = column
    sortDirection = direction
    page = 1
    pinActiveTab()
  }

  function handlePageSizeChange(newSize: number) {
    if (changeBuffer.hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return
      changeBuffer.clearAll()
    }
    pageSize = newSize
    pinActiveTab()
  }

  function handleCellEdit(rowIndex: number, column: string, originalValue: unknown, newValue: unknown) {
    changeBuffer.setCellEdit(rowIndex, column, originalValue, newValue)
    pinActiveTab()
  }

  function handleDeleteRow(rowIndex: number) {
    changeBuffer.toggleRowDeleted(rowIndex)
    pinActiveTab()
  }

  function handleAddRow() {
    changeBuffer.addInsertRow(columns)
    pinActiveTab()
  }

  function discardChanges() {
    changeBuffer.clearAll()
  }

  async function commitChanges() {
    if (!changeBuffer.hasChanges || saving) return
    if (primaryKeyColumns.length === 0) {
      notificationStore.add('error', 'Cannot save: table has no primary key')
      return
    }

    saving = true
    try {
      const statements = [
        ...buildDeleteStatements(schema, table, changeBuffer.deletes, rows, primaryKeyColumns),
        ...buildUpdateStatements(schema, table, changeBuffer.edits, rows, primaryKeyColumns),
        ...buildInsertStatements(schema, table, changeBuffer.inserts)
      ]

      const result = await window.api.executeTransaction(statements)

      if (result.success) {
        const count = statements.length
        changeBuffer.clearAll()
        await fetchData()
        notificationStore.add('success', `${count} change${count !== 1 ? 's' : ''} saved successfully`)
      } else {
        notificationStore.add('error', `Transaction failed: ${result.error}`)
      }
    } catch (e) {
      notificationStore.add('error', `Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      saving = false
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (changeBuffer.hasChanges) {
        commitChanges()
      }
    }
  }

  function refresh() {
    if (changeBuffer.hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return
      changeBuffer.clearAll()
    }
    fetchData()
  }

  // Reset everything and fetch fresh data when table changes.
  $effect(() => {
    const _s = schema
    const _t = table
    page = 1
    sortColumn = undefined
    sortDirection = undefined
    filters = []
    showFilters = false
    rows = []
    columns = []
    totalCount = 0
    error = null
    primaryKeyColumns = []
    changeBuffer.clearAll()
    untrack(() => {
      fetchSchema()
      fetchData()
    })
  })

  // Refetch when pagination or sort changes.
  $effect(() => {
    const _p = page
    const _ps = pageSize
    const _sc = sortColumn
    const _sd = sortDirection
    untrack(() => fetchData())
  })
</script>

<svelte:window onkeydown={handleKeydown} />

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

    <!-- Pending changes indicator -->
    {#if changeBuffer.hasChanges}
      <div class="flex items-center gap-2 ml-2">
        <span class="text-amber-400 text-xs font-medium">
          {changeBuffer.pendingChangeCount} unsaved
        </span>
        <button
          class="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
          onclick={discardChanges}
        >
          Discard
        </button>
        <button
          class="flex items-center gap-1 text-[11px] bg-accent text-white px-2 py-0.5 rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
          onclick={commitChanges}
          disabled={saving}
        >
          {#if saving}Saving...{:else}Save{/if}
          <kbd class="text-[9px] opacity-70 ml-0.5">&#8984;S</kbd>
        </button>
      </div>
    {/if}

    <div class="flex-1"></div>

    <!-- No PK warning -->
    {#if !loading && columns.length > 0 && primaryKeyColumns.length === 0}
      <span class="text-amber-400/70 text-[11px]" title="Table has no primary key — editing is disabled">
        No PK (read-only)
      </span>
    {/if}

    <!-- Add row button -->
    {#if editable}
      <button
        class="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary
          hover:text-text-primary hover:bg-surface-hover transition-colors"
        onclick={handleAddRow}
        title="Add new row"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Row
      </button>
    {/if}

    <button
      class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors
        {showFilters || activeFilterCount > 0
          ? 'bg-accent/15 text-accent hover:bg-accent/25'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}"
      onclick={() => {
        showFilters = !showFilters
        if (showFilters && filters.length === 0) addFilter()
      }}
      title="Filter rows"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
      </svg>
      Filter
      {#if activeFilterCount > 0}
        <span class="text-[10px] bg-accent/25 px-1 rounded">{activeFilterCount}</span>
      {/if}
    </button>

    <!-- Delete selected row -->
    {#if editable && rows.length > 0}
      <button
        class="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-secondary
          hover:text-red-400 hover:bg-red-900/20 transition-colors"
        onclick={() => {
          const sel = document.querySelector('tr.bg-surface-active')
          if (sel) {
            const idx = Array.from(sel.parentElement?.children ?? []).indexOf(sel)
            if (idx >= 0) handleDeleteRow(idx)
          }
        }}
        title="Toggle delete selected row (Backspace)"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    {/if}

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

  <!-- Filter bar -->
  {#if showFilters}
    <div class="bg-surface-secondary/60 border-b border-border-primary flex-shrink-0 px-3 py-2 flex flex-col gap-1.5">
      {#each filters as filter, i}
        <div class="flex items-center gap-2">
          {#if i === 0}
            <span class="text-text-muted text-[11px] w-12 text-right flex-shrink-0">WHERE</span>
          {:else}
            <span class="text-text-muted text-[11px] w-12 text-right flex-shrink-0">AND</span>
          {/if}

          <!-- Column select -->
          <select
            class="filter-select min-w-[120px]"
            value={filter.column}
            onchange={(e) => updateFilterColumn(i, (e.target as HTMLSelectElement).value)}
          >
            {#each columns as col}
              <option value={col} selected={col === filter.column}>{col}</option>
            {/each}
          </select>

          <!-- Operator select -->
          <select
            class="filter-select min-w-[100px]"
            value={filter.operator}
            onchange={(e) => updateFilterOperator(i, (e.target as HTMLSelectElement).value)}
          >
            {#each OPERATORS as op}
              <option value={op} selected={op === filter.operator}>{op}</option>
            {/each}
          </select>

          <!-- Value input (hidden for IS NULL / IS NOT NULL) -->
          {#if !NULLARY_OPERATORS.includes(filter.operator)}
            <input
              type="text"
              class="filter-input flex-1 min-w-[140px]"
              placeholder={filter.operator === 'LIKE' || filter.operator === 'NOT LIKE' ? '%value%' : 'value'}
              value={filter.value}
              oninput={(e) => updateFilterValue(i, (e.target as HTMLInputElement).value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  clearTimeout(filterDebounceTimer)
                  page = 1
                  pinActiveTab()
                  fetchData()
                }
              }}
            />
          {:else}
            <div class="flex-1"></div>
          {/if}

          <!-- Remove button -->
          <button
            class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
            onclick={() => removeFilter(i)}
            title="Remove filter"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      {/each}

      <!-- Filter actions -->
      <div class="flex items-center gap-2 mt-0.5">
        <div class="w-12 flex-shrink-0"></div>
        <button
          class="flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors"
          onclick={addFilter}
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add filter
        </button>
        {#if filters.length > 0}
          <button
            class="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
            onclick={clearFilters}
          >
            Clear all
          </button>
        {/if}
      </div>
    </div>
  {/if}

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
      {editable}
      {primaryKeyColumns}
      {changeBuffer}
      onCellEdit={handleCellEdit}
      onDeleteRow={handleDeleteRow}
      onAddRow={handleAddRow}
      insertedRows={changeBuffer.inserts}
    />
  </div>
</div>

<style>
  .filter-select {
    background: var(--color-surface-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
    color: var(--color-text-primary);
    outline: none;
    cursor: pointer;
    font-family: var(--font-mono);
  }

  .filter-select:focus {
    border-color: var(--color-accent);
  }

  .filter-input {
    background: var(--color-surface-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    color: var(--color-text-primary);
    outline: none;
    font-family: var(--font-mono);
  }

  .filter-input:focus {
    border-color: var(--color-accent);
  }

  .filter-input::placeholder {
    color: var(--color-text-muted);
  }
</style>
