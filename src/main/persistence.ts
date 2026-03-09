import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { log } from './logger'
import { formatError } from '../shared/utils'

export interface JsonStore<T> {
  load(): T
  save(data: T): void
  getPath(): string
}

export function createJsonStore<T>(fileName: string, defaultValue: T, compact = false): JsonStore<T> {
  let cachedPath: string | null = null

  function getPath(): string {
    if (!cachedPath) {
      cachedPath = join(app.getPath('userData'), fileName)
    }
    return cachedPath
  }

  function load(): T {
    try {
      const path = getPath()
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, 'utf-8'))
      }
    } catch {
      // Return default on error
    }
    return structuredClone(defaultValue)
  }

  function save(data: T): void {
    try {
      writeFileSync(getPath(), compact ? JSON.stringify(data) : JSON.stringify(data, null, 2), 'utf-8')
    } catch (e) {
      log(`Failed to save ${fileName}: ${formatError(e)}`)
    }
  }

  return { load, save, getPath }
}
