export interface QueryFile {
  name: string
  filePath: string
  mtime: number
  size: number
}

export interface HistoryEntry {
  id: string
  timestamp: number
  source: 'manual' | 'transaction'
  sql: string
  params?: unknown[]
  status: 'success' | 'error'
  error?: string
  duration: number
  affectedRows?: number
  database: string
  undoData?: UndoData
}

export interface UndoData {
  operations: UndoOperation[]
}

export interface UndoOperation {
  type: 'reverse-update' | 'reverse-insert' | 'reverse-delete'
  reverseSql: string
  reverseParams: unknown[]
  description: string
}

export interface SavedConnection {
  id: string
  name: string
  color: string
  host: string
  port: number
  database: string
  username: string
  password: string
  createdAt: number
  updatedAt: number
  lastConnectedAt?: number
}

export const CONNECTION_COLORS = [
  '#10a37f', // green
  '#3b82f6', // blue
  '#ef4444', // red
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
]

export interface StatementWithMeta {
  sql: string
  params: unknown[]
  meta: {
    type: 'update' | 'insert' | 'delete'
    schema: string
    table: string
    affectedColumns?: string[]
    whereColumns?: string[]
    whereValues?: unknown[]
    fullRowData?: Record<string, unknown>
  }
}
