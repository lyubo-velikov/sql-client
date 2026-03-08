import type { CellEdit, RowInsert } from '../stores/changeBuffer.svelte'
import type { StatementWithMeta } from '../../../shared/types'

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

export { quoteIdent }

// Serialize a value to be safely sent through Electron IPC (structured clone)
function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'bigint') return Number(val)
  if (typeof val === 'object') {
    try { return JSON.parse(JSON.stringify(val)) } catch { return String(val) }
  }
  return val
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    out[key] = serializeValue(row[key])
  }
  return out
}

export function buildUpdateStatements(
  schema: string,
  table: string,
  edits: Map<string, CellEdit>,
  rows: Record<string, unknown>[],
  primaryKeyColumns: string[]
): StatementWithMeta[] {
  // Group edits by row
  const rowEdits = new Map<number, CellEdit[]>()
  for (const edit of edits.values()) {
    const list = rowEdits.get(edit.rowIndex) ?? []
    list.push(edit)
    rowEdits.set(edit.rowIndex, list)
  }

  const statements: StatementWithMeta[] = []

  for (const [rowIndex, cellEdits] of rowEdits) {
    const row = rows[rowIndex]
    if (!row) continue

    const params: unknown[] = []
    let paramIdx = 1

    const affectedColumns = cellEdits.map((e) => e.column)

    // SET clause
    const setClauses = cellEdits.map((edit) => {
      params.push(edit.newValue)
      return `${quoteIdent(edit.column)} = $${paramIdx++}`
    })

    // WHERE clause using primary keys
    const whereValues: unknown[] = []
    const whereClauses = primaryKeyColumns.map((pk) => {
      const val = serializeValue(row[pk])
      if (val === null || val === undefined) {
        return `${quoteIdent(pk)} IS NULL`
      }
      params.push(val)
      whereValues.push(val)
      return `${quoteIdent(pk)} = $${paramIdx++}`
    })

    const sql = `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`
    statements.push({
      sql,
      params: params.map(serializeValue),
      meta: {
        type: 'update',
        schema,
        table,
        affectedColumns,
        whereColumns: primaryKeyColumns,
        whereValues
      }
    })
  }

  return statements
}

export function buildInsertStatements(
  schema: string,
  table: string,
  inserts: RowInsert[]
): StatementWithMeta[] {
  return inserts.map((insert) => {
    const cols = Object.keys(insert.values)
    const params = cols.map((c) => insert.values[c])
    const placeholders = cols.map((_, i) => `$${i + 1}`)

    const sql = `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')})`
    return {
      sql,
      params: params.map(serializeValue),
      meta: {
        type: 'insert' as const,
        schema,
        table,
        affectedColumns: cols
      }
    }
  })
}

export function buildDeleteStatements(
  schema: string,
  table: string,
  deletes: Set<number>,
  rows: Record<string, unknown>[],
  primaryKeyColumns: string[]
): StatementWithMeta[] {
  const statements: StatementWithMeta[] = []

  for (const rowIndex of deletes) {
    const row = rows[rowIndex]
    if (!row) continue

    const params: unknown[] = []
    let paramIdx = 1

    const whereValues: unknown[] = []
    const whereClauses = primaryKeyColumns.map((pk) => {
      const val = serializeValue(row[pk])
      if (val === null || val === undefined) {
        return `${quoteIdent(pk)} IS NULL`
      }
      params.push(val)
      whereValues.push(val)
      return `${quoteIdent(pk)} = $${paramIdx++}`
    })

    const sql = `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${whereClauses.join(' AND ')}`
    statements.push({
      sql,
      params: params.map(serializeValue),
      meta: {
        type: 'delete',
        schema,
        table,
        whereColumns: primaryKeyColumns,
        whereValues,
        fullRowData: serializeRow(row)
      }
    })
  }

  return statements
}
