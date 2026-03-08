import { contextBridge, ipcRenderer } from 'electron'

const api = {
  connect: (params: {
    host: string
    port: number
    database: string
    username: string
    password: string
  }) => ipcRenderer.invoke('db:connect', params),

  disconnect: () => ipcRenderer.invoke('db:disconnect'),

  listTables: () => ipcRenderer.invoke('db:list-tables'),

  getTableSchema: (schema: string, table: string) =>
    ipcRenderer.invoke('db:table-schema', { schema, table }),

  getTableData: (params: {
    schema: string
    table: string
    page: number
    pageSize: number
    sortColumn?: string
    sortDirection?: 'asc' | 'desc'
    filters?: Array<{ column: string; operator: string; value: string }>
  }) => ipcRenderer.invoke('db:table-data', params),

  executeQuery: (query: string) => ipcRenderer.invoke('db:execute-query', { query }),

  getForeignKeys: () => ipcRenderer.invoke('db:foreign-keys'),

  getIndexes: (schema: string, table: string) =>
    ipcRenderer.invoke('db:indexes', { schema, table })
}

contextBridge.exposeInMainWorld('api', api)
