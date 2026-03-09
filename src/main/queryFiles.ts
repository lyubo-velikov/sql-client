import { app, shell, BrowserWindow } from 'electron'
import { join, basename, extname, dirname } from 'path'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, renameSync, watch } from 'fs'
import { homedir } from 'os'
import type { QueryFile } from '../shared/types'
import { log } from './logger'

const SETTINGS_FILE = 'settings.json'

let queriesDir: string = ''
let watcher: ReturnType<typeof watch> | null = null

function getSettingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

function loadSettings(): Record<string, unknown> {
  try {
    const path = getSettingsPath()
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {}
}

function saveSettings(settings: Record<string, unknown>): void {
  try {
    writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    log('Failed to save settings:', e)
  }
}

export function initQueryFiles(): void {
  const settings = loadSettings()
  queriesDir = (settings.queriesDirectory as string) || join(homedir(), 'SQL Queries')

  // Create directory if it doesn't exist
  if (!existsSync(queriesDir)) {
    try {
      mkdirSync(queriesDir, { recursive: true })
    } catch (e) {
      log('Failed to create queries directory:', e)
    }
  }

  startWatcher()
}

let watcherDebounce: ReturnType<typeof setTimeout> | null = null

function startWatcher(): void {
  stopWatcher()
  try {
    if (existsSync(queriesDir)) {
      watcher = watch(queriesDir, { persistent: false }, () => {
        // Debounce to avoid rapid-fire events
        if (watcherDebounce) clearTimeout(watcherDebounce)
        watcherDebounce = setTimeout(() => {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('queries:files-changed')
          }
        }, 300)
      })
    }
  } catch {
    // Watcher not available on this platform/path
  }
}

function stopWatcher(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}

export function getQueriesDir(): string {
  return queriesDir
}

export function setQueriesDir(dir: string): void {
  queriesDir = dir
  const settings = loadSettings()
  settings.queriesDirectory = dir
  saveSettings(settings)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  startWatcher()
}

export function listFiles(): QueryFile[] {
  try {
    const entries = readdirSync(queriesDir)
    const files: QueryFile[] = []
    for (const entry of entries) {
      if (extname(entry).toLowerCase() !== '.sql') continue
      const filePath = join(queriesDir, entry)
      try {
        const stat = statSync(filePath)
        if (stat.isFile()) {
          files.push({
            name: entry,
            filePath,
            mtime: stat.mtimeMs,
            size: stat.size
          })
        }
      } catch { /* skip inaccessible files */ }
    }
    // Sort by most recently modified first
    files.sort((a, b) => b.mtime - a.mtime)
    return files
  } catch {
    return []
  }
}

export function readFile(filePath: string): { content: string; mtime: number } {
  const content = readFileSync(filePath, 'utf-8')
  const stat = statSync(filePath)
  return { content, mtime: stat.mtimeMs }
}

export function writeFile(filePath: string, content: string): { success: boolean; mtime: number } {
  writeFileSync(filePath, content, 'utf-8')
  const stat = statSync(filePath)
  return { success: true, mtime: stat.mtimeMs }
}

export function createFile(name?: string): { filePath: string; name: string } {
  let fileName: string
  if (name) {
    fileName = name.endsWith('.sql') ? name : `${name}.sql`
  } else {
    // Auto-name: "Query 1.sql", "Query 2.sql", etc.
    const existing = new Set(
      readdirSync(queriesDir)
        .filter((f) => f.toLowerCase().endsWith('.sql'))
        .map((f) => f.toLowerCase())
    )
    let n = 1
    while (existing.has(`query ${n}.sql`)) n++
    fileName = `Query ${n}.sql`
  }

  const filePath = join(queriesDir, fileName)
  writeFileSync(filePath, '', 'utf-8')
  return { filePath, name: fileName }
}

export function deleteFile(filePath: string): boolean {
  try {
    shell.trashItem(filePath)
    return true
  } catch {
    return false
  }
}

export function renameFile(oldPath: string, newName: string): { newPath: string } {
  const newFileName = newName.endsWith('.sql') ? newName : `${newName}.sql`
  const newPath = join(dirname(oldPath), newFileName)
  if (!existsSync(oldPath)) {
    throw new Error(`File not found: ${oldPath}`)
  }
  renameSync(oldPath, newPath)
  return { newPath }
}

export function revealInFinder(filePath: string): void {
  shell.showItemInFolder(filePath)
}

export function cleanup(): void {
  stopWatcher()
}
