import postgres, { Sql } from 'postgres'

export interface ConnectionParams {
  host: string
  port: number
  database: string
  username: string
  password: string
}

let sql: Sql | null = null
let currentDatabase: string = ''

export function getConnection(): Sql {
  if (!sql) {
    throw new Error('Not connected to a database')
  }
  return sql
}

export function isConnected(): boolean {
  return sql !== null
}

export function getCurrentDatabase(): string {
  return currentDatabase
}

export async function connectToDatabase(params: ConnectionParams): Promise<Sql> {
  if (sql) {
    await sql.end()
    sql = null
  }

  currentDatabase = params.database
  sql = postgres({
    host: params.host,
    port: params.port,
    database: params.database,
    username: params.username,
    password: params.password,
    max: 10,
    idle_timeout: 0,
    connect_timeout: 10
  })

  return sql
}

export async function disconnectDatabase(): Promise<void> {
  if (sql) {
    await sql.end()
    sql = null
  }
}
