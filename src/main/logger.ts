import { app } from 'electron'
import { join } from 'path'
import { appendFileSync, writeFileSync } from 'fs'

let logPath: string | null = null

function getLogPath(): string {
  if (!logPath) {
    logPath = join(app.getPath('userData'), 'app.log')
  }
  return logPath
}

export function initLogger(): void {
  const path = getLogPath()
  writeFileSync(path, `--- Session started: ${new Date().toISOString()} ---\n`, 'utf-8')
  console.log(`[Logger] Writing logs to: ${path}`)
}

export function log(...args: unknown[]): void {
  const timestamp = new Date().toISOString().slice(11, 23)
  const msg = args.map((a) => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ')
  const line = `[${timestamp}] ${msg}\n`
  try {
    appendFileSync(getLogPath(), line, 'utf-8')
  } catch { /* ignore */ }
}
