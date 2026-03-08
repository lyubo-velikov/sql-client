<script lang="ts">
  import { Marked } from 'marked'

  let { message, onRunQuery, isStreaming = false }: {
    message: { role: 'user' | 'assistant'; content: string; timestamp: number }
    onRunQuery?: (sql: string) => void
    isStreaming?: boolean
  } = $props()

  let copiedIndex = $state<number | null>(null)

  interface ContentBlock {
    type: 'text' | 'code'
    content: string
    language?: string
  }

  function parseContent(text: string): ContentBlock[] {
    const blocks: ContentBlock[] = []
    const regex = /```(\w*)\n?([\s\S]*?)```/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textContent = text.slice(lastIndex, match.index).trim()
        if (textContent) blocks.push({ type: 'text', content: textContent })
      }
      blocks.push({
        type: 'code',
        content: match[2].trim(),
        language: match[1] || undefined
      })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex).trim()
      if (remaining) blocks.push({ type: 'text', content: remaining })
    }

    if (blocks.length === 0 && text.trim()) {
      blocks.push({ type: 'text', content: text.trim() })
    }

    return blocks
  }

  function highlightSql(code: string): string {
    // Tokenize first to avoid regex replacements corrupting each other's HTML
    const tokens: Array<{ start: number; end: number; cls: string }> = []

    const patterns: Array<{ re: RegExp; cls: string }> = [
      { re: /(--[^\n]*)/g, cls: 'text-text-muted italic' },
      { re: /('(?:[^'\\]|\\.)*')/g, cls: 'text-amber-400' },
      { re: /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|ON|AS|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|FUNCTION|TRIGGER|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|DEFAULT|NULL|IS|LIKE|ILIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|RETURNING|WITH|RECURSIVE|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|ASC|DESC|NULLS|FIRST|LAST|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|EXPLAIN|ANALYZE|VACUUM|TRUNCATE|CASCADE|RESTRICT|IF|REPLACE|TEMP|TEMPORARY|SCHEMA|SEQUENCE|TYPE|ENUM|BOOLEAN|INTEGER|BIGINT|SMALLINT|TEXT|VARCHAR|CHAR|NUMERIC|DECIMAL|REAL|DOUBLE|PRECISION|DATE|TIME|TIMESTAMP|TIMESTAMPTZ|INTERVAL|JSON|JSONB|UUID|SERIAL|BIGSERIAL|ARRAY)\b/gi, cls: 'text-blue-400 font-semibold' },
      { re: /\b(\d+(?:\.\d+)?)\b/g, cls: 'text-purple-400' }
    ]

    // Collect all token positions (earlier patterns take priority)
    for (const { re, cls } of patterns) {
      let m: RegExpExecArray | null
      while ((m = re.exec(code)) !== null) {
        const start = m.index
        const end = start + m[0].length
        // Skip if overlapping with an existing higher-priority token
        if (!tokens.some((t) => start < t.end && end > t.start)) {
          tokens.push({ start, end, cls })
        }
      }
    }

    tokens.sort((a, b) => a.start - b.start)

    // Build result
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let result = ''
    let pos = 0
    for (const t of tokens) {
      if (t.start > pos) result += esc(code.slice(pos, t.start))
      result += `<span class="${t.cls}">${esc(code.slice(t.start, t.end))}</span>`
      pos = t.end
    }
    if (pos < code.length) result += esc(code.slice(pos))

    return result
  }

  // Configure marked to skip code blocks (we handle them ourselves)
  const marked = new Marked({
    renderer: {
      // Prevent marked from processing fenced code blocks in text sections
      code({ text, lang }) {
        // Shouldn't happen since we split code blocks out, but just in case
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<pre><code class="language-${lang || ''}">${escaped}</code></pre>`
      }
    },
    gfm: true,
    breaks: true
  })

  function renderMarkdown(text: string): string {
    return marked.parse(text) as string
  }

  async function copyCode(code: string, idx: number) {
    try {
      await navigator.clipboard.writeText(code)
      copiedIndex = idx
      setTimeout(() => { copiedIndex = null }, 1500)
    } catch { /* ignore */ }
  }

  let blocks = $derived(parseContent(message.content))
</script>

<div class="flex gap-2 {message.role === 'user' ? 'flex-row-reverse' : ''}">
  <div class="max-w-full min-w-0 {message.role === 'user'
    ? 'bg-accent/15 rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%]'
    : 'flex-1'}">

    {#each blocks as block, i}
      {#if block.type === 'code'}
        <div class="my-2 rounded-lg overflow-hidden bg-surface-tertiary border border-border-primary">
          <!-- Code header -->
          <div class="flex items-center justify-between px-3 py-1 bg-surface-secondary/50 border-b border-border-primary">
            <span class="text-[10px] text-text-muted uppercase tracking-wider">
              {block.language || 'code'}
            </span>
            <div class="flex items-center gap-1">
              {#if block.language?.toLowerCase() === 'sql' && onRunQuery}
                <button
                  class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-accent hover:bg-accent/10 transition-colors"
                  onclick={() => onRunQuery?.(block.content)}
                >
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  </svg>
                  Run
                </button>
              {/if}
              <button
                class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                onclick={() => copyCode(block.content, i)}
              >
                {#if copiedIndex === i}
                  <svg class="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                {:else}
                  <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                {/if}
              </button>
            </div>
          </div>
          <!-- Code content -->
          <pre class="px-3 py-2 text-[12px] font-mono leading-relaxed overflow-x-auto"><code>{#if block.language?.toLowerCase() === 'sql'}{@html highlightSql(block.content)}{:else}{block.content}{/if}</code></pre>
        </div>
      {:else}
        <div class="ai-markdown text-[13px] leading-relaxed {message.role === 'user' ? 'text-text-primary' : 'text-text-secondary'}">
          {@html renderMarkdown(block.content)}
        </div>
      {/if}
    {/each}

    {#if isStreaming}
      <span class="inline-block w-2 h-4 bg-accent/60 animate-pulse rounded-sm ml-0.5"></span>
    {/if}
  </div>
</div>

<style>
  .ai-markdown :global(h1) {
    font-size: 1.25em;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0.75em 0 0.4em;
  }
  .ai-markdown :global(h2) {
    font-size: 1.1em;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0.6em 0 0.3em;
  }
  .ai-markdown :global(h3) {
    font-size: 1em;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0.5em 0 0.25em;
  }
  .ai-markdown :global(p) {
    margin: 0.4em 0;
  }
  .ai-markdown :global(p:first-child) {
    margin-top: 0;
  }
  .ai-markdown :global(p:last-child) {
    margin-bottom: 0;
  }
  .ai-markdown :global(ul),
  .ai-markdown :global(ol) {
    margin: 0.4em 0;
    padding-left: 1.5em;
  }
  .ai-markdown :global(li) {
    margin: 0.15em 0;
  }
  .ai-markdown :global(ul) {
    list-style-type: disc;
  }
  .ai-markdown :global(ol) {
    list-style-type: decimal;
  }
  .ai-markdown :global(strong) {
    font-weight: 600;
    color: var(--text-primary);
  }
  .ai-markdown :global(em) {
    font-style: italic;
  }
  .ai-markdown :global(code) {
    padding: 0.15em 0.35em;
    background: var(--surface-tertiary);
    border-radius: 4px;
    font-size: 0.9em;
    font-family: ui-monospace, monospace;
    color: var(--accent);
  }
  .ai-markdown :global(hr) {
    border: none;
    border-top: 1px solid var(--border-primary);
    margin: 0.75em 0;
  }
  .ai-markdown :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5em 0;
    font-size: 0.9em;
  }
  .ai-markdown :global(th) {
    text-align: left;
    font-weight: 600;
    color: var(--text-primary);
    padding: 0.35em 0.6em;
    border-bottom: 2px solid var(--border-primary);
    background: var(--surface-tertiary);
  }
  .ai-markdown :global(td) {
    padding: 0.3em 0.6em;
    border-bottom: 1px solid var(--border-primary);
  }
  .ai-markdown :global(blockquote) {
    border-left: 3px solid var(--accent);
    padding-left: 0.75em;
    margin: 0.5em 0;
    color: var(--text-muted);
  }
  .ai-markdown :global(a) {
    color: var(--accent);
    text-decoration: underline;
  }
</style>
