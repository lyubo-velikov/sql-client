import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { HistoryEntry } from '../shared/types'

const MAX_ENTRIES = 500

let entries: HistoryEntry[] = []
let filePath: string | null = null

function getFilePath(): string {
  if (!filePath) {
    filePath = join(app.getPath('userData'), 'query-history.json')
  }
  return filePath
}

function generateId(): string {
  return `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function initHistory(): void {
  try {
    const path = getFilePath()
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        entries = parsed.slice(-MAX_ENTRIES)
      }
    }
  } catch {
    // Start fresh if file is corrupt
    entries = []
  }
}

export function saveHistory(): void {
  try {
    writeFileSync(getFilePath(), JSON.stringify(entries), 'utf-8')
  } catch (e) {
    console.error('Failed to save history:', e)
  }
}

export function addEntry(
  entry: Omit<HistoryEntry, 'id' | 'timestamp'>
): HistoryEntry {
  const full: HistoryEntry = {
    ...entry,
    id: generateId(),
    timestamp: Date.now()
  }
  entries.push(full)
  // Trim to cap
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(-MAX_ENTRIES)
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
