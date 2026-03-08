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
}

declare global {
  interface Window {
    api: DbApi
  }
}
