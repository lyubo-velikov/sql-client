<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
  import { EditorState, Prec } from '@codemirror/state'
  import { sql, PostgreSQL } from '@codemirror/lang-sql'
  import { oneDark } from '@codemirror/theme-one-dark'
  import { basicSetup } from 'codemirror'
  import DataGrid from '../grid/DataGrid.svelte'
  import QueryHistory from './QueryHistory.svelte'

  let { initialQuery = '' }: { initialQuery?: string } = $props()

  // Editor state
  let editorContainer: HTMLDivElement | undefined = $state()
  let editorView: EditorView | undefined = $state()

  // Results state
  let resultRows = $state<Record<string, unknown>[]>([])
  let resultColumns = $state<string[]>([])
  let resultCount = $state(0)
  let executing = $state(false)
  let executionTime = $state<number | null>(null)
  let queryError = $state<string | null>(null)
  let hasExecuted = $state(false)

  // History state
  let history = $state<Array<{ query: string; timestamp: number; success: boolean; rowCount?: number; duration?: number }>>([])
  let showHistory = $state(false)

  // Splitter state
  let splitRatio = $state(40) // percentage for editor
  let isDragging = $state(false)
  let containerEl: HTMLDivElement | undefined = $state()

  // Result pagination
  let resultPage = $state(1)
  let resultPageSize = $state(100)
  let resultSortColumn = $state<string | undefined>(undefined)
  let resultSortDirection = $state<'asc' | 'desc' | undefined>(undefined)

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
    // Check if there's a selection
    const selection = editorView.state.selection.main
    if (selection.from !== selection.to) {
      return editorView.state.sliceDoc(selection.from, selection.to)
    }
    return editorView.state.doc.toString()
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

    try {
      const result = await window.api.executeQuery(queryText)
      if (result.success && result.data) {
        resultRows = result.data.rows
        resultColumns = result.data.fields.length > 0
          ? result.data.fields.map((f: any) => typeof f === 'string' ? f : f.name)
          : resultRows.length > 0 ? Object.keys(resultRows[0]) : []
        resultCount = result.data.rowCount
        executionTime = result.data.duration

        // Add to history
        addToHistory(queryText, true, result.data.rowCount, result.data.duration)
      } else {
        queryError = result.error ?? 'Query failed'
        resultRows = []
        resultColumns = []
        resultCount = 0
        addToHistory(queryText, false)
      }
    } catch (e) {
      queryError = e instanceof Error ? e.message : String(e)
      resultRows = []
      resultColumns = []
      resultCount = 0
      addToHistory(queryText, false)
    } finally {
      executing = false
    }
  }

  function addToHistory(query: string, success: boolean, rowCount?: number, duration?: number) {
    history = [
      { query, timestamp: Date.now(), success, rowCount, duration },
      ...history.slice(0, 49)
    ]
  }

  function loadFromHistory(query: string) {
    if (editorView) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: query
        }
      })
    }
    showHistory = false
  }

  function clearHistory() {
    history = []
  }

  function handleResultPageChange(p: number) {
    resultPage = p
  }

  function handleResultSort(column: string, direction: 'asc' | 'desc') {
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

  onMount(() => {
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

    const customTheme = EditorView.theme({
      '&': {
        backgroundColor: 'var(--color-surface-primary)',
        color: 'var(--color-text-primary)'
      },
      '.cm-gutters': {
        backgroundColor: 'var(--color-surface-secondary)',
        color: 'var(--color-text-muted)',
        border: 'none',
        borderRight: '1px solid var(--color-border-primary)'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--color-surface-tertiary)'
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--color-surface-secondary)'
      },
      '.cm-selectionMatch': {
        backgroundColor: 'rgba(16, 163, 127, 0.15)'
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--color-accent)'
      },
      '&.cm-focused .cm-selectionBackground, ::selection': {
        backgroundColor: 'rgba(16, 163, 127, 0.2)'
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--color-surface-tertiary)',
        border: 'none',
        color: 'var(--color-text-muted)'
      }
    })

    const startState = EditorState.create({
      doc: initialQuery || 'SELECT * FROM ',
      extensions: [
        basicSetup,
        sql({ dialect: PostgreSQL }),
        oneDark,
        customTheme,
        runQueryKeymap,
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
</script>

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

      <div class="flex-1"></div>

      <button
        class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        onclick={() => showHistory = !showHistory}
        title="Query history"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        History
        {#if history.length > 0}
          <span class="text-[10px] bg-surface-tertiary px-1 rounded">{history.length}</span>
        {/if}
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
            <div>
              <p class="text-red-400 text-sm font-medium mb-1">Query Error</p>
              <pre class="text-red-300/80 text-xs font-mono whitespace-pre-wrap leading-relaxed">{queryError}</pre>
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
      </div>

      <!-- Results grid -->
      <div class="flex-1 min-h-0">
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

  <!-- History panel overlay -->
  {#if showHistory}
    <div class="absolute top-0 right-0 h-full z-20">
      <QueryHistory
        {history}
        onSelect={loadFromHistory}
        onClear={clearHistory}
        onClose={() => showHistory = false}
      />
    </div>
  {/if}
</div>
