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

  executeTransaction: (params: {
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
  }) => ipcRenderer.invoke('db:execute-transaction', params),

  getForeignKeys: () => ipcRenderer.invoke('db:foreign-keys'),

  getIndexes: (schema: string, table: string) =>
    ipcRenderer.invoke('db:indexes', { schema, table }),

  getHistory: (params: { limit?: number; offset?: number }) =>
    ipcRenderer.invoke('history:get', params),

  searchHistory: (query: string, limit?: number) =>
    ipcRenderer.invoke('history:search', { query, limit }),

  clearHistory: () => ipcRenderer.invoke('history:clear'),

  executeUndo: (operations: Array<{ reverseSql: string; reverseParams: unknown[] }>) =>
    ipcRenderer.invoke('history:execute-undo', { operations }),

  // Saved connections
  listConnections: () => ipcRenderer.invoke('connections:list'),

  createConnection: (conn: {
    name: string; color: string; host: string; port: number;
    database: string; username: string; password: string
  }) => ipcRenderer.invoke('connections:create', conn),

  updateConnection: (id: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('connections:update', { id, updates }),

  deleteConnection: (id: string) =>
    ipcRenderer.invoke('connections:delete', { id }),

  duplicateConnection: (id: string) =>
    ipcRenderer.invoke('connections:duplicate', { id }),

  // Query files
  listQueryFiles: () => ipcRenderer.invoke('queries:list-files'),
  readQueryFile: (filePath: string) => ipcRenderer.invoke('queries:read-file', { filePath }),
  writeQueryFile: (filePath: string, content: string) => ipcRenderer.invoke('queries:write-file', { filePath, content }),
  createQueryFile: (name?: string) => ipcRenderer.invoke('queries:create-file', name ? { name } : undefined),
  deleteQueryFile: (filePath: string) => ipcRenderer.invoke('queries:delete-file', { filePath }),
  renameQueryFile: (oldPath: string, newName: string) => ipcRenderer.invoke('queries:rename-file', { oldPath, newName }),
  getQueriesDirectory: () => ipcRenderer.invoke('queries:get-directory'),
  setQueriesDirectory: (directory: string) => ipcRenderer.invoke('queries:set-directory', { directory }),
  pickQueriesDirectory: () => ipcRenderer.invoke('queries:pick-directory'),
  revealInFinder: (filePath: string) => ipcRenderer.invoke('queries:reveal-in-finder', { filePath }),
  onFilesChanged: (callback: () => void) => {
    ipcRenderer.on('queries:files-changed', callback)
    return () => { ipcRenderer.removeListener('queries:files-changed', callback) }
  },

  // AI Assistant
  hasAiApiKey: () => ipcRenderer.invoke('ai:has-api-key'),
  setAiApiKey: (key: string) => ipcRenderer.invoke('ai:set-api-key', { key }),
  getAiModel: () => ipcRenderer.invoke('ai:get-model'),
  setAiModel: (model: string) => ipcRenderer.invoke('ai:set-model', { model }),
  getAiProvider: () => ipcRenderer.invoke('ai:get-provider'),
  setAiProvider: (provider: 'api' | 'claude-cli') => ipcRenderer.invoke('ai:set-provider', { provider }),
  sendAiMessage: (params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
  }) => ipcRenderer.invoke('ai:send-message', params),
  stopAiStream: () => ipcRenderer.invoke('ai:stop-stream'),
  listAiConversations: () => ipcRenderer.invoke('ai:list-conversations'),
  saveAiConversation: (conversation: any) => ipcRenderer.invoke('ai:save-conversation', { conversation }),
  deleteAiConversation: (id: string) => ipcRenderer.invoke('ai:delete-conversation', { id }),
  onAiStreamChunk: (callback: (data: { messageId: string; content: string; done: boolean; error?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('ai:stream-chunk', handler)
    return () => { ipcRenderer.removeListener('ai:stream-chunk', handler) }
  }
}

contextBridge.exposeInMainWorld('api', api)
