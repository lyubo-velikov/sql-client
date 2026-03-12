<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
  import { EditorState, Prec, Compartment } from '@codemirror/state'
  import { sql, PostgreSQL } from '@codemirror/lang-sql'
  import { materialDark, materialLight } from '@uiw/codemirror-theme-material'
  import { basicSetup } from 'codemirror'
  import { themeStore } from '../../stores/theme.svelte'
  import DataGrid from '../grid/DataGrid.svelte'
  import RowDetailSidebar from '../grid/RowDetailSidebar.svelte'
  import { historyStore } from '../../stores/history.svelte'
  import { connectionStore } from '../../stores/connection.svelte'
  import { createChangeBuffer } from '../../stores/changeBuffer.svelte'
  import { notificationStore } from '../../stores/notifications.svelte'
  import { buildUpdateStatements, buildDeleteStatements } from '../../utils/sqlBuilder'
  import { format as formatSql } from 'sql-formatter'

  let { initialQuery = '', filePath, onQueryChange, onToggleHistory, onAskAi }: {
    initialQuery?: string
    filePath?: string
    onQueryChange?: (query: string) => void
    onToggleHistory?: () => void
    onAskAi?: (params: { type: 'fix-error' | 'explain'; query: string; error?: string }) => void
  } = $props()

  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined

  // Editor state
  let editorContainer: HTMLDivElement | undefined = $state()
  let editorView: EditorView | undefined = $state()
  const sqlCompartment = new Compartment()
  const themeCompartment = new Compartment()

  function getEditorTheme() {
    return themeStore.theme === 'light' ? materialLight : materialDark
  }

  function buildSqlSchema(): Record<string, string[]> {
    const schema: Record<string, string[]> = {}
    for (const t of connectionStore.tables) {
      schema[`${t.schemaname}.${t.tablename}`] = []
      schema[t.tablename] = []
    }
    return schema
  }

  function buildSqlExtension() {
    return sql({ dialect: PostgreSQL, schema: buildSqlSchema() })
  }

  // Results state
  let resultRows = $state<Record<string, unknown>[]>([])
  let resultColumns = $state<string[]>([])
  let resultCount = $state(0)
  let executing = $state(false)
  let executionTime = $state<number | null>(null)
  let queryError = $state<string | null>(null)
  let hasExecuted = $state(false)

  // Splitter state
  let splitRatio = $state(40)
  let isDragging = $state(false)
  let containerEl: HTMLDivElement | undefined = $state()

  // Result pagination
  let resultPage = $state(1)
  let resultPageSize = $state(100)
  let resultSortColumn = $state<string | undefined>(undefined)
  let resultSortDirection = $state<'asc' | 'desc' | undefined>(undefined)

  // Sidebar state
  let sidebarOpen = $state(false)
  let selectedRowIndex = $state<number | null>(null)
  let selectedRowData = $state<Record<string, unknown> | null>(null)

  // Editing state for query results
  let editableSchema = $state<string | null>(null)
  let editableTable = $state<string | null>(null)
  let primaryKeyColumns = $state<string[]>([])
  let columnTypes = $state<Map<string, string>>(new Map())
  let editable = $derived(editableTable !== null && primaryKeyColumns.length > 0)
  const changeBuffer = createChangeBuffer()
  let saving = $state(false)
  let lastExecutedQuery = $state('')

  function handleRowSelect(idx: number | null, row: Record<string, unknown> | null) {
    selectedRowIndex = idx
    selectedRowData = row
    if (idx !== null) sidebarOpen = true
  }

  function handleSidebarClose() {
    sidebarOpen = false
  }

  function handleSidebarNavigate(direction: 'prev' | 'next') {
    if (selectedRowIndex === null) return
    const newIndex = direction === 'prev' ? selectedRowIndex - 1 : selectedRowIndex + 1
    if (newIndex >= 0 && newIndex < paginatedRows.length) {
      selectedRowIndex = newIndex
      selectedRowData = paginatedRows[newIndex]
    }
  }

  function handleCellEdit(rowIndex: number, column: string, originalValue: unknown, newValue: unknown) {
    changeBuffer.setCellEdit(rowIndex, column, originalValue, newValue)
  }

  function handleDeleteRow(rowIndex: number) {
    changeBuffer.toggleRowDeleted(rowIndex)
  }

  function discardChanges() {
    changeBuffer.clearAll()
  }

  async function commitChanges() {
    if (!changeBuffer.hasChanges || saving || !editableSchema || !editableTable) return
    if (primaryKeyColumns.length === 0) {
      notificationStore.add('error', 'Cannot save: table has no primary key')
      return
    }

    saving = true
    try {
      const statements = [
        ...buildDeleteStatements(editableSchema, editableTable, changeBuffer.deletes, resultRows, primaryKeyColumns),
        ...buildUpdateStatements(editableSchema, editableTable, changeBuffer.edits, resultRows, primaryKeyColumns, columnTypes)
      ]

      const result = await window.api.executeTransaction(
        JSON.parse(JSON.stringify({ statements, primaryKeyColumns }))
      )

      if (result.success) {
        const count = statements.length
        changeBuffer.clearAll()
        // Re-run the query to refresh results
        await reExecuteQuery()
        notificationStore.add('success', `${count} change${count !== 1 ? 's' : ''} saved`)
      } else {
        notificationStore.add('error', `Transaction failed: ${result.error}`)
      }
    } catch (e) {
      notificationStore.add('error', `Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      saving = false
      historyStore.refresh()
    }
  }

  /**
   * Try to detect if a query is a simple SELECT from a single table.
   * Returns { schema, table } or null.
   */
  function detectSourceTable(queryText: string): { schema: string; table: string } | null {
    // Strip comments
    const cleaned = queryText
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()

    // Match: SELECT ... FROM [schema.]table [WHERE|ORDER|GROUP|LIMIT|;|$]
    // Handles quoted and unquoted identifiers
    const fromMatch = cleaned.match(
      /\bFROM\s+(?:"([^"]+)"|([a-z_]\w*))(?:\s*\.\s*(?:"([^"]+)"|([a-z_]\w*)))?\s*(?:WHERE|ORDER|GROUP|HAVING|LIMIT|OFFSET|;|$)/i
    )
    if (!fromMatch) return null

    // Check there's no JOIN, subquery, or multiple tables
    if (/\bJOIN\b/i.test(cleaned)) return null
    // Check for comma-separated tables in FROM
    const fromClause = cleaned.match(/\bFROM\s+([\s\S]*?)(?:\bWHERE\b|\bORDER\b|\bGROUP\b|\bHAVING\b|\bLIMIT\b|\bOFFSET\b|;|$)/i)
    if (fromClause && fromClause[1].includes(',')) return null

    const part1 = fromMatch[1] || fromMatch[2]
    const part2 = fromMatch[3] || fromMatch[4]

    if (part2) {
      return { schema: part1, table: part2 }
    }

    // No schema specified — find the table in known tables
    const knownTable = connectionStore.tables.find(
      (t) => t.tablename.toLowerCase() === part1.toLowerCase()
    )
    if (knownTable) {
      return { schema: knownTable.schemaname, table: knownTable.tablename }
    }

    return { schema: 'public', table: part1 }
  }

  async function fetchTableMeta(schema: string, table: string): Promise<{ pks: string[]; types: Map<string, string> }> {
    try {
      const result = await window.api.getTableSchema(schema, table)
      if (result.success && result.data) {
        const pks = result.data.filter((col: any) => col.is_primary_key).map((col: any) => col.column_name)
        const types = new Map<string, string>()
        for (const col of result.data) {
          types.set(col.column_name, col.data_type)
        }
        return { pks, types }
      }
    } catch { /* ignore */ }
    return { pks: [], types: new Map() }
  }

  // For client-side pagination of query results
  let sortedRows = $derived.by(() => {
    if (!resultSortColumn || !resultSortDirection) return resultRows
    const col = resultSortColumn
    const dir = resultSortDirection
    return [...resultRows].sort((a, b) => {
      const aVal = a[col]
      const bVal = b[col]
      if (aVal === null || aVal === undefined) return dir === 'asc' ? -1 : 1
      if (bVal === null || bVal === undefined) return dir === 'asc' ? 1 : -1
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return dir === 'asc' ? aVal - bVal : bVal - aVal
      }
      const aStr = String(aVal)
      const bStr = String(bVal)
      return dir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
    })
  })

  let paginatedRows = $derived.by(() => {
    const start = (resultPage - 1) * resultPageSize
    return sortedRows.slice(start, start + resultPageSize)
  })

  function getEditorContent(): string {
    if (!editorView) return ''
    const selection = editorView.state.selection.main
    if (selection.from !== selection.to) {
      return editorView.state.sliceDoc(selection.from, selection.to)
    }
    return editorView.state.doc.toString()
  }

  async function reExecuteQuery() {
    if (!lastExecutedQuery) return
    try {
      const result = await window.api.executeQuery(lastExecutedQuery)
      if (result.success && result.data) {
        resultRows = result.data.rows
        resultColumns = result.data.fields.length > 0
          ? result.data.fields.map((f: any) => typeof f === 'string' ? f : f.name)
          : resultRows.length > 0 ? Object.keys(resultRows[0]) : []
        resultCount = result.data.rowCount
        executionTime = result.data.duration
      }
    } catch { /* ignore */ }
  }

  async function executeQuery() {
    const queryText = getEditorContent().trim()
    if (!queryText || executing) return

    executing = true
    queryError = null
    executionTime = null
    hasExecuted = true
    resultPage = 1
    resultSortColumn = undefined
    resultSortDirection = undefined
    sidebarOpen = false
    selectedRowIndex = null
    selectedRowData = null
    changeBuffer.clearAll()
    editableSchema = null
    editableTable = null
    primaryKeyColumns = []
    columnTypes = new Map()
    lastExecutedQuery = queryText

    try {
      const result = await window.api.executeQuery(queryText)
      if (result.success && result.data) {
        resultRows = result.data.rows
        resultColumns = result.data.fields.length > 0
          ? result.data.fields.map((f: any) => typeof f === 'string' ? f : f.name)
          : resultRows.length > 0 ? Object.keys(resultRows[0]) : []
        resultCount = result.data.rowCount
        executionTime = result.data.duration

        // Try to detect source table for inline editing
        const source = detectSourceTable(queryText)
        if (source) {
          const meta = await fetchTableMeta(source.schema, source.table)
          if (meta.pks.length > 0) {
            // Verify all PK columns exist in results
            const allPksPresent = meta.pks.every((pk) => resultColumns.includes(pk))
            if (allPksPresent) {
              editableSchema = source.schema
              editableTable = source.table
              primaryKeyColumns = meta.pks
              columnTypes = meta.types
            }
          }
        }
      } else {
        queryError = result.error ?? 'Query failed'
        resultRows = []
        resultColumns = []
        resultCount = 0
      }
    } catch (e) {
      queryError = e instanceof Error ? e.message : String(e)
      resultRows = []
      resultColumns = []
      resultCount = 0
    } finally {
      executing = false
      historyStore.refresh()
    }
  }

  function handleResultPageChange(p: number) {
    if (changeBuffer.hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return
      changeBuffer.clearAll()
    }
    resultPage = p
  }

  function handleResultSort(column: string, direction: 'asc' | 'desc') {
    if (changeBuffer.hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return
      changeBuffer.clearAll()
    }
    resultSortColumn = column
    resultSortDirection = direction
    resultPage = 1
  }

  // Splitter drag logic
  function startDrag(e: MouseEvent) {
    isDragging = true
    e.preventDefault()
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging || !containerEl) return
    const rect = containerEl.getBoundingClientRect()
    const y = e.clientY - rect.top
    const pct = (y / rect.height) * 100
    splitRatio = Math.max(15, Math.min(85, pct))
  }

  function onMouseUp() {
    isDragging = false
  }

  function prettifyQuery() {
    if (!editorView) return
    const content = editorView.state.doc.toString()
    if (!content.trim()) return
    try {
      const formatted = formatSql(content, { language: 'postgresql', tabWidth: 2, keywordCase: 'upper' })
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: formatted }
      })
    } catch {
      notificationStore.add('error', 'Could not format SQL')
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && changeBuffer.hasChanges) {
      e.preventDefault()
      commitChanges()
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
      e.preventDefault()
      prettifyQuery()
    }
  }

  onMount(async () => {
    if (!editorContainer) return

    const runQueryKeymap = Prec.highest(keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          executeQuery()
          return true
        }
      },
      {
        key: 'Alt-Enter',
        run: () => {
          executeQuery()
          return true
        }
      }
    ]))

    const accentOverrides = EditorView.theme({
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--color-accent)'
      }
    })

    // Debounced content sync for persistence + file auto-save
    let syncTimer: ReturnType<typeof setTimeout> | undefined
    const contentSync = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString()
        if (onQueryChange) {
          clearTimeout(syncTimer)
          syncTimer = setTimeout(() => {
            onQueryChange(content)
          }, 500)
        }
        // Auto-save to file
        if (filePath) {
          clearTimeout(autoSaveTimer)
          autoSaveTimer = setTimeout(() => {
            window.api.writeQueryFile(filePath!, content).catch(() => {})
          }, 1000)
        }
      }
    })

    // Load initial content from file or use provided query
    let initialDoc = initialQuery || ''
    if (filePath) {
      try {
        const file = await window.api.readQueryFile(filePath)
        initialDoc = file.content
      } catch {
        initialDoc = initialQuery || ''
      }
    }
    if (!initialDoc) initialDoc = 'SELECT * FROM '

    const startState = EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        sqlCompartment.of(buildSqlExtension()),
        themeCompartment.of(getEditorTheme()),
        accentOverrides,
        runQueryKeymap,
        contentSync,
        cmPlaceholder('Enter SQL query...'),
        EditorView.lineWrapping
      ]
    })

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    })

    // Add mouse event listeners for splitter
    const handleMove = (e: MouseEvent) => onMouseMove(e)
    const handleUp = () => onMouseUp()
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      editorView?.destroy()
    }
  })

  // Reconfigure SQL autocomplete when connection tables change
  $effect(() => {
    const _tables = connectionStore.tables
    if (editorView) {
      editorView.dispatch({
        effects: sqlCompartment.reconfigure(buildSqlExtension())
      })
    }
  })

  // Swap editor theme when app theme changes
  $effect(() => {
    const _theme = themeStore.theme
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(getEditorTheme())
      })
    }
  })
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="flex flex-col h-full relative"
  bind:this={containerEl}
  class:select-none={isDragging}
>
  <!-- Editor section -->
  <div class="flex flex-col min-h-0" style="height: {splitRatio}%">
    <!-- Editor toolbar -->
    <div class="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary border-b border-border-primary flex-shrink-0">
      <button
        class="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all
          {executing
            ? 'bg-surface-tertiary text-text-muted cursor-not-allowed'
            : 'bg-accent text-white hover:bg-accent-hover cursor-pointer'}"
        onclick={executeQuery}
        disabled={executing}
        title="Execute query (Cmd+Enter / Alt+Enter)"
      >
        {#if executing}
          <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          Running...
        {:else}
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
          Run
        {/if}
      </button>

      <span class="text-text-muted text-[10px]">
        {#if navigator.platform?.includes('Mac')}
          ⌘+Enter
        {:else}
          Ctrl+Enter
        {/if}
      </span>

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

      <button
        class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        onclick={prettifyQuery}
        title="Format SQL ({navigator.platform?.includes('Mac') ? 'Cmd' : 'Ctrl'}+Shift+F)"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
        </svg>
        Format
      </button>

      {#if onAskAi}
        <button
          class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-secondary hover:text-accent hover:bg-surface-hover transition-colors"
          onclick={() => onAskAi?.({ type: 'explain', query: getEditorContent() })}
          title="Explain query with AI"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Explain
        </button>
      {/if}

      <button
        class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        onclick={() => onToggleHistory?.()}
        title="Query history (Cmd+Shift+H)"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        History
      </button>
    </div>

    <!-- CodeMirror editor -->
    <div class="flex-1 min-h-0 overflow-auto" bind:this={editorContainer}></div>
  </div>

  <!-- Splitter handle -->
  <div
    class="h-1 bg-surface-secondary border-y border-border-primary cursor-row-resize flex-shrink-0 hover:bg-accent/20 transition-colors
      {isDragging ? 'bg-accent/30' : ''}"
    onmousedown={startDrag}
    role="separator"
    aria-orientation="horizontal"
  >
    <div class="flex justify-center items-center h-full">
      <div class="w-8 h-0.5 rounded bg-border-secondary"></div>
    </div>
  </div>

  <!-- Results section -->
  <div class="flex flex-col min-h-0" style="height: {100 - splitRatio}%">
    {#if queryError}
      <!-- Error display -->
      <div class="flex-1 flex flex-col">
        <div class="px-4 py-3 bg-red-950/30 border-b border-red-800/30">
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div class="flex-1 min-w-0">
              <p class="text-red-400 text-sm font-medium mb-1">Query Error</p>
              <pre class="text-red-300/80 text-xs font-mono whitespace-pre-wrap leading-relaxed">{queryError}</pre>
              {#if onAskAi}
                <button
                  class="mt-2 flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium
                         bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                  onclick={() => onAskAi?.({ type: 'fix-error', query: getEditorContent(), error: queryError ?? undefined })}
                >
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  Fix with AI
                </button>
              {/if}
            </div>
          </div>
        </div>
      </div>
    {:else if hasExecuted}
      <!-- Status bar -->
      <div class="flex items-center gap-3 px-3 py-1 bg-surface-secondary border-b border-border-primary flex-shrink-0 text-xs">
        {#if executionTime !== null}
          <span class="text-accent flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {executionTime}ms
          </span>
        {/if}
        <span class="text-text-secondary">
          {resultCount} {resultCount === 1 ? 'row' : 'rows'} returned
        </span>
        {#if editable}
          <span class="text-text-muted text-[10px]">
            editing {editableSchema}.{editableTable}
          </span>
        {/if}

        <div class="ml-auto">
          <button
            class="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-text-secondary
              hover:text-text-primary hover:bg-surface-hover transition-colors
              {executing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
            onclick={executeQuery}
            disabled={executing}
            title="Re-run query"
          >
            <svg class="w-3.5 h-3.5 {executing ? 'animate-spin' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 14.652" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      <!-- Results grid + sidebar -->
      <div class="flex flex-1 min-h-0">
        <div class="flex-1 min-w-0">
          <DataGrid
            rows={paginatedRows}
            columns={resultColumns}
            totalCount={resultRows.length}
            page={resultPage}
            pageSize={resultPageSize}
            loading={executing}
            onPageChange={handleResultPageChange}
            onSort={handleResultSort}
            sortColumn={resultSortColumn}
            sortDirection={resultSortDirection}
            onRowSelect={handleRowSelect}
            selectedRowIndex={sidebarOpen ? selectedRowIndex : null}
            {editable}
            {primaryKeyColumns}
            changeBuffer={editable ? changeBuffer : undefined}
            onCellEdit={editable ? handleCellEdit : undefined}
            onDeleteRow={editable ? handleDeleteRow : undefined}
          />
        </div>
        <RowDetailSidebar
          row={selectedRowData}
          rowIndex={selectedRowIndex ?? -1}
          columns={resultColumns}
          open={sidebarOpen}
          {editable}
          {primaryKeyColumns}
          changeBuffer={editable ? changeBuffer : undefined}
          onCellEdit={editable ? handleCellEdit : undefined}
          onClose={handleSidebarClose}
          onNavigate={handleSidebarNavigate}
        />
      </div>
    {:else}
      <!-- Placeholder -->
      <div class="flex-1 flex items-center justify-center text-text-muted">
        <div class="text-center">
          <svg class="w-10 h-10 mx-auto mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
          <p class="text-xs">Run a query to see results</p>
          <p class="text-[10px] text-text-muted mt-1">
            {#if navigator.platform?.includes('Mac')}
              ⌘+Enter to execute
            {:else}
              Ctrl+Enter to execute
            {/if}
          </p>
        </div>
      </div>
    {/if}
  </div>


</div>
