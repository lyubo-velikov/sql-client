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

  executeTransaction(params: {
    statements: Array<{
      sql: string
      params: unknown[]
      meta?: {
        type: 'update' | 'insert' | 'delete'
        schema: string
        table: string
        affectedColumns?: string[]
        whereColumns?: string[]
        whereValues?: unknown[]
        fullRowData?: Record<string, unknown>
      }
    }>
    primaryKeyColumns?: string[]
  }): Promise<{
    success: boolean
    data?: { affectedRows: number; undoData?: import('../shared/types').UndoData }
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

  executeUndo(operations: Array<{ reverseSql: string; reverseParams: unknown[] }>): Promise<{
    success: boolean
    data?: { affectedRows: number }
    error?: string
  }>

  listConnections(): Promise<import('../shared/types').SavedConnection[]>

  createConnection(conn: {
    name: string; color: string; host: string; port: number;
    database: string; username: string; password: string
  }): Promise<import('../shared/types').SavedConnection>

  updateConnection(id: string, updates: Record<string, unknown>): Promise<import('../shared/types').SavedConnection | null>

  deleteConnection(id: string): Promise<boolean>

  duplicateConnection(id: string): Promise<import('../shared/types').SavedConnection | null>

  // Query files
  listQueryFiles(): Promise<import('../shared/types').QueryFile[]>
  readQueryFile(filePath: string): Promise<{ content: string; mtime: number }>
  writeQueryFile(filePath: string, content: string): Promise<{ success: boolean; mtime: number }>
  createQueryFile(name?: string): Promise<{ filePath: string; name: string }>
  deleteQueryFile(filePath: string): Promise<boolean>
  renameQueryFile(oldPath: string, newName: string): Promise<{ newPath: string }>
  getQueriesDirectory(): Promise<{ directory: string }>
  setQueriesDirectory(directory: string): Promise<{ success: boolean }>
  pickQueriesDirectory(): Promise<{ directory: string } | null>
  revealInFinder(filePath: string): Promise<void>
  onFilesChanged(callback: () => void): () => void
}

declare global {
  interface Window {
    api: DbApi
  }
}
