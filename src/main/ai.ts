import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { spawn, type ChildProcess } from 'child_process'
import Anthropic from '@anthropic-ai/sdk'
import type { AiConversation } from '../shared/types'
import { log } from './logger'

type Provider = 'api' | 'claude-cli'

interface AiSettingsFile {
  provider: Provider
  encryptedApiKey?: string
  model: string
  conversations: AiConversation[]
}

let settings: AiSettingsFile = {
  provider: 'claude-cli',
  model: 'sonnet',
  conversations: []
}
let filePath: string | null = null
let currentAbort: AbortController | null = null
let currentCliProcess: ChildProcess | null = null

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
        provider: parsed.provider || 'claude-cli',
        encryptedApiKey: parsed.encryptedApiKey,
        model: parsed.model || 'sonnet',
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

export function getProvider(): Provider {
  return settings.provider
}

export function setProvider(provider: Provider): void {
  settings.provider = provider
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
  if (currentCliProcess) {
    currentCliProcess.kill('SIGTERM')
    currentCliProcess = null
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

async function streamViaApi(
  params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
  },
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  const apiKey = getApiKey()
  if (!apiKey) {
    onError('API key not configured. Please set your Anthropic API key in the AI Assistant settings.')
    return
  }

  const client = new Anthropic({ apiKey })
  currentAbort = new AbortController()

  try {
    const systemPrompt = SYSTEM_PROMPT.replace('{SCHEMA_CONTEXT}', params.schemaContext || 'No schema context available.')

    const stream = await client.messages.stream({
      model: params.model || settings.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
    }, { signal: currentAbort.signal })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onChunk(event.delta.text)
      }
    }

    onDone()
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      onDone()
    } else {
      onError(err instanceof Error ? err.message : String(err))
    }
  } finally {
    currentAbort = null
  }
}

// --- Claude CLI provider ---

function streamViaCli(
  params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
  },
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): void {
  const systemPrompt = SYSTEM_PROMPT.replace('{SCHEMA_CONTEXT}', params.schemaContext || 'No schema context available.')

  // Build the full prompt: system context + conversation history
  const parts: string[] = [systemPrompt, '']
  for (const msg of params.messages) {
    if (msg.role === 'user') {
      parts.push(`User: ${msg.content}`)
    } else {
      parts.push(`Assistant: ${msg.content}`)
    }
  }
  const fullPrompt = parts.join('\n\n')

  const model = params.model || settings.model
  const args = [
    '-p', '-',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--model', model,
    '--no-session-persistence',
    '--permission-mode', 'plan',
    '--max-turns', '1'
  ]

  // Remove CLAUDECODE env var so the CLI doesn't think it's nested
  const env = { ...process.env }
  delete env.CLAUDECODE

  log('[AI CLI] spawning claude with model:', model)
  log('[AI CLI] prompt length:', fullPrompt.length, 'chars')

  try {
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env
    })

    // Write prompt to stdin and close it
    proc.stdin.write(fullPrompt)
    proc.stdin.end()

    currentCliProcess = proc

    let buffer = ''
    let sentChunks = false
    // Track the last seen text length to compute deltas from partial messages
    let lastTextLength = 0

    proc.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString()
      log('[AI CLI stdout]', chunk.slice(0, 500))
      buffer += chunk

      // Parse newline-delimited JSON
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const event = JSON.parse(line)
          handleCliEvent(event)
        } catch {
          log('[AI CLI] non-JSON line:', line.slice(0, 200))
        }
      }
    })

    function handleCliEvent(event: any): void {
      log('[AI CLI event]', event.type, JSON.stringify(event).slice(0, 300))

      if (event.type === 'assistant' && event.message?.content) {
        // Extract accumulated text from content blocks
        const content = event.message.content
        let fullText = ''
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            fullText += block.text
          }
        }
        // Send only the new delta since last update
        if (fullText.length > lastTextLength) {
          const delta = fullText.slice(lastTextLength)
          onChunk(delta)
          lastTextLength = fullText.length
          sentChunks = true
        }
      } else if (event.type === 'result' && event.result) {
        // Final result — if we haven't sent any chunks, send the whole thing
        if (!sentChunks) {
          onChunk(event.result)
          sentChunks = true
        }
      } else if (event.type === 'content_block_delta' && event.delta?.text) {
        onChunk(event.delta.text)
        sentChunks = true
      }
    }

    let stderrBuf = ''
    proc.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString()
      log('[AI CLI stderr]', chunk.slice(0, 500))
      stderrBuf += chunk
    })

    proc.on('close', (code) => {
      log('[AI CLI] process closed with code:', code, 'sentChunks:', sentChunks, 'buffer:', buffer.slice(0, 300))
      currentCliProcess = null

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer)
          handleCliEvent(event)
        } catch {
          // Plain text fallback
          if (!sentChunks && buffer.trim()) {
            onChunk(buffer.trim())
          }
        }
      }

      if (code !== 0 && code !== null) {
        const errMsg = stderrBuf.trim() || `Claude CLI exited with code ${code}`
        if (errMsg.includes('ENOENT')) {
          onError('Claude CLI not found. Make sure Claude Code is installed and `claude` is in your PATH.')
        } else if (errMsg.includes('not logged in') || errMsg.includes('auth')) {
          onError('Not authenticated. Run `claude` in your terminal to log in first.')
        } else {
          onError(errMsg)
        }
      } else {
        onDone()
      }
    })

    proc.on('error', (err) => {
      currentCliProcess = null
      if (err.message.includes('ENOENT')) {
        onError('Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code')
      } else {
        onError(err.message)
      }
    })
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err))
  }
}

// --- Public streaming function (routes to provider) ---

export async function streamMessage(
  params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    schemaContext: string
    model: string
  },
  _messageId: string,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  if (settings.provider === 'claude-cli') {
    streamViaCli(params, onChunk, onDone, onError)
  } else {
    await streamViaApi(params, onChunk, onDone, onError)
  }
}
