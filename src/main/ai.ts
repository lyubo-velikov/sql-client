import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import type { AiConversation } from '../shared/types'

interface AiSettingsFile {
  encryptedApiKey?: string
  model: string
  conversations: AiConversation[]
}

let settings: AiSettingsFile = {
  model: 'claude-sonnet-4-6',
  conversations: []
}
let filePath: string | null = null
let currentAbort: AbortController | null = null

function getFilePath(): string {
  if (!filePath) {
    filePath = join(app.getPath('userData'), 'ai-settings.json')
  }
  return filePath
}

function loadSettings(): void {
  try {
    const path = getFilePath()
    if (existsSync(path)) {
      const data = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(data)
      settings = {
        encryptedApiKey: parsed.encryptedApiKey,
        model: parsed.model || 'claude-sonnet-4-6',
        conversations: Array.isArray(parsed.conversations) ? parsed.conversations : []
      }
    }
  } catch {
    // Keep defaults
  }
}

function persistSettings(): void {
  try {
    writeFileSync(getFilePath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (e) {
    console.error('Failed to save AI settings:', e)
  }
}

export function initAi(): void {
  loadSettings()
}

export function saveAiSettings(): void {
  persistSettings()
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
  persistSettings()
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
  persistSettings()
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
  if (settings.conversations.length > 50) {
    settings.conversations = settings.conversations.slice(0, 50)
  }
  persistSettings()
}

export function deleteConversation(id: string): boolean {
  const idx = settings.conversations.findIndex((c) => c.id === id)
  if (idx === -1) return false
  settings.conversations.splice(idx, 1)
  persistSettings()
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
      max_tokens: 4096,
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
        fail(err instanceof Error ? err.message : String(err))
      }
    })

    stream.on('abort', () => {
      finish()
    })
  } catch (err: unknown) {
    fail(err instanceof Error ? err.message : String(err))
  }
}

// --- Public streaming function ---

export function streamMessage(
  params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
  },
  _messageId: string,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): void {
  streamViaApi(params, onChunk, onDone, onError)
}
