export interface Filter {
  column: string
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'NOT LIKE' | 'IS NULL' | 'IS NOT NULL'
  value: string
}

export interface DbApi {
  connect(params: {
    host: string
    port: number
    database: string
    username: string
    password: string
  }): Promise<{ success: boolean; error?: string }>

  disconnect(): Promise<{ success: boolean }>

  listTables(): Promise<{
    success: boolean
    data?: Array<{ schemaname: string; tablename: string; row_count: number }>
  }>

  getTableSchema(
    schema: string,
    table: string
  ): Promise<{
    success: boolean
    data?: Array<{
      column_name: string
      data_type: string
      is_nullable: string
      column_default: string | null
      is_primary_key: boolean
    }>
  }>

  getTableData(params: {
    schema: string
    table: string
    page: number
    pageSize: number
    sortColumn?: string
    sortDirection?: 'asc' | 'desc'
    filters?: Filter[]
  }): Promise<{
    success: boolean
    data?: { rows: Record<string, unknown>[]; totalCount: number }
  }>

  executeQuery(query: string): Promise<{
    success: boolean
    data?: {
      rows: Record<string, unknown>[]
      fields: string[]
      rowCount: number
      duration: number
    }
  }>

  executeTransaction(statements: Array<{ sql: string; params: unknown[] }>): Promise<{
    success: boolean
    data?: { affectedRows: number }
    error?: string
  }>

  getForeignKeys(): Promise<{
    success: boolean
    data?: Array<{
      table_schema: string
      table_name: string
      column_name: string
      foreign_table_schema: string
      foreign_table_name: string
      foreign_column_name: string
    }>
  }>

  getIndexes(
    schema: string,
    table: string
  ): Promise<{
    success: boolean
    data?: Array<{ indexname: string; indexdef: string }>
  }>

  getHistory(params: { limit?: number; offset?: number }): Promise<{
    entries: Array<{
      id: string
      timestamp: number
      source: 'manual' | 'transaction'
      sql: string
      status: 'success' | 'error'
      error?: string
      duration: number
      affectedRows?: number
      database: string
    }>
    total: number
  }>

  searchHistory(query: string, limit?: number): Promise<Array<{
    id: string
    timestamp: number
    source: 'manual' | 'transaction'
    sql: string
    status: 'success' | 'error'
    error?: string
    duration: number
    affectedRows?: number
    database: string
  }>>

  clearHistory(): Promise<{ success: boolean }>
}

declare global {
  interface Window {
    api: DbApi
  }
}
