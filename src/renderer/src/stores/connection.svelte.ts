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

const STORAGE_KEY = 'sql-client-connection'

const DEFAULT_CONNECTION: ConnectionInfo = {
  host: 'localhost',
  port: 5432,
  database: 'n8n',
  username: 'root',
  password: 'password'
}

function loadConnectionInfo(): ConnectionInfo {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        host: parsed.host ?? DEFAULT_CONNECTION.host,
        port: parsed.port ?? DEFAULT_CONNECTION.port,
        database: parsed.database ?? DEFAULT_CONNECTION.database,
        username: parsed.username ?? DEFAULT_CONNECTION.username,
        password: parsed.password ?? DEFAULT_CONNECTION.password
      }
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_CONNECTION }
}

function saveConnectionInfo(info: ConnectionInfo): void {
  try {
    // Explicitly extract plain values — Svelte 5 $state proxies don't always serialize correctly
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      host: info.host,
      port: info.port,
      database: info.database,
      username: info.username,
      password: info.password
    }))
  } catch {
    // localStorage not available
  }
}

let connected = $state(false)
let connecting = $state(false)
let error = $state<string | null>(null)
let connectionInfo = $state<ConnectionInfo>(loadConnectionInfo())
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
      // Persist on successful connection
      saveConnectionInfo(connectionInfo)
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
  saveConnectionInfo(connectionInfo)
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
