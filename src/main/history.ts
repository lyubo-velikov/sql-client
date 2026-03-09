import type { HistoryEntry } from '../shared/types'
import { generateId } from '../shared/utils'
import { MAX_HISTORY_ENTRIES } from '../shared/constants'
import { createJsonStore } from './persistence'

let entries: HistoryEntry[] = []

const store = createJsonStore<HistoryEntry[]>('query-history.json', [], true)

export function initHistory(): void {
  const loaded = store.load()
  entries = (Array.isArray(loaded) ? loaded : []).slice(-MAX_HISTORY_ENTRIES)
}

export function saveHistory(): void {
  store.save(entries)
}

export function addEntry(
  entry: Omit<HistoryEntry, 'id' | 'timestamp'>
): HistoryEntry {
  const full: HistoryEntry = {
    ...entry,
    id: generateId('hist'),
    timestamp: Date.now()
  }
  entries.push(full)
  // Trim to cap
  if (entries.length > MAX_HISTORY_ENTRIES) {
    entries = entries.slice(-MAX_HISTORY_ENTRIES)
  }
  return full
}

export function getEntries(params: {
  limit?: number
  offset?: number
}): { entries: HistoryEntry[]; total: number } {
  const { limit = 100, offset = 0 } = params
  // Return in reverse chronological order
  const reversed = [...entries].reverse()
  return {
    entries: reversed.slice(offset, offset + limit),
    total: entries.length
  }
}

export function searchEntries(query: string, limit = 100): HistoryEntry[] {
  const q = query.toLowerCase()
  return [...entries]
    .reverse()
    .filter((e) => e.sql.toLowerCase().includes(q))
    .slice(0, limit)
}

export function clearEntries(): void {
  entries = []
}
