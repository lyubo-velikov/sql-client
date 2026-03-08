export interface ConnectionInfo {
  host: string
  port: number
  database: string
  username: string
  password: string
}

export interface TableInfo {
  schemaname: string
  tablename: string
  row_count: number
}

export interface ForeignKey {
  table_schema: string
  table_name: string
  column_name: string
  foreign_table_schema: string
  foreign_table_name: string
  foreign_column_name: string
}

let connected = $state(false)
let connecting = $state(false)
let error = $state<string | null>(null)
let connectionInfo = $state<ConnectionInfo>({
  host: 'localhost',
  port: 5432,
  database: 'n8n',
  username: 'root',
  password: 'password'
})
let tables = $state<TableInfo[]>([])
let foreignKeys = $state<ForeignKey[]>([])

async function connect(params?: ConnectionInfo): Promise<boolean> {
  if (params) {
    connectionInfo = { ...params }
  }

  connecting = true
  error = null

  try {
    const result = await window.api.connect({
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      username: connectionInfo.username,
      password: connectionInfo.password
    })

    if (result.success) {
      connected = true
      await refreshTables()
      await refreshForeignKeys()
      return true
    } else {
      error = result.error ?? 'Connection failed'
      connected = false
      return false
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    connected = false
    return false
  } finally {
    connecting = false
  }
}

async function disconnect(): Promise<void> {
  try {
    await window.api.disconnect()
  } catch {
    // ignore disconnect errors
  }
  connected = false
  tables = []
  foreignKeys = []
  error = null
}

async function refreshTables(): Promise<void> {
  try {
    const result = await window.api.listTables()
    if (result.success && result.data) {
      tables = result.data
    }
  } catch (err) {
    console.error('Failed to refresh tables:', err)
  }
}

async function refreshForeignKeys(): Promise<void> {
  try {
    const result = await window.api.getForeignKeys()
    if (result.success && result.data) {
      foreignKeys = result.data
    }
  } catch (err) {
    console.error('Failed to refresh foreign keys:', err)
  }
}

function setConnectionInfo(info: ConnectionInfo): void {
  connectionInfo = { ...info }
}

export const connectionStore = {
  get connected() {
    return connected
  },
  get connecting() {
    return connecting
  },
  get error() {
    return error
  },
  get connectionInfo() {
    return connectionInfo
  },
  get tables() {
    return tables
  },
  get foreignKeys() {
    return foreignKeys
  },
  connect,
  disconnect,
  refreshTables,
  refreshForeignKeys,
  setConnectionInfo
}
