<script lang="ts">
  import { untrack } from 'svelte'
  import type { createChangeBuffer, RowInsert } from '../../stores/changeBuffer.svelte'
  import { EditorView, keymap } from '@codemirror/view'
  import { EditorState, Prec } from '@codemirror/state'
  import { json } from '@codemirror/lang-json'
  import { materialDark, materialLight } from '@uiw/codemirror-theme-material'
  import { basicSetup } from 'codemirror'
  import { themeStore } from '../../stores/theme.svelte'

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
    sortDirection = undefined,
    editable = false,
    primaryKeyColumns = [],
    changeBuffer = undefined,
    onCellEdit = undefined,
    onDeleteRow = undefined,
    onAddRow = undefined,
    insertedRows = [],
    onRowSelect = undefined,
    selectedRowIndex = null
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
    editable?: boolean
    primaryKeyColumns?: string[]
    changeBuffer?: ReturnType<typeof createChangeBuffer>
    onCellEdit?: (rowIndex: number, column: string, originalValue: unknown, newValue: unknown) => void
    onDeleteRow?: (rowIndex: number) => void
    onAddRow?: () => void
    insertedRows?: RowInsert[]
    onRowSelect?: (rowIndex: number | null, row: Record<string, unknown> | null) => void
    selectedRowIndex?: number | null
  } = $props()

  let internalSelectedRow = $state<number | null>(null)
  let selectedRow = $derived(selectedRowIndex !== null && selectedRowIndex !== undefined ? selectedRowIndex : internalSelectedRow)
  let copiedCell = $state<{ row: number; col: string } | null>(null)

  function selectRow(idx: number | null) {
    internalSelectedRow = idx
    if (onRowSelect) {
      onRowSelect(idx, idx !== null ? rows[idx] ?? null : null)
    }
  }

  // Editing state
  let editingCell = $state<{ row: number; col: string; isInsert?: boolean; tempId?: string } | null>(null)
  let editValue = $state('')

  // JSON modal editor state
  let jsonModal = $state<{ row: number; col: string; isInsert?: boolean; tempId?: string } | null>(null)
  let jsonEditValue = $state('')
  let jsonError = $state<string | null>(null)
  let jsonEditorContainer: HTMLDivElement | undefined = $state()
  let jsonEditorView: EditorView | undefined = $state()

  function getJsonEditorTheme() {
    return themeStore.theme === 'light' ? materialLight : materialDark
  }

  function createJsonEditor(container: HTMLDivElement, doc: string) {
    jsonEditorView?.destroy()

    const modalKeymap = Prec.highest(keymap.of([
      {
        key: 'Escape',
        run: () => { cancelJsonModal(); return true }
      },
      {
        key: 'Mod-Enter',
        run: () => { commitJsonModal(); return true }
      }
    ]))

    const contentSync = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        jsonEditValue = update.state.doc.toString()
      }
    })

    const state = EditorState.create({
      doc,
      extensions: [
        basicSetup,
        json(),
        getJsonEditorTheme(),
        modalKeymap,
        contentSync,
        EditorView.theme({
          '&': { height: '100%', maxHeight: '60vh' },
          '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--color-accent)' },
          '.cm-scroller': { overflow: 'auto' }
        }),
        EditorView.lineWrapping
      ]
    })

    jsonEditorView = new EditorView({ state, parent: container })
    jsonEditorView.focus()
  }

  function destroyJsonEditor() {
    jsonEditorView?.destroy()
    jsonEditorView = undefined
  }

  // Create/destroy editor when modal opens/closes
  $effect(() => {
    const modal = jsonModal
    const container = jsonEditorContainer
    if (modal && container) {
      // Read jsonEditValue without tracking to avoid re-creating editor on every keystroke
      untrack(() => createJsonEditor(container, jsonEditValue))
    }
    return () => destroyJsonEditor()
  })

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

  // --- Editing functions ---

  function startEditing(rowIndex: number, col: string, value: unknown, isInsert = false, tempId?: string) {
    if (!editable) return
    // Don't allow editing PK columns on existing rows
    if (!isInsert && primaryKeyColumns.includes(col)) return

    editingCell = { row: rowIndex, col, isInsert, tempId }
    if (value === null || value === undefined) {
      editValue = ''
    } else if (typeof value === 'object') {
      try { editValue = JSON.stringify(value, null, 2) } catch { editValue = String(value) }
    } else {
      editValue = String(value)
    }
  }

  function commitEdit() {
    if (!editingCell) return
    const { row, col, isInsert, tempId } = editingCell

    // Determine the actual value: empty string means NULL for editable cells
    const newValue = editValue === '' ? null : editValue

    if (isInsert && tempId && changeBuffer) {
      changeBuffer.setInsertCellValue(tempId, col, newValue)
    } else if (onCellEdit) {
      const originalValue = rows[row]?.[col] ?? null
      onCellEdit(row, col, originalValue, newValue)
    }

    editingCell = null
  }

  function cancelEdit() {
    editingCell = null
  }

  function isJsonValue(row: number, col: string, isInsert?: boolean, tempId?: string): boolean {
    let value: unknown
    if (isInsert && tempId) {
      const insertRow = insertedRows.find((r) => r.tempId === tempId)
      value = insertRow?.values[col]
    } else {
      value = rows[row]?.[col]
    }
    return typeof value === 'object' && value !== null && !(value instanceof Date)
  }

  function openJsonModal(row: number, col: string, value: unknown, isInsert = false, tempId?: string) {
    jsonModal = { row, col, isInsert, tempId }
    jsonError = null
    if (value === null || value === undefined) {
      jsonEditValue = ''
    } else if (typeof value === 'object') {
      try { jsonEditValue = JSON.stringify(value, null, 2) } catch { jsonEditValue = String(value) }
    } else {
      jsonEditValue = String(value)
    }
  }

  function setJsonEditorContent(content: string) {
    jsonEditValue = content
    if (jsonEditorView) {
      jsonEditorView.dispatch({
        changes: { from: 0, to: jsonEditorView.state.doc.length, insert: content }
      })
    }
  }

  function formatJson() {
    try {
      const parsed = JSON.parse(jsonEditValue)
      setJsonEditorContent(JSON.stringify(parsed, null, 2))
      jsonError = null
    } catch (e) {
      jsonError = e instanceof Error ? e.message : 'Invalid JSON'
    }
  }

  function compactJson() {
    try {
      const parsed = JSON.parse(jsonEditValue)
      setJsonEditorContent(JSON.stringify(parsed))
      jsonError = null
    } catch (e) {
      jsonError = e instanceof Error ? e.message : 'Invalid JSON'
    }
  }

  function commitJsonModal() {
    if (!jsonModal) return
    const { row, col, isInsert, tempId } = jsonModal

    // Parse JSON string back to an object so it's stored with the correct type
    let newValue: unknown = null
    if (jsonEditValue !== '') {
      try {
        newValue = JSON.parse(jsonEditValue)
        jsonError = null
      } catch (e) {
        jsonError = e instanceof Error ? e.message : 'Invalid JSON'
        return
      }
    }

    if (isInsert && tempId && changeBuffer) {
      changeBuffer.setInsertCellValue(tempId, col, newValue)
    } else if (onCellEdit) {
      const originalValue = rows[row]?.[col] ?? null
      onCellEdit(row, col, originalValue, newValue)
    }

    destroyJsonEditor()
    jsonModal = null
    jsonEditValue = ''
    jsonError = null
  }

  function cancelJsonModal() {
    destroyJsonEditor()
    jsonModal = null
    jsonEditValue = ''
    jsonError = null
  }

  // Keyboard shortcuts for JSON modal are handled by CodeMirror keybindings

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commitEdit()
    }
  }

  function handleCellClick(rowIndex: number, col: string, value: unknown, isInsert = false, tempId?: string) {
    if (editable) {
      // Commit any current edit first
      if (editingCell) commitEdit()

      // Route JSON values to the modal editor
      if (isJsonValue(rowIndex, col, isInsert, tempId)) {
        openJsonModal(rowIndex, col, value, isInsert, tempId)
      } else {
        startEditing(rowIndex, col, value, isInsert, tempId)
      }
    }
  }

  function handleCellDblClick(rowIndex: number, col: string, value: unknown) {
    if (!editable) {
      copyCell(rowIndex, col, value)
    }
    // If editable, single click already started editing
  }

  function getDisplayValue(rowIndex: number, col: string, originalValue: unknown): unknown {
    if (!changeBuffer) return originalValue
    const edited = changeBuffer.getEditedValue(rowIndex, col)
    return edited !== undefined ? edited : originalValue
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
    {:else if rows.length === 0 && insertedRows.length === 0}
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
                  {#if primaryKeyColumns.includes(col)}
                    <svg class="w-2.5 h-2.5 text-amber-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L15.09 7.26L22 8.27L17 13.14L18.18 20.02L12 16.77L5.82 20.02L7 13.14L2 8.27L8.91 7.26L12 1Z"/>
                    </svg>
                  {/if}
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
            {@const isDeleted = changeBuffer?.isDeleted(rowIndex) ?? false}
            <tr
              class="border-b border-border-primary transition-colors duration-75 cursor-default
                {isDeleted ? 'bg-red-900/15 opacity-50' :
                 selectedRow === rowIndex ? 'bg-surface-active' :
                 rowIndex % 2 === 0 ? 'bg-surface-primary' : 'bg-surface-secondary/30'}
                {isDeleted ? '' : 'hover:bg-surface-hover'}"
              onclick={() => selectRow(selectedRow === rowIndex ? null : rowIndex)}
            >
              <!-- Row number / status indicator -->
              <td class="datagrid-td text-center w-12 select-none text-[11px]
                {isDeleted ? 'text-red-400' :
                 (changeBuffer && [...(changeBuffer.edits.keys())].some(k => k.startsWith(rowIndex + ':'))) ? 'text-amber-400' :
                 'text-text-muted'}">
                {#if isDeleted}
                  <span title="Marked for deletion">-</span>
                {:else}
                  {startRow + rowIndex}
                {/if}
              </td>
              {#each columns as col}
                {@const originalValue = row[col]}
                {@const displayValue = getDisplayValue(rowIndex, col, originalValue)}
                {@const cellType = getCellType(displayValue)}
                {@const isCellEdited = changeBuffer?.isEdited(rowIndex, col) ?? false}
                {@const isEditing = editingCell?.row === rowIndex && editingCell?.col === col && !editingCell?.isInsert}
                <td
                  class="datagrid-td font-mono relative
                    {cellType === 'number' ? 'text-right' : ''}
                    {copiedCell?.row === rowIndex && copiedCell?.col === col ? 'bg-accent/10' : ''}
                    {isCellEdited ? 'cell-edited' : ''}
                    {isDeleted ? 'line-through' : ''}"
                  title={isDeleted ? 'Marked for deletion' : getFullValue(displayValue)}
                  onclick={(e) => {
                    if (editable && !isDeleted) { e.stopPropagation(); handleCellClick(rowIndex, col, displayValue) }
                  }}
                  ondblclick={() => handleCellDblClick(rowIndex, col, displayValue)}
                >
                  {#if isEditing}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      type="text"
                      class="cell-edit-input"
                      bind:value={editValue}
                      onkeydown={handleEditKeydown}
                      onblur={commitEdit}
                      autofocus
                    />
                  {:else if cellType === 'null'}
                    <span class="italic text-text-muted text-xs">NULL</span>
                  {:else if cellType === 'boolean'}
                    <span class="inline-flex items-center px-1.5 py-0 rounded text-[11px] font-medium
                      {displayValue ? 'bool-true' : 'bool-false'}">
                      {displayValue ? 'true' : 'false'}
                    </span>
                  {:else if cellType === 'json'}
                    <span class="text-amber-400/80 font-mono text-xs">{formatCellValue(displayValue)}</span>
                  {:else if cellType === 'number'}
                    <span class="text-blue-400/80 tabular-nums">{formatCellValue(displayValue)}</span>
                  {:else if cellType === 'date'}
                    <span class="text-purple-400/70">{formatCellValue(displayValue)}</span>
                  {:else}
                    <span class="truncate block max-w-xs">{formatCellValue(displayValue)}</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}

          <!-- Inserted rows -->
          {#each insertedRows as insertRow, insertIdx}
            <tr class="border-b border-border-primary bg-green-900/10 hover:bg-green-900/20 transition-colors duration-75 cursor-default">
              <td class="datagrid-td text-center w-12 select-none text-[11px] text-green-400">
                <span title="New row">+</span>
              </td>
              {#each columns as col}
                {@const isTouched = changeBuffer?.isInsertColumnTouched(insertRow.tempId, col) ?? false}
                {@const value = insertRow.values[col]}
                {@const cellType = getCellType(value)}
                {@const isEditing = editingCell?.isInsert && editingCell?.tempId === insertRow.tempId && editingCell?.col === col}
                <td
                  class="datagrid-td font-mono relative {cellType === 'number' ? 'text-right' : ''}"
                  onclick={(e) => { e.stopPropagation(); handleCellClick(insertIdx, col, value, true, insertRow.tempId) }}
                >
                  {#if isEditing}
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      type="text"
                      class="cell-edit-input"
                      bind:value={editValue}
                      onkeydown={handleEditKeydown}
                      onblur={commitEdit}
                      autofocus
                    />
                  {:else if !isTouched}
                    <span class="italic text-text-muted text-xs">DEFAULT</span>
                  {:else if cellType === 'null'}
                    <span class="italic text-text-muted text-xs">NULL</span>
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
            &laquo;
          </button>
          <button
            class="datagrid-page-btn"
            onclick={() => goToPage(page - 1)}
            disabled={page <= 1 || loading}
            title="Previous page"
          >
            &lsaquo;
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
            &rsaquo;
          </button>
          <button
            class="datagrid-page-btn"
            onclick={() => goToPage(totalPages)}
            disabled={page >= totalPages || loading}
            title="Last page"
          >
            &raquo;
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- JSON Editor Modal -->
  {#if jsonModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="json-modal-backdrop" onclick={cancelJsonModal}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="json-modal" onclick={(e) => e.stopPropagation()}>
        <div class="json-modal-header">
          <span class="json-modal-title">
            Edit JSON &mdash; <code>{jsonModal.col}</code>
          </span>
          <button class="json-modal-close" onclick={cancelJsonModal} title="Close (Esc)">&times;</button>
        </div>

        <div class="json-modal-editor" bind:this={jsonEditorContainer}></div>

        {#if jsonError}
          <div class="json-modal-error">{jsonError}</div>
        {/if}

        <div class="json-modal-footer">
          <div class="json-modal-actions-left">
            <button class="json-modal-btn json-modal-btn-secondary" onclick={formatJson}>Prettify</button>
            <button class="json-modal-btn json-modal-btn-secondary" onclick={compactJson}>Compact</button>
          </div>
          <div class="json-modal-actions-right">
            <span class="json-modal-hint">{navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to save</span>
            <button class="json-modal-btn json-modal-btn-secondary" onclick={cancelJsonModal}>Cancel</button>
            <button class="json-modal-btn json-modal-btn-primary" onclick={commitJsonModal}>Save</button>
          </div>
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

  .cell-edited {
    border-left: 2px solid #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }

  .cell-edit-input {
    width: 100%;
    height: 100%;
    background: var(--color-surface-tertiary);
    border: 1px solid var(--color-accent);
    border-radius: 2px;
    padding: 2px 6px;
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    outline: none;
    box-sizing: border-box;
  }

  /* JSON Editor Modal */
  .json-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .json-modal {
    background: var(--color-surface-primary);
    border: 1px solid var(--color-border-secondary);
    border-radius: 8px;
    width: 560px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  }

  .json-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border-primary);
  }

  .json-modal-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .json-modal-title code {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-accent);
    font-weight: 500;
  }

  .json-modal-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    border-radius: 4px;
    transition: all 0.1s;
  }

  .json-modal-close:hover {
    color: var(--color-text-primary);
    background: var(--color-surface-hover);
  }

  .json-modal-editor {
    flex: 1;
    min-height: 280px;
    max-height: 60vh;
    overflow: auto;
    font-size: 12px;
  }

  .json-modal-error {
    padding: 6px 16px;
    font-size: 11px;
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
    border-top: 1px solid rgba(239, 68, 68, 0.2);
  }

  .json-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-top: 1px solid var(--color-border-primary);
    gap: 8px;
  }

  .json-modal-actions-left,
  .json-modal-actions-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .json-modal-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .json-modal-btn {
    padding: 5px 14px;
    font-size: 12px;
    border-radius: 5px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.1s;
    border: 1px solid transparent;
  }

  .json-modal-btn-secondary {
    background: var(--color-surface-tertiary);
    color: var(--color-text-secondary);
    border-color: var(--color-border-primary);
  }

  .json-modal-btn-secondary:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .json-modal-btn-primary {
    background: var(--color-accent);
    color: #fff;
  }

  .json-modal-btn-primary:hover {
    filter: brightness(1.1);
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

  .bool-true {
    background: rgba(34, 197, 94, 0.15);
    color: #16a34a;
  }
  .bool-false {
    background: rgba(239, 68, 68, 0.15);
    color: #dc2626;
  }

  :global(html.light) .bool-true {
    background: #dcfce7;
    color: #15803d;
  }
  :global(html.light) .bool-false {
    background: #fee2e2;
    color: #b91c1c;
  }
</style>
