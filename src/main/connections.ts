import { safeStorage } from 'electron'
import type { SavedConnection } from '../shared/types'
import { generateId } from '../shared/utils'
import { createJsonStore } from './persistence'

let connections: SavedConnection[] = []

const store = createJsonStore<SavedConnection[]>('connections.json', [])

function encryptPassword(password: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(password).toString('base64')
  }
  return password
}

function decryptPassword(stored: string): string {
  if (stored.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(stored.slice(4), 'base64')
      return safeStorage.decryptString(buffer)
    } catch {
      return stored
    }
  }
  return stored
}

export function initConnections(): void {
  const loaded = store.load()
  connections = Array.isArray(loaded) ? loaded : []
}

export function saveConnections(): void {
  // Encrypt passwords before persisting
  const toSave = connections.map((c) => ({
    ...c,
    password: c.password && !c.password.startsWith('enc:') ? encryptPassword(c.password) : c.password
  }))
  store.save(toSave)
}

/** Return connections with passwords decrypted for use */
function decryptedConnections(): SavedConnection[] {
  return connections.map((c) => ({
    ...c,
    password: decryptPassword(c.password)
  }))
}

export function getAllConnections(): SavedConnection[] {
  return decryptedConnections()
}

export function getConnectionById(id: string): SavedConnection | undefined {
  const conn = connections.find((c) => c.id === id)
  if (!conn) return undefined
  return { ...conn, password: decryptPassword(conn.password) }
}

export function addConnection(
  conn: Omit<SavedConnection, 'id' | 'createdAt' | 'updatedAt'>
): SavedConnection {
  const now = Date.now()
  const saved: SavedConnection = {
    ...conn,
    id: generateId('conn'),
    createdAt: now,
    updatedAt: now
  }
  connections.push(saved)
  saveConnections()
  return saved
}

export function updateConnection(
  id: string,
  updates: Partial<Omit<SavedConnection, 'id' | 'createdAt'>>
): SavedConnection | null {
  const conn = connections.find((c) => c.id === id)
  if (!conn) return null
  Object.assign(conn, updates, { updatedAt: Date.now() })
  saveConnections()
  return conn
}

export function deleteConnection(id: string): boolean {
  const idx = connections.findIndex((c) => c.id === id)
  if (idx === -1) return false
  connections.splice(idx, 1)
  saveConnections()
  return true
}

export function duplicateConnection(id: string): SavedConnection | null {
  const conn = connections.find((c) => c.id === id)
  if (!conn) return null
  return addConnection({
    name: `${conn.name} (copy)`,
    color: conn.color,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    password: conn.password
  })
}
