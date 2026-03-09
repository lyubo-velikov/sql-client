import type { SavedConnection } from '../shared/types'
import { generateId } from '../shared/utils'
import { createJsonStore } from './persistence'

let connections: SavedConnection[] = []

const store = createJsonStore<SavedConnection[]>('connections.json', [])

export function initConnections(): void {
  const loaded = store.load()
  connections = Array.isArray(loaded) ? loaded : []
}

export function saveConnections(): void {
  store.save(connections)
}

export function getAllConnections(): SavedConnection[] {
  return connections
}

export function getConnectionById(id: string): SavedConnection | undefined {
  return connections.find((c) => c.id === id)
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
