import type { CellEdit, RowInsert } from '../stores/changeBuffer.svelte'

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

export function buildUpdateStatements(
  schema: string,
  table: string,
  edits: Map<string, CellEdit>,
  rows: Record<string, unknown>[],
  primaryKeyColumns: string[]
): Array<{ sql: string; params: unknown[] }> {
  // Group edits by row
  const rowEdits = new Map<number, CellEdit[]>()
  for (const edit of edits.values()) {
    const list = rowEdits.get(edit.rowIndex) ?? []
    list.push(edit)
    rowEdits.set(edit.rowIndex, list)
  }

  const statements: Array<{ sql: string; params: unknown[] }> = []

  for (const [rowIndex, cellEdits] of rowEdits) {
    const row = rows[rowIndex]
    if (!row) continue

    const params: unknown[] = []
    let paramIdx = 1

    // SET clause
    const setClauses = cellEdits.map((edit) => {
      params.push(edit.newValue)
      return `${quoteIdent(edit.column)} = $${paramIdx++}`
    })

    // WHERE clause using primary keys (original values from the row)
    const whereClauses = primaryKeyColumns.map((pk) => {
      const val = row[pk]
      if (val === null || val === undefined) {
        return `${quoteIdent(pk)} IS NULL`
      }
      params.push(val)
      return `${quoteIdent(pk)} = $${paramIdx++}`
    })

    const sql = `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`
    statements.push({ sql, params })
  }

  return statements
}

export function buildInsertStatements(
  schema: string,
  table: string,
  inserts: RowInsert[]
): Array<{ sql: string; params: unknown[] }> {
  return inserts.map((insert) => {
    const cols = Object.keys(insert.values)
    const params = cols.map((c) => insert.values[c])
    const placeholders = cols.map((_, i) => `$${i + 1}`)

    const sql = `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')})`
    return { sql, params }
  })
}

export function buildDeleteStatements(
  schema: string,
  table: string,
  deletes: Set<number>,
  rows: Record<string, unknown>[],
  primaryKeyColumns: string[]
): Array<{ sql: string; params: unknown[] }> {
  const statements: Array<{ sql: string; params: unknown[] }> = []

  for (const rowIndex of deletes) {
    const row = rows[rowIndex]
    if (!row) continue

    const params: unknown[] = []
    let paramIdx = 1

    const whereClauses = primaryKeyColumns.map((pk) => {
      const val = row[pk]
      if (val === null || val === undefined) {
        return `${quoteIdent(pk)} IS NULL`
      }
      params.push(val)
      return `${quoteIdent(pk)} = $${paramIdx++}`
    })

    const sql = `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${whereClauses.join(' AND ')}`
    statements.push({ sql, params })
  }

  return statements
}
