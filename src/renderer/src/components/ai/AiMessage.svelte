<script lang="ts">
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
      // Text before code block
      if (match.index > lastIndex) {
        const textContent = text.slice(lastIndex, match.index).trim()
        if (textContent) blocks.push({ type: 'text', content: textContent })
      }
      // Code block
      blocks.push({
        type: 'code',
        content: match[2].trim(),
        language: match[1] || undefined
      })
      lastIndex = match.index + match[0].length
    }

    // Remaining text
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
    const keywords = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|ON|AS|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|ALTER|DROP|TABLE|INDEX|VIEW|FUNCTION|TRIGGER|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|DEFAULT|NULL|IS|LIKE|ILIKE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|RETURNING|WITH|RECURSIVE|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|ASC|DESC|NULLS|FIRST|LAST|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|EXPLAIN|ANALYZE|VACUUM|TRUNCATE|CASCADE|RESTRICT|IF|REPLACE|TEMP|TEMPORARY|SCHEMA|SEQUENCE|TYPE|ENUM|BOOLEAN|INTEGER|BIGINT|SMALLINT|TEXT|VARCHAR|CHAR|NUMERIC|DECIMAL|REAL|DOUBLE|PRECISION|DATE|TIME|TIMESTAMP|TIMESTAMPTZ|INTERVAL|JSON|JSONB|UUID|SERIAL|BIGSERIAL|ARRAY)\b/gi
    const strings = /('(?:[^'\\]|\\.)*')/g
    const numbers = /\b(\d+(?:\.\d+)?)\b/g
    const comments = /(--[^\n]*)/g
    const functions = /\b([a-z_]\w*)\s*(?=\()/gi

    let result = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    result = result.replace(comments, '<span class="text-text-muted italic">$1</span>')
    result = result.replace(strings, '<span class="text-amber-400">$1</span>')
    result = result.replace(keywords, '<span class="text-blue-400 font-semibold">$1</span>')
    result = result.replace(numbers, '<span class="text-purple-400">$1</span>')

    return result
  }

  function formatText(text: string): string {
    let result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Bold
    result = result.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
    // Inline code
    result = result.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-surface-tertiary rounded text-[11px] font-mono text-accent">$1</code>')
    // Line breaks
    result = result.replace(/\n/g, '<br/>')

    return result
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
        <div class="text-[13px] leading-relaxed {message.role === 'user' ? 'text-text-primary' : 'text-text-secondary'}">
          {@html formatText(block.content)}
        </div>
      {/if}
    {/each}

    {#if isStreaming}
      <span class="inline-block w-2 h-4 bg-accent/60 animate-pulse rounded-sm ml-0.5"></span>
    {/if}
  </div>
</div>
