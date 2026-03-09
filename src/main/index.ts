import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { Sql } from 'postgres'
import { connectToDatabase, disconnectDatabase, getConnection, isConnected, getCurrentDatabase } from './db'
import { performance } from 'perf_hooks'
import { initHistory, saveHistory, addEntry, getEntries, searchEntries, clearEntries } from './history'
import { initConnections, saveConnections, getAllConnections, addConnection, updateConnection, deleteConnection, duplicateConnection } from './connections'
import * as queryFiles from './queryFiles'
import * as ai from './ai'
import { initLogger } from './logger'
import type { UndoData, UndoOperation, StatementWithMeta } from '../shared/types'

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

function inlineParams(sqlStr: string, params: unknown[]): string {
  if (!params || params.length === 0) return sqlStr
  return sqlStr.replace(/\$(\d+)/g, (_, idx) => {
    const val = params[parseInt(idx, 10) - 1]
    if (val === null || val === undefined) return 'NULL'
    if (typeof val === 'number') return String(val)
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
    // Escape single quotes for string values
    return `'${String(val).replace(/'/g, "''")}'`
  })
}

function buildPkWhereClause(
  columns: string[],
  values: unknown[],
  startParam = 1
): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  let pi = startParam
  for (let i = 0; i < columns.length; i++) {
    const col = `"${columns[i].replace(/"/g, '""')}"`
    const val = values[i]
    if (val === null || val === undefined) {
      parts.push(`${col} IS NULL`)
    } else {
      parts.push(`${col} = $${pi++}`)
      params.push(val)
    }
  }
  return { sql: parts.join(' AND '), params }
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

  // Prevent Cmd+W from closing the window — let the renderer handle it as "close tab"
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if ((input.meta || input.control) && input.key === 'w') {
      _event.preventDefault()
    }
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
      const sql = await connectToDatabase(params)
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
    const start = performance.now()
    try {
      const sql = getConnection()
      const result = await sql.unsafe(params.query)
      const duration = performance.now() - start

      addEntry({
        source: 'manual',
        sql: params.query,
        status: 'success',
        duration: Math.round(duration * 100) / 100,
        affectedRows: result.count ?? 0,
        database: getCurrentDatabase()
      })

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
      const duration = performance.now() - start
      const errMsg = error instanceof Error ? error.message : String(error)
      addEntry({
        source: 'manual',
        sql: params.query,
        status: 'error',
        error: errMsg,
        duration: Math.round(duration * 100) / 100,
        database: getCurrentDatabase()
      })
      return { success: false, error: errMsg }
    }
  })

  ipcMain.handle('db:execute-transaction', async (_event, params: {
    statements: Array<StatementWithMeta | { sql: string; params: unknown[] }>
    primaryKeyColumns?: string[]
  }) => {
    const combinedSql = params.statements.map((s) => inlineParams(s.sql, s.params)).join(';\n')
    const start = performance.now()
    try {
      const conn = getConnection()
      let totalAffected = 0
      const undoOps: UndoOperation[] = []

      await conn.begin(async (tx) => {
        for (const stmt of params.statements) {
          const meta = 'meta' in stmt ? stmt.meta : undefined

          // Before-state capture for undo
          if (meta && undoOps.length < 100) {
            try {
              if (meta.type === 'update' && meta.affectedColumns && meta.whereColumns && meta.whereValues) {
                // SELECT original values before updating
                const selectCols = meta.affectedColumns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')
                const whereClause = buildPkWhereClause(meta.whereColumns, meta.whereValues)
                const before = await tx.unsafe(
                  `SELECT ${selectCols} FROM "${meta.schema}"."${meta.table}" WHERE ${whereClause.sql}`,
                  whereClause.params
                )
                if (before.length > 0) {
                  const original = before[0] as Record<string, unknown>
                  // Build reverse UPDATE
                  const reverseParts: string[] = []
                  const reverseParams: unknown[] = []
                  let pi = 1
                  for (const col of meta.affectedColumns) {
                    reverseParams.push(original[col])
                    reverseParts.push(`"${col.replace(/"/g, '""')}" = $${pi++}`)
                  }
                  const revWhere = buildPkWhereClause(meta.whereColumns, meta.whereValues, pi)
                  reverseParams.push(...revWhere.params)

                  undoOps.push({
                    type: 'reverse-update',
                    reverseSql: `UPDATE "${meta.schema}"."${meta.table}" SET ${reverseParts.join(', ')} WHERE ${revWhere.sql}`,
                    reverseParams,
                    description: `Restore ${meta.affectedColumns.join(', ')} in ${meta.schema}.${meta.table}`
                  })
                }
              } else if (meta.type === 'delete' && meta.fullRowData && meta.whereColumns) {
                // We already have the full row data from the renderer
                const row = meta.fullRowData
                const cols = Object.keys(row)
                const reverseParams = cols.map((c) => row[c])
                const placeholders = cols.map((_, i) => `$${i + 1}`)
                const quotedCols = cols.map((c) => `"${c.replace(/"/g, '""')}"`)

                undoOps.push({
                  type: 'reverse-delete',
                  reverseSql: `INSERT INTO "${meta.schema}"."${meta.table}" (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
                  reverseParams,
                  description: `Re-insert deleted row into ${meta.schema}.${meta.table}`
                })
              }
              // INSERT undo is handled after execution (need RETURNING)
            } catch {
              // Don't fail the transaction if undo capture fails
            }
          }

          // Execute the actual statement
          let execSql = stmt.sql
          const pkCols = params.primaryKeyColumns
          if (meta?.type === 'insert' && pkCols && pkCols.length > 0 && undoOps.length < 100) {
            // Append RETURNING for insert undo
            const retCols = pkCols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')
            execSql = `${stmt.sql} RETURNING ${retCols}`
          }

          const result = await tx.unsafe(execSql, stmt.params)
          totalAffected += result.count ?? 0

          // After-state capture for INSERTs
          if (meta?.type === 'insert' && pkCols && pkCols.length > 0 && result.length > 0 && undoOps.length < 100) {
            try {
              const insertedRow = result[0] as Record<string, unknown>
              const whereClause = buildPkWhereClause(pkCols, pkCols.map((c) => insertedRow[c]))
              undoOps.push({
                type: 'reverse-insert',
                reverseSql: `DELETE FROM "${meta.schema}"."${meta.table}" WHERE ${whereClause.sql}`,
                reverseParams: whereClause.params,
                description: `Delete inserted row from ${meta.schema}.${meta.table}`
              })
            } catch {
              // Don't fail if undo capture fails
            }
          }
        }
      })
      const duration = performance.now() - start

      // Reverse the undo operations order (INSERTs undone first, then UPDATEs, then DELETEs)
      undoOps.reverse()

      const undoData: UndoData | undefined = undoOps.length > 0 ? { operations: undoOps } : undefined

      addEntry({
        source: 'transaction',
        sql: combinedSql,
        status: 'success',
        duration: Math.round(duration * 100) / 100,
        affectedRows: totalAffected,
        database: getCurrentDatabase(),
        undoData
      })

      return { success: true, data: { affectedRows: totalAffected, undoData } }
    } catch (error) {
      const duration = performance.now() - start
      const errMsg = error instanceof Error ? error.message : String(error)
      addEntry({
        source: 'transaction',
        sql: combinedSql,
        status: 'error',
        error: errMsg,
        duration: Math.round(duration * 100) / 100,
        database: getCurrentDatabase()
      })
      return { success: false, error: errMsg }
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

  // --- History IPC handlers ---

  ipcMain.handle('history:get', async (_event, params: { limit?: number; offset?: number }) => {
    return getEntries(params)
  })

  ipcMain.handle('history:search', async (_event, params: { query: string; limit?: number }) => {
    return searchEntries(params.query, params.limit)
  })

  ipcMain.handle('history:clear', async () => {
    clearEntries()
    return { success: true }
  })

  // --- Connections CRUD IPC handlers ---

  ipcMain.handle('connections:list', async () => {
    return getAllConnections()
  })

  ipcMain.handle('connections:create', async (_event, params) => {
    return addConnection(params)
  })

  ipcMain.handle('connections:update', async (_event, params: { id: string; updates: Record<string, unknown> }) => {
    return updateConnection(params.id, params.updates)
  })

  ipcMain.handle('connections:delete', async (_event, params: { id: string }) => {
    return deleteConnection(params.id)
  })

  ipcMain.handle('connections:duplicate', async (_event, params: { id: string }) => {
    return duplicateConnection(params.id)
  })

  // --- Query files IPC handlers ---

  ipcMain.handle('queries:list-files', async () => {
    return queryFiles.listFiles()
  })

  ipcMain.handle('queries:read-file', async (_event, params: { filePath: string }) => {
    return queryFiles.readFile(params.filePath)
  })

  ipcMain.handle('queries:write-file', async (_event, params: { filePath: string; content: string }) => {
    return queryFiles.writeFile(params.filePath, params.content)
  })

  ipcMain.handle('queries:create-file', async (_event, params?: { name?: string }) => {
    return queryFiles.createFile(params?.name)
  })

  ipcMain.handle('queries:delete-file', async (_event, params: { filePath: string }) => {
    return queryFiles.deleteFile(params.filePath)
  })

  ipcMain.handle('queries:rename-file', async (_event, params: { oldPath: string; newName: string }) => {
    return queryFiles.renameFile(params.oldPath, params.newName)
  })

  ipcMain.handle('queries:get-directory', async () => {
    return { directory: queryFiles.getQueriesDir() }
  })

  ipcMain.handle('queries:set-directory', async (_event, params: { directory: string }) => {
    queryFiles.setQueriesDir(params.directory)
    return { success: true }
  })

  ipcMain.handle('queries:pick-directory', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Queries Directory'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return { directory: result.filePaths[0] }
  })

  ipcMain.handle('queries:reveal-in-finder', async (_event, params: { filePath: string }) => {
    queryFiles.revealInFinder(params.filePath)
  })

  // --- AI Assistant IPC handlers ---

  ipcMain.handle('ai:has-api-key', async () => {
    return { hasKey: ai.hasApiKey() }
  })

  ipcMain.handle('ai:set-api-key', async (_event, params: { key: string }) => {
    ai.setApiKey(params.key)
    return { success: true }
  })

  ipcMain.handle('ai:get-model', async () => {
    return { model: ai.getModel() }
  })

  ipcMain.handle('ai:set-model', async (_event, params: { model: string }) => {
    ai.setModel(params.model)
    return { success: true }
  })

  ipcMain.handle('ai:send-message', (event, params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
    messageId: string
  }) => {
    const messageId = params.messageId
    // Return a promise that resolves when streaming completes.
    // Content chunks are sent via event.sender.send during streaming.
    // The final resolve/reject signals completion to the renderer.
    return new Promise((resolve) => {
      try {
        ai.streamMessage(
          params,
          messageId,
          (content) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('ai:stream-chunk', { messageId, content })
            }
          },
          () => {
            resolve({ success: true, messageId, done: true })
          },
          (error) => {
            resolve({ success: true, messageId, done: true, error })
          }
        )
      } catch (error) {
        resolve({ success: false, error: error instanceof Error ? error.message : String(error) })
      }
    })
  })

  ipcMain.handle('ai:stop-stream', async () => {
    ai.stopStream()
    return { success: true }
  })

  ipcMain.handle('ai:list-conversations', async () => {
    return ai.getConversations()
  })

  ipcMain.handle('ai:save-conversation', async (_event, params: { conversation: import('../shared/types').AiConversation }) => {
    ai.saveConversation(params.conversation)
    return { success: true }
  })

  ipcMain.handle('ai:delete-conversation', async (_event, params: { id: string }) => {
    return ai.deleteConversation(params.id)
  })

  ipcMain.handle('history:execute-undo', async (_event, params: { operations: Array<{ reverseSql: string; reverseParams: unknown[] }> }) => {
    const combinedSql = params.operations.map((o) => inlineParams(o.reverseSql, o.reverseParams)).join(';\n')
    const start = performance.now()
    try {
      const conn = getConnection()
      let totalAffected = 0
      await conn.begin(async (tx) => {
        for (const op of params.operations) {
          const result = await tx.unsafe(op.reverseSql, op.reverseParams)
          totalAffected += result.count ?? 0
        }
      })
      const duration = performance.now() - start
      addEntry({
        source: 'transaction',
        sql: `-- UNDO\n${combinedSql}`,
        status: 'success',
        duration: Math.round(duration * 100) / 100,
        affectedRows: totalAffected,
        database: getCurrentDatabase()
      })
      return { success: true, data: { affectedRows: totalAffected } }
    } catch (error) {
      const duration = performance.now() - start
      const errMsg = error instanceof Error ? error.message : String(error)
      addEntry({
        source: 'transaction',
        sql: `-- UNDO (FAILED)\n${combinedSql}`,
        status: 'error',
        error: errMsg,
        duration: Math.round(duration * 100) / 100,
        database: getCurrentDatabase()
      })
      return { success: false, error: errMsg }
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
  initLogger()
  initHistory()
  initConnections()
  queryFiles.initQueryFiles()
  ai.initAi()
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
  saveHistory()
  saveConnections()
  ai.saveAiSettings()
  if (isConnected()) {
    await disconnectDatabase()
  }
})
