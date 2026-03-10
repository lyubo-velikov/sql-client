import type { SavedConnection } from '../../../shared/types'
import { DEFAULT_CONNECTION_COLOR } from '../../../shared/constants'
import { formatError } from '../../../shared/utils'

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

const ACTIVE_KEY = 'sql-client-active-connection-id'
const LEGACY_KEY = 'sql-client-connection'

const DEFAULT_CONNECTION: ConnectionInfo = {
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  username: '',
  password: ''
}

let connected = $state(false)
let connecting = $state(false)
let error = $state<string | null>(null)
let connectionInfo = $state<ConnectionInfo>({ ...DEFAULT_CONNECTION })
let tables = $state<TableInfo[]>([])
let foreignKeys = $state<ForeignKey[]>([])

// Active saved connection identity
let activeConnectionId = $state<string | null>(null)
let activeConnectionName = $state('')
let activeConnectionColor = $state(DEFAULT_CONNECTION_COLOR)

function loadLastActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? null
  } catch {
    return null
  }
}

function saveLastActiveId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
  } catch { /* ignore */ }
}

/** Migrate old single-connection localStorage to the new system */
export function getLegacyConnection(): ConnectionInfo | null {
  try {
    const stored = localStorage.getItem(LEGACY_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      localStorage.removeItem(LEGACY_KEY)
      return {
        host: parsed.host ?? DEFAULT_CONNECTION.host,
        port: parsed.port ?? DEFAULT_CONNECTION.port,
        database: parsed.database ?? DEFAULT_CONNECTION.database,
        username: parsed.username ?? DEFAULT_CONNECTION.username,
        password: parsed.password ?? DEFAULT_CONNECTION.password
      }
    }
  } catch { /* ignore */ }
  return null
}

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
    error = formatError(err)
    connected = false
    return false
  } finally {
    connecting = false
  }
}

async function connectSaved(saved: SavedConnection): Promise<boolean> {
  activeConnectionId = saved.id
  activeConnectionName = saved.name
  activeConnectionColor = saved.color
  saveLastActiveId(saved.id)

  const success = await connect({
    host: saved.host,
    port: saved.port,
    database: saved.database,
    username: saved.username,
    password: saved.password
  })

  if (success) {
    // Update lastConnectedAt
    try {
      await window.api.updateConnection(saved.id, { lastConnectedAt: Date.now() })
    } catch { /* ignore */ }
  } else {
    activeConnectionId = null
    activeConnectionName = ''
    activeConnectionColor = DEFAULT_CONNECTION_COLOR
    saveLastActiveId(null)
  }

  return success
}

async function disconnect(): Promise<void> {
  try {
    await window.api.disconnect()
  } catch { /* ignore */ }
  connected = false
  tables = []
  foreignKeys = []
  error = null
  activeConnectionId = null
  activeConnectionName = ''
  activeConnectionColor = DEFAULT_CONNECTION_COLOR
  saveLastActiveId(null)
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
  get connected() { return connected },
  get connecting() { return connecting },
  get error() { return error },
  get connectionInfo() { return connectionInfo },
  get tables() { return tables },
  get foreignKeys() { return foreignKeys },
  get activeConnectionId() { return activeConnectionId },
  get activeConnectionName() { return activeConnectionName },
  get activeConnectionColor() { return activeConnectionColor },
  connect,
  connectSaved,
  disconnect,
  refreshTables,
  refreshForeignKeys,
  setConnectionInfo,
  loadLastActiveId,
  getLegacyConnection
}
