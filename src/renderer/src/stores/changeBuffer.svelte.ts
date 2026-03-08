export interface CellEdit {
  rowIndex: number
  column: string
  originalValue: unknown
  newValue: unknown
}

export interface RowInsert {
  tempId: string
  values: Record<string, unknown>
}

export function createChangeBuffer() {
  let edits = $state<Map<string, CellEdit>>(new Map())
  let inserts = $state<RowInsert[]>([])
  let deletes = $state<Set<number>>(new Set())

  const hasChanges = $derived(edits.size > 0 || inserts.length > 0 || deletes.size > 0)
  const pendingChangeCount = $derived(edits.size + inserts.length + deletes.size)

  function setCellEdit(rowIndex: number, column: string, originalValue: unknown, newValue: unknown) {
    const key = `${rowIndex}:${column}`
    // If reverted to original, remove the edit
    if (newValue === originalValue || (String(newValue) === String(originalValue))) {
      edits.delete(key)
      edits = new Map(edits)
    } else {
      edits.set(key, { rowIndex, column, originalValue, newValue })
      edits = new Map(edits)
    }
  }

  function setInsertCellValue(tempId: string, column: string, value: unknown) {
    const row = inserts.find((r) => r.tempId === tempId)
    if (row) {
      row.values[column] = value
      inserts = [...inserts]
    }
  }

  function addInsertRow(columns: string[]): RowInsert {
    const row: RowInsert = {
      tempId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      values: {}
    }
    for (const col of columns) {
      row.values[col] = null
    }
    inserts = [...inserts, row]
    return row
  }

  function removeInsertRow(tempId: string) {
    inserts = inserts.filter((r) => r.tempId !== tempId)
  }

  function markRowDeleted(rowIndex: number) {
    deletes.add(rowIndex)
    deletes = new Set(deletes)
  }

  function unmarkRowDeleted(rowIndex: number) {
    deletes.delete(rowIndex)
    deletes = new Set(deletes)
  }

  function toggleRowDeleted(rowIndex: number) {
    if (deletes.has(rowIndex)) {
      unmarkRowDeleted(rowIndex)
    } else {
      markRowDeleted(rowIndex)
    }
  }

  function isEdited(rowIndex: number, column: string): boolean {
    return edits.has(`${rowIndex}:${column}`)
  }

  function isDeleted(rowIndex: number): boolean {
    return deletes.has(rowIndex)
  }

  function getEditedValue(rowIndex: number, column: string): unknown | undefined {
    return edits.get(`${rowIndex}:${column}`)?.newValue
  }

  function clearAll() {
    edits = new Map()
    inserts = []
    deletes = new Set()
  }

  return {
    get edits() { return edits },
    get inserts() { return inserts },
    get deletes() { return deletes },
    get hasChanges() { return hasChanges },
    get pendingChangeCount() { return pendingChangeCount },
    setCellEdit,
    setInsertCellValue,
    addInsertRow,
    removeInsertRow,
    markRowDeleted,
    unmarkRowDeleted,
    toggleRowDeleted,
    isEdited,
    isDeleted,
    getEditedValue,
    clearAll
  }
}
