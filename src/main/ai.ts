import { safeStorage } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import type { AiConversation } from '../shared/types'
import { formatError } from '../shared/utils'
import { DEFAULT_AI_MODEL, AI_MAX_TOKENS, MAX_AI_CONVERSATIONS } from '../shared/constants'
import { createJsonStore } from './persistence'

interface AiSettingsFile {
  encryptedApiKey?: string
  model: string
  conversations: AiConversation[]
}

let settings: AiSettingsFile = {
  model: DEFAULT_AI_MODEL,
  conversations: []
}
let currentAbort: AbortController | null = null

const store = createJsonStore<AiSettingsFile>('ai-settings.json', { model: DEFAULT_AI_MODEL, conversations: [] })

export function initAi(): void {
  const parsed = store.load()
  settings = {
    encryptedApiKey: parsed.encryptedApiKey,
    model: parsed.model || DEFAULT_AI_MODEL,
    conversations: Array.isArray(parsed.conversations) ? parsed.conversations : []
  }
}

export function saveAiSettings(): void {
  store.save(settings)
}

export function hasApiKey(): boolean {
  return !!settings.encryptedApiKey
}

export function setApiKey(key: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    settings.encryptedApiKey = encrypted.toString('base64')
  } else {
    settings.encryptedApiKey = Buffer.from(key).toString('base64')
  }
  store.save(settings)
}

function getApiKey(): string | null {
  if (!settings.encryptedApiKey) return null
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(settings.encryptedApiKey, 'base64')
      return safeStorage.decryptString(buffer)
    } else {
      return Buffer.from(settings.encryptedApiKey, 'base64').toString('utf-8')
    }
  } catch {
    return null
  }
}

export function getModel(): string {
  return settings.model
}

export function setModel(model: string): void {
  settings.model = model
  store.save(settings)
}

export function getConversations(): AiConversation[] {
  return settings.conversations
}

export function saveConversation(conversation: AiConversation): void {
  const idx = settings.conversations.findIndex((c) => c.id === conversation.id)
  if (idx >= 0) {
    settings.conversations[idx] = conversation
  } else {
    settings.conversations.unshift(conversation)
  }
  if (settings.conversations.length > MAX_AI_CONVERSATIONS) {
    settings.conversations = settings.conversations.slice(0, MAX_AI_CONVERSATIONS)
  }
  store.save(settings)
}

export function deleteConversation(id: string): boolean {
  const idx = settings.conversations.findIndex((c) => c.id === id)
  if (idx === -1) return false
  settings.conversations.splice(idx, 1)
  store.save(settings)
  return true
}

export function stopStream(): void {
  if (currentAbort) {
    currentAbort.abort()
    currentAbort = null
  }
}

const SYSTEM_PROMPT = `You are an expert PostgreSQL assistant embedded in a SQL client application. You help users write, understand, debug, and optimize SQL queries.

Guidelines:
- When providing SQL, always use fenced code blocks with \`\`\`sql
- Be concise and direct in your explanations
- When fixing errors, explain what was wrong briefly
- When explaining queries, break down each clause
- Consider performance implications and suggest indexes when relevant
- Use PostgreSQL-specific syntax and features when appropriate
- If asked about data, remind the user you can only see the schema structure, not actual data rows

Current database schema:
{SCHEMA_CONTEXT}`

// --- Anthropic API provider ---

function streamViaApi(
  params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
  },
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): void {
  const apiKey = getApiKey()
  if (!apiKey) {
    onError('API key not configured. Please set your Anthropic API key in the AI Assistant settings.')
    return
  }

  const client = new Anthropic({ apiKey })
  currentAbort = new AbortController()

  const systemPrompt = SYSTEM_PROMPT.replace('{SCHEMA_CONTEXT}', params.schemaContext || 'No schema context available.')

  let finished = false
  function finish() {
    if (finished) return
    finished = true
    currentAbort = null
    onDone()
  }
  function fail(err: string) {
    if (finished) return
    finished = true
    currentAbort = null
    onError(err)
  }

  try {
    const stream = client.messages.stream({
      model: params.model || settings.model,
      max_tokens: AI_MAX_TOKENS,
      system: systemPrompt,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
    }, { signal: currentAbort.signal })

    stream.on('text', (text) => {
      onChunk(text)
    })

    stream.on('end', () => {
      finish()
    })

    stream.on('error', (err) => {
      if (err instanceof Error && err.name === 'AbortError') {
        finish()
      } else {
        fail(formatError(err))
      }
    })

    stream.on('abort', () => {
      finish()
    })
  } catch (err: unknown) {
    fail(formatError(err))
  }
}

// --- Public streaming function ---

export function streamMessage(
  params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
  },
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): void {
  streamViaApi(params, onChunk, onDone, onError)
}
