import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { Sql } from 'postgres'
import { connectToDatabase, disconnectDatabase, getConnection, isConnected } from './db'
import { performance } from 'perf_hooks'

interface FilterParam {
  column: string
  operator: string
  value: string
}

const ALLOWED_OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL']

function buildWhereClause(sql: Sql, filters?: FilterParam[]) {
  if (!filters || filters.length === 0) return sql``

  const conditions = filters
    .filter((f) => ALLOWED_OPERATORS.includes(f.operator))
    .map((f) => {
      const col = sql(f.column)
      switch (f.operator) {
        case 'IS NULL':
          return sql`${col} IS NULL`
        case 'IS NOT NULL':
          return sql`${col} IS NOT NULL`
        case '=':
          return sql`${col} = ${f.value}`
        case '!=':
          return sql`${col} != ${f.value}`
        case '>':
          return sql`${col} > ${f.value}`
        case '<':
          return sql`${col} < ${f.value}`
        case '>=':
          return sql`${col} >= ${f.value}`
        case '<=':
          return sql`${col} <= ${f.value}`
        case 'LIKE':
          return sql`${col} LIKE ${f.value}`
        case 'NOT LIKE':
          return sql`${col} NOT LIKE ${f.value}`
        default:
          return null
      }
    })
    .filter(Boolean)

  if (conditions.length === 0) return sql``

  let combined = conditions[0]!
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} AND ${conditions[i]!}`
  }
  return sql`WHERE ${combined}`
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('db:connect', async (_event, params: { host: string; port: number; database: string; username: string; password: string }) => {
    try {
      const sql = connectToDatabase(params)
      // Test the connection by running a simple query
      await sql`SELECT 1`
      return { success: true, data: { message: 'Connected successfully' } }
    } catch (error) {
      // If connection failed, clean up
      try { await disconnectDatabase() } catch { /* ignore cleanup errors */ }
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:disconnect', async () => {
    try {
      await disconnectDatabase()
      return { success: true, data: { message: 'Disconnected successfully' } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:list-tables', async () => {
    try {
      const sql = getConnection()
      const tables = await sql`
        SELECT schemaname, tablename,
          (SELECT reltuples::bigint FROM pg_class WHERE relname = tablename) as row_count
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schemaname, tablename
      `
      return { success: true, data: tables }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:table-schema', async (_event, params: { schema: string; table: string }) => {
    try {
      const sql = getConnection()
      const columns = await sql`
        SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
          c.character_maximum_length,
          CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN (
          SELECT ku.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = ${params.table} AND tc.table_schema = ${params.schema}
        ) pk ON c.column_name = pk.column_name
        WHERE c.table_name = ${params.table} AND c.table_schema = ${params.schema}
        ORDER BY c.ordinal_position
      `
      return { success: true, data: columns }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:table-data', async (_event, params: { schema: string; table: string; page: number; pageSize: number; sortColumn?: string; sortDirection?: 'asc' | 'desc'; filters?: FilterParam[] }) => {
    try {
      const sql = getConnection()
      const { schema, table, page, pageSize, sortColumn, sortDirection, filters } = params
      const offset = (page - 1) * pageSize
      const where = buildWhereClause(sql, filters)

      // Get total count (with filters applied)
      const countResult = await sql`
        SELECT count(*)::int as total_count
        FROM ${sql(schema)}.${sql(table)}
        ${where}
      `
      const totalCount = countResult[0].total_count

      // Get paginated data with optional sorting and filters
      let rows
      if (sortColumn) {
        const direction = sortDirection === 'desc' ? sql`DESC` : sql`ASC`
        rows = await sql`
          SELECT * FROM ${sql(schema)}.${sql(table)}
          ${where}
          ORDER BY ${sql(sortColumn)} ${direction}
          LIMIT ${pageSize} OFFSET ${offset}
        `
      } else {
        rows = await sql`
          SELECT * FROM ${sql(schema)}.${sql(table)}
          ${where}
          LIMIT ${pageSize} OFFSET ${offset}
        `
      }

      return { success: true, data: { rows, totalCount } }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:execute-query', async (_event, params: { query: string }) => {
    try {
      const sql = getConnection()
      const start = performance.now()
      const result = await sql.unsafe(params.query)
      const duration = performance.now() - start

      return {
        success: true,
        data: {
          rows: Array.from(result),
          fields: result.columns?.map((col) => ({ name: col.name, type: col.type })) ?? [],
          rowCount: result.count,
          duration: Math.round(duration * 100) / 100
        }
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:foreign-keys', async () => {
    try {
      const sql = getConnection()
      const foreignKeys = await sql`
        SELECT
          tc.table_schema, tc.table_name, kcu.column_name,
          ccu.table_schema AS foreign_table_schema,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
      `
      return { success: true, data: foreignKeys }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('db:indexes', async (_event, params: { schema: string; table: string }) => {
    try {
      const sql = getConnection()
      const indexes = await sql`
        SELECT
          i.relname AS index_name,
          a.attname AS column_name,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary,
          am.amname AS index_type
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = ${params.table}
          AND n.nspname = ${params.schema}
        ORDER BY i.relname, a.attnum
      `
      return { success: true, data: indexes }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  if (isConnected()) {
    await disconnectDatabase()
  }
})
