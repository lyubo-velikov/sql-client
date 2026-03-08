import type { SavedConnection } from '../../../shared/types'

let connections = $state<SavedConnection[]>([])
let loaded = $state(false)

async function load() {
  connections = await window.api.listConnections()
  loaded = true
}

async function create(conn: Omit<SavedConnection, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedConnection> {
  const saved = await window.api.createConnection(conn)
  connections = [...connections, saved]
  return saved
}

async function update(id: string, updates: Partial<SavedConnection>): Promise<SavedConnection | null> {
  const plain = JSON.parse(JSON.stringify(updates))
  const updated = await window.api.updateConnection(id, plain)
  if (updated) {
    connections = connections.map((c) => (c.id === id ? updated : c))
  }
  return updated
}

async function remove(id: string): Promise<boolean> {
  const result = await window.api.deleteConnection(id)
  if (result) {
    connections = connections.filter((c) => c.id !== id)
  }
  return result
}

async function duplicate(id: string): Promise<SavedConnection | null> {
  const duped = await window.api.duplicateConnection(id)
  if (duped) {
    connections = [...connections, duped]
  }
  return duped
}

export const savedConnectionsStore = {
  get connections() { return connections },
  get loaded() { return loaded },
  load,
  create,
  update,
  remove,
  duplicate
}
