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
}
