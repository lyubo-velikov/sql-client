<script lang="ts">
  import type { createChangeBuffer } from '../../stores/changeBuffer.svelte'

  let {
    row = null,
    rowIndex = -1,
    columns = [],
    open = false,
    editable = false,
    primaryKeyColumns = [],
    changeBuffer = undefined,
    onCellEdit = undefined,
    onClose,
    onNavigate
  }: {
    row: Record<string, unknown> | null
    rowIndex: number
    columns: string[]
    open: boolean
    editable?: boolean
    primaryKeyColumns?: string[]
    changeBuffer?: ReturnType<typeof createChangeBuffer>
    onCellEdit?: (rowIndex: number, column: string, originalValue: unknown, newValue: unknown) => void
    onClose: () => void
    onNavigate?: (direction: 'prev' | 'next') => void
  } = $props()

  let search = $state('')
  let editingField = $state<string | null>(null)
  let editValue = $state('')
  let width = $state(360)
  let isResizing = $state(false)
  let copiedField = $state<string | null>(null)

  let filteredColumns = $derived(
    search.trim()
      ? columns.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()))
      : columns
  )

  function getDisplayValue(col: string): unknown {
    if (!row) return null
    if (changeBuffer) {
      const edited = changeBuffer.getEditedValue(rowIndex, col)
      if (edited !== undefined) return edited
    }
    return row[col]
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'object') {
      if (value instanceof Date) return value.toLocaleString()
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

  function isFieldEditable(col: string): boolean {
    if (!editable) return false
    if (primaryKeyColumns.includes(col)) return false
    return true
  }

  function startFieldEdit(col: string, value: unknown) {
    if (!isFieldEditable(col)) return
    editingField = col
    if (value === null || value === undefined) {
      editValue = ''
    } else if (typeof value === 'object') {
      try { editValue = JSON.stringify(value, null, 2) } catch { editValue = String(value) }
    } else {
      editValue = String(value)
    }
  }

  function commitFieldEdit() {
    if (!editingField || !row) return
    const col = editingField
    const originalValue = row[col] ?? null

    let newValue: unknown
    if (editValue === '') {
      newValue = null
    } else if (typeof originalValue === 'object' && originalValue !== null && !(originalValue instanceof Date)) {
      // Original was JSON/JSONB — parse edited value back to an object
      try {
        newValue = JSON.parse(editValue)
      } catch {
        newValue = editValue // fall back to string if not valid JSON
      }
    } else {
      newValue = editValue
    }

    if (onCellEdit) {
      onCellEdit(rowIndex, col, originalValue, newValue)
    }
    editingField = null
  }

  function cancelFieldEdit() {
    editingField = null
  }

  function handleFieldKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitFieldEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelFieldEdit()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return
    if (e.key === 'Escape') {
      if (editingField) {
        cancelFieldEdit()
      } else {
        onClose()
      }
      e.stopPropagation()
    } else if (e.key === 'ArrowUp' && !editingField) {
      e.preventDefault()
      onNavigate?.('prev')
    } else if (e.key === 'ArrowDown' && !editingField) {
      e.preventDefault()
      onNavigate?.('next')
    }
  }

  // Resize logic
  function startResize(e: MouseEvent) {
    isResizing = true
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width

    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX
      width = Math.max(280, Math.min(700, startWidth + delta))
    }

    function onUp() {
      isResizing = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  async function copyValue(col: string, value: unknown) {
    try {
      await navigator.clipboard.writeText(formatValue(value))
      copiedField = col
      setTimeout(() => { copiedField = null }, 1500)
    } catch {}
  }

  function canEditHint(): string {
    return 'click value to edit'
  }

  // Cancel editing when row changes
  $effect(() => {
    const _r = rowIndex
    editingField = null
  })
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && row}
  <div
    class="h-full border-l border-border-primary bg-surface-primary flex flex-col flex-shrink-0 relative"
    style="width: {width}px"
    class:select-none={isResizing}
  >
    <!-- Resize handle -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/30 transition-colors z-10
        {isResizing ? 'bg-accent/30' : ''}"
      onmousedown={startResize}
    ></div>

    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2 bg-surface-secondary border-b border-border-primary flex-shrink-0">
      <span class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Row Detail</span>
      <span class="text-[10px] text-text-muted">#{rowIndex + 1}</span>
      <div class="flex-1"></div>

      <!-- Navigation arrows -->
      {#if onNavigate}
        <button
          class="sidebar-nav-btn"
          onclick={() => onNavigate?.('prev')}
          title="Previous row (Up arrow)"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>
        <button
          class="sidebar-nav-btn"
          onclick={() => onNavigate?.('next')}
          title="Next row (Down arrow)"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      {/if}

      <!-- Close button -->
      <button
        class="sidebar-nav-btn"
        onclick={onClose}
        title="Close (Esc)"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Search -->
    <div class="px-3 py-2 border-b border-border-primary flex-shrink-0">
      <input
        type="text"
        class="w-full bg-surface-tertiary border border-border-primary rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
        placeholder="Search columns..."
        bind:value={search}
      />
    </div>

    <!-- Fields list -->
    <div class="flex-1 overflow-auto min-h-0">
      {#each filteredColumns as col}
        {@const value = getDisplayValue(col)}
        {@const cellType = getCellType(value)}
        {@const isPK = primaryKeyColumns.includes(col)}
        {@const isEdited = changeBuffer?.isEdited(rowIndex, col) ?? false}
        {@const isEditing = editingField === col}
        {@const canEdit = isFieldEditable(col)}

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="field-row group {isEdited ? 'field-edited' : ''}"
          ondblclick={() => {
            if (canEdit) startFieldEdit(col, value)
            else copyValue(col, value)
          }}
        >
          <!-- Column name -->
          <div class="flex items-center gap-1.5 mb-1">
            <span class="text-[11px] font-medium text-text-secondary truncate">{col}</span>
            {#if isPK}
              <svg class="w-2.5 h-2.5 text-amber-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L15.09 7.26L22 8.27L17 13.14L18.18 20.02L12 16.77L5.82 20.02L7 13.14L2 8.27L8.91 7.26L12 1Z"/>
              </svg>
            {/if}
            {#if isEdited}
              <span class="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"></span>
            {/if}
            <div class="flex-1"></div>
            <!-- Copy button -->
            <button
              class="{copiedField === col ? 'opacity-100 text-accent' : 'opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-secondary'} transition-all p-0.5"
              onclick={() => copyValue(col, value)}
              title={copiedField === col ? 'Copied!' : 'Copy value'}
            >
              {#if copiedField === col}
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              {:else}
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              {/if}
            </button>
          </div>

          <!-- Value -->
          {#if isEditing}
            <!-- svelte-ignore a11y_autofocus -->
            <textarea
              class="field-edit-input"
              bind:value={editValue}
              onkeydown={handleFieldKeydown}
              onblur={commitFieldEdit}
              rows={editValue.includes('\n') ? Math.min(editValue.split('\n').length, 8) : 1}
              autofocus
            ></textarea>
          {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
              class="field-value font-mono {canEdit ? 'cursor-text' : 'cursor-default'}"
              onclick={() => { if (canEdit) startFieldEdit(col, value) }}
            >
              {#if cellType === 'null'}
                <span class="italic text-text-muted text-xs">NULL</span>
              {:else if cellType === 'boolean'}
                <span class="inline-flex items-center px-1.5 py-0 rounded text-[11px] font-medium
                  {value ? 'bool-true' : 'bool-false'}">
                  {value ? 'true' : 'false'}
                </span>
              {:else if cellType === 'json'}
                <pre class="text-amber-400/80 text-xs whitespace-pre-wrap break-all leading-relaxed">{formatValue(value)}</pre>
              {:else if cellType === 'number'}
                <span class="text-blue-400/80 tabular-nums">{formatValue(value)}</span>
              {:else if cellType === 'date'}
                <span class="text-purple-400/70">{formatValue(value)}</span>
              {:else}
                <span class="whitespace-pre-wrap break-all">{formatValue(value)}</span>
              {/if}
            </div>
          {/if}
        </div>
      {/each}

      {#if filteredColumns.length === 0 && search.trim()}
        <div class="px-3 py-6 text-center text-text-muted text-xs">
          No columns matching "{search}"
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="px-3 py-1.5 bg-surface-secondary border-t border-border-primary text-[10px] text-text-muted flex-shrink-0">
      {columns.length} columns
      {#if editable}
        <span class="mx-1">&middot;</span>
        <span>{canEditHint()}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .field-row {
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border-primary);
    transition: background 0.1s;
  }

  .field-row:hover {
    background: var(--color-surface-hover);
  }

  .field-edited {
    border-left: 2px solid #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }

  .field-value {
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-text-primary);
    min-height: 20px;
  }

  .field-edit-input {
    width: 100%;
    background: var(--color-surface-tertiary);
    border: 1px solid var(--color-accent);
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-text-primary);
    outline: none;
    resize: vertical;
    line-height: 1.5;
  }

  .sidebar-nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.1s;
    background: none;
    border: none;
  }

  .sidebar-nav-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
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
