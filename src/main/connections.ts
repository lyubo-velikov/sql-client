import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { SavedConnection } from '../shared/types'

let connections: SavedConnection[] = []
let filePath: string | null = null

function getFilePath(): string {
  if (!filePath) {
    filePath = join(app.getPath('userData'), 'connections.json')
  }
  return filePath
}

function generateId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function initConnections(): void {
  try {
    const path = getFilePath()
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        connections = parsed
      }
    }
  } catch {
    connections = []
  }
}

export function saveConnections(): void {
  try {
    writeFileSync(getFilePath(), JSON.stringify(connections, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to save connections:', e)
  }
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
    id: generateId(),
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
