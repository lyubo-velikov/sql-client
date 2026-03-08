import type { AiMessage, AiConversation } from '../../../shared/types'
import { connectionStore } from './connection.svelte'

let messages = $state<AiMessage[]>([])
let conversations = $state<AiConversation[]>([])
let activeConversationId = $state<string | null>(null)
let streaming = $state(false)
let streamingContent = $state('')
let streamingMessageId = $state<string | null>(null)
let hasApiKey = $state(false)
let model = $state('sonnet')
let provider = $state<'api' | 'claude-cli'>('claude-cli')
let loaded = $state(false)
let unsubscribeStream: (() => void) | null = null

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildSchemaContext(): string {
  const tables = connectionStore.tables
  if (tables.length === 0) return 'No tables available. Not connected to a database.'

  const lines: string[] = []
  for (const t of tables) {
    lines.push(`-- ${t.schemaname}.${t.tablename} (~${t.row_count} rows)`)
  }

  // Also include foreign key relationships
  const fks = connectionStore.foreignKeys
  if (fks.length > 0) {
    lines.push('')
    lines.push('-- Foreign key relationships:')
    for (const fk of fks) {
      lines.push(`-- ${fk.table_schema}.${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_schema}.${fk.foreign_table_name}.${fk.foreign_column_name}`)
    }
  }

  return lines.join('\n')
}

// Fetch detailed schema for context (columns, types, PKs)
let schemaCache = $state<string>('')
let schemaCacheKey = $state('')

async function getDetailedSchemaContext(): Promise<string> {
  const tables = connectionStore.tables
  if (tables.length === 0) return 'No tables available. Not connected to a database.'

  const cacheKey = tables.map((t) => `${t.schemaname}.${t.tablename}`).join(',')
  if (cacheKey === schemaCacheKey && schemaCache) return schemaCache

  const lines: string[] = []

  // Limit to 30 tables for context size
  const subset = tables.slice(0, 30)
  for (const t of subset) {
    try {
      const result = await window.api.getTableSchema(t.schemaname, t.tablename)
      if (result.success && result.data) {
        lines.push(`-- Table: ${t.schemaname}.${t.tablename} (~${t.row_count} rows)`)
        for (const col of result.data) {
          const pk = col.is_primary_key ? ' [PK]' : ''
          const nullable = col.is_nullable === 'YES' ? ' NULL' : ' NOT NULL'
          lines.push(`--   ${col.column_name}: ${col.data_type}${nullable}${pk}`)
        }
        lines.push('')
      }
    } catch {
      lines.push(`-- Table: ${t.schemaname}.${t.tablename} (~${t.row_count} rows)`)
      lines.push('')
    }
  }

  if (tables.length > 30) {
    lines.push(`-- ... and ${tables.length - 30} more tables`)
  }

  const fks = connectionStore.foreignKeys
  if (fks.length > 0) {
    lines.push('-- Foreign key relationships:')
    for (const fk of fks) {
      lines.push(`-- ${fk.table_schema}.${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_schema}.${fk.foreign_table_name}.${fk.foreign_column_name}`)
    }
  }

  schemaCache = lines.join('\n')
  schemaCacheKey = cacheKey
  return schemaCache
}

async function load(): Promise<void> {
  if (loaded) return

  try {
    const [keyResult, modelResult, providerResult, convos] = await Promise.all([
      window.api.hasAiApiKey(),
      window.api.getAiModel(),
      window.api.getAiProvider(),
      window.api.listAiConversations()
    ])

    hasApiKey = keyResult.hasKey
    model = modelResult.model
    provider = providerResult.provider
    conversations = Array.isArray(convos) ? convos : []
  } catch {
    // Keep defaults
  }

  // Set up stream listener
  unsubscribeStream = window.api.onAiStreamChunk((data) => {
    if (data.messageId === streamingMessageId) {
      if (data.error) {
        streamingContent = ''
        streaming = false
        streamingMessageId = null
        // Add error as assistant message
        messages = [...messages, {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${data.error}`,
          timestamp: Date.now()
        }]
      } else if (data.done) {
        // Finalize the assistant message
        if (streamingContent) {
          const finalMessage: AiMessage = {
            id: generateId(),
            role: 'assistant',
            content: streamingContent,
            timestamp: Date.now(),
            model
          }
          messages = [...messages, finalMessage]
          persistConversation()
        }
        streaming = false
        streamingContent = ''
        streamingMessageId = null
      } else {
        streamingContent += data.content
      }
    }
  })

  loaded = true
}

function newConversation(): void {
  const id = generateId()
  activeConversationId = id
  messages = []
  streamingContent = ''
  streaming = false
}

function selectConversation(id: string): void {
  const convo = conversations.find((c) => c.id === id)
  if (convo) {
    activeConversationId = convo.id
    messages = [...convo.messages]
  }
}

async function sendMessage(text: string): Promise<void> {
  if (!text.trim() || streaming) return

  // Start a new conversation if needed
  if (!activeConversationId) {
    newConversation()
  }

  const userMessage: AiMessage = {
    id: generateId(),
    role: 'user',
    content: text.trim(),
    timestamp: Date.now()
  }

  messages = [...messages, userMessage]
  streaming = true
  streamingContent = ''

  const schemaContext = await getDetailedSchemaContext()

  // Build message history for context
  const history = messages.map((m) => ({ role: m.role, content: m.content }))

  try {
    const result = await window.api.sendAiMessage({
      messages: history,
      schemaContext,
      model
    })

    if (result.success && result.messageId) {
      streamingMessageId = result.messageId
    } else {
      streaming = false
      messages = [...messages, {
        id: generateId(),
        role: 'assistant',
        content: `Error: ${result.error || 'Failed to send message'}`,
        timestamp: Date.now()
      }]
    }
  } catch (err) {
    streaming = false
    messages = [...messages, {
      id: generateId(),
      role: 'assistant',
      content: `Error: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: Date.now()
    }]
  }
}

async function stopStream(): Promise<void> {
  try {
    await window.api.stopAiStream()
  } catch { /* ignore */ }

  if (streamingContent) {
    messages = [...messages, {
      id: generateId(),
      role: 'assistant',
      content: streamingContent,
      timestamp: Date.now(),
      model
    }]
  }

  streaming = false
  streamingContent = ''
  streamingMessageId = null
  persistConversation()
}

async function setApiKeyValue(key: string): Promise<void> {
  await window.api.setAiApiKey(key)
  hasApiKey = true
}

async function setModelValue(m: string): Promise<void> {
  model = m
  await window.api.setAiModel(m)
}

async function setProviderValue(p: 'api' | 'claude-cli'): Promise<void> {
  provider = p
  await window.api.setAiProvider(p)
}

function isReady(): boolean {
  return provider === 'claude-cli' || hasApiKey
}

function persistConversation(): void {
  if (!activeConversationId || messages.length === 0) return

  const title = messages[0]?.content.slice(0, 50) || 'New conversation'
  const convo: AiConversation = {
    id: activeConversationId,
    title,
    messages: [...messages],
    createdAt: conversations.find((c) => c.id === activeConversationId)?.createdAt || Date.now(),
    updatedAt: Date.now()
  }

  const idx = conversations.findIndex((c) => c.id === activeConversationId)
  if (idx >= 0) {
    conversations[idx] = convo
  } else {
    conversations.unshift(convo)
  }
  conversations = [...conversations]

  window.api.saveAiConversation(convo).catch(() => {})
}

async function deleteConversationById(id: string): Promise<void> {
  conversations = conversations.filter((c) => c.id !== id)
  if (activeConversationId === id) {
    activeConversationId = null
    messages = []
  }
  await window.api.deleteAiConversation(id).catch(() => {})
}

function clearMessages(): void {
  messages = []
  streamingContent = ''
  activeConversationId = null
}

function cleanup(): void {
  if (unsubscribeStream) {
    unsubscribeStream()
    unsubscribeStream = null
  }
}

export const assistantStore = {
  get messages() { return messages },
  get conversations() { return conversations },
  get activeConversationId() { return activeConversationId },
  get streaming() { return streaming },
  get streamingContent() { return streamingContent },
  get hasApiKey() { return hasApiKey },
  get model() { return model },
  get provider() { return provider },
  get loaded() { return loaded },
  get isReady() { return isReady() },
  load,
  newConversation,
  selectConversation,
  sendMessage,
  stopStream,
  setApiKey: setApiKeyValue,
  setModel: setModelValue,
  setProvider: setProviderValue,
  deleteConversation: deleteConversationById,
  clearMessages,
  cleanup
}
