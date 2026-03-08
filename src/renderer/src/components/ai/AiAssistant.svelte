<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { assistantStore } from '../../stores/assistant.svelte'
  import { connectionStore } from '../../stores/connection.svelte'
  import { tabStore } from '../../stores/tabs.svelte'
  import AiMessage from './AiMessage.svelte'

  let { open = $bindable(false) } = $props<{ open?: boolean }>()

  let inputText = $state('')
  let inputEl: HTMLTextAreaElement | undefined = $state()
  let messagesEl: HTMLDivElement | undefined = $state()
  let showSettings = $state(false)
  let apiKeyInput = $state('')
  let showConversations = $state(false)
  let width = $state(400)
  let isDragging = $state(false)

  const MODELS = [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
  ]

  onMount(async () => {
    await assistantStore.load()
  })

  // Auto-scroll to bottom when messages change
  $effect(() => {
    const _msgs = assistantStore.messages
    const _streaming = assistantStore.streamingContent
    tick().then(() => {
      if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight
      }
    })
  })

  async function handleSend() {
    const text = inputText.trim()
    if (!text || assistantStore.streaming) return
    inputText = ''
    await assistantStore.sendMessage(text)
    // Reset textarea height
    if (inputEl) inputEl.style.height = 'auto'
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInput() {
    if (inputEl) {
      inputEl.style.height = 'auto'
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px'
    }
  }

  async function handleSetApiKey() {
    if (!apiKeyInput.trim()) return
    await assistantStore.setApiKey(apiKeyInput.trim())
    apiKeyInput = ''
    showSettings = false
  }

  function handleRunQuery(sql: string) {
    tabStore.addTab({
      type: 'query',
      title: 'AI Query',
      query: sql
    })
  }

  function handleNewChat() {
    assistantStore.newConversation()
    showConversations = false
  }

  function handleDragStart(e: MouseEvent) {
    e.preventDefault()
    isDragging = true
    const startX = e.clientX
    const startWidth = width

    function onMove(e: MouseEvent) {
      const delta = startX - e.clientX
      width = Math.max(300, Math.min(startWidth + delta, 700))
    }
    function onUp() {
      isDragging = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  let tableCount = $derived(connectionStore.tables.length)
</script>

{#if open}
  <div
    class="flex flex-col border-l border-border-primary bg-surface-primary shrink-0 relative"
    style="width: {width}px;"
    class:select-none={isDragging}
  >
    <!-- Drag handle (left edge) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/20 transition-colors z-10
        {isDragging ? 'bg-accent/30' : ''}"
      onmousedown={handleDragStart}
    ></div>

    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2 bg-surface-secondary border-b border-border-primary flex-shrink-0 app-drag-region">
      <svg class="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
      <span class="text-xs font-semibold text-text-primary flex-1">AI Assistant</span>

      <!-- Conversations button -->
      <button
        class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors no-drag"
        onclick={() => { showConversations = !showConversations }}
        title="Conversations"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </button>

      <!-- New chat button -->
      <button
        class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors no-drag"
        onclick={handleNewChat}
        title="New conversation"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      <!-- Settings button -->
      <button
        class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors no-drag"
        onclick={() => { showSettings = !showSettings }}
        title="AI Settings"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <!-- Close button -->
      <button
        class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors no-drag"
        onclick={() => { open = false }}
        title="Close AI Assistant"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Settings panel -->
    {#if showSettings}
      <div class="px-3 py-3 bg-surface-secondary/50 border-b border-border-primary space-y-3 flex-shrink-0">
        <!-- Provider toggle -->
        <div>
          <label class="block text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Provider</label>
          <div class="flex rounded-lg overflow-hidden border border-border-primary">
            <button
              class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors
                {assistantStore.provider === 'claude-cli'
                  ? 'bg-accent text-white'
                  : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'}"
              onclick={() => assistantStore.setProvider('claude-cli')}
            >
              Claude Code
            </button>
            <button
              class="flex-1 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border-primary
                {assistantStore.provider === 'api'
                  ? 'bg-accent text-white'
                  : 'bg-surface-tertiary text-text-secondary hover:text-text-primary'}"
              onclick={() => assistantStore.setProvider('api')}
            >
              API Key
            </button>
          </div>
          {#if assistantStore.provider === 'claude-cli'}
            <p class="text-[10px] text-text-muted mt-1.5">Uses your Claude Code login (Max subscription). Requires <code class="text-accent">claude</code> CLI in PATH.</p>
          {/if}
        </div>

        <!-- Model selector -->
        <div>
          <label class="block text-[10px] text-text-muted uppercase tracking-wider mb-1">Model</label>
          <select
            class="w-full px-2 py-1.5 bg-surface-tertiary border border-border-primary rounded text-xs text-text-primary outline-none focus:border-accent/50"
            value={assistantStore.model}
            onchange={(e) => assistantStore.setModel(e.currentTarget.value)}
          >
            {#each MODELS as m}
              <option value={m.id}>{m.label}</option>
            {/each}
          </select>
        </div>

        <!-- API Key (only for API provider) -->
        {#if assistantStore.provider === 'api'}
          <div>
            <label class="block text-[10px] text-text-muted uppercase tracking-wider mb-1">
              Anthropic API Key
              {#if assistantStore.hasApiKey}
                <span class="text-accent ml-1">configured</span>
              {/if}
            </label>
            <div class="flex gap-1.5">
              <input
                type="password"
                class="flex-1 px-2 py-1.5 bg-surface-tertiary border border-border-primary rounded text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                placeholder={assistantStore.hasApiKey ? 'Update API key...' : 'sk-ant-...'}
                bind:value={apiKeyInput}
                onkeydown={(e) => { if (e.key === 'Enter') handleSetApiKey() }}
              />
              <button
                class="px-3 py-1.5 bg-accent text-white rounded text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                onclick={handleSetApiKey}
                disabled={!apiKeyInput.trim()}
              >
                Save
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Conversations list -->
    {#if showConversations}
      <div class="border-b border-border-primary bg-surface-secondary/30 max-h-48 overflow-y-auto flex-shrink-0">
        {#if assistantStore.conversations.length === 0}
          <div class="px-3 py-4 text-xs text-text-muted text-center">No conversations yet</div>
        {:else}
          {#each assistantStore.conversations as convo (convo.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
            <div
              class="group flex items-center gap-2 w-full px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors
                {convo.id === assistantStore.activeConversationId ? 'bg-surface-tertiary' : ''}"
              onclick={() => { assistantStore.selectConversation(convo.id); showConversations = false }}
            >
              <span class="text-xs text-text-primary truncate flex-1">{convo.title}</span>
              <span class="text-[10px] text-text-muted shrink-0">{convo.messages.length} msgs</span>
              <button
                class="shrink-0 p-0.5 rounded text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-colors"
                onclick={(e) => { e.stopPropagation(); assistantStore.deleteConversation(convo.id) }}
                title="Delete conversation"
              >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <!-- Messages area -->
    <div class="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-4" bind:this={messagesEl}>
      {#if !assistantStore.isReady && !showSettings}
        <!-- Setup prompt -->
        <div class="flex flex-col items-center justify-center h-full text-center px-4">
          <svg class="w-10 h-10 text-accent/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <p class="text-sm text-text-secondary mb-1">Set up AI provider</p>
          <p class="text-xs text-text-muted mb-3">Use Claude Code (Max subscription) or an API key</p>
          <button
            class="px-4 py-2 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover transition-colors"
            onclick={() => { showSettings = true }}
          >
            Configure
          </button>
        </div>
      {:else if assistantStore.messages.length === 0 && !assistantStore.streaming}
        <!-- Welcome state -->
        <div class="flex flex-col items-center justify-center h-full text-center px-4">
          <svg class="w-10 h-10 text-accent/30 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <p class="text-sm text-text-secondary mb-1">Ask me anything about SQL</p>
          <p class="text-xs text-text-muted">I can write queries, explain SQL, fix errors, and optimize performance</p>

          {#if connectionStore.connected}
            <div class="mt-4 flex flex-wrap gap-1.5 justify-center">
              {#each ['Write a query to...', 'Explain this table structure', 'How do I join...', 'Optimize my query'] as suggestion}
                <button
                  class="px-2.5 py-1 rounded-full text-[11px] bg-surface-tertiary text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors border border-border-primary"
                  onclick={() => { inputText = suggestion }}
                >
                  {suggestion}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <!-- Message list -->
        {#each assistantStore.messages as msg (msg.id)}
          <AiMessage
            message={msg}
            onRunQuery={handleRunQuery}
          />
        {/each}

        <!-- Streaming message -->
        {#if assistantStore.streaming && assistantStore.streamingContent}
          <AiMessage
            message={{ role: 'assistant', content: assistantStore.streamingContent, timestamp: Date.now() }}
            onRunQuery={handleRunQuery}
            isStreaming={true}
          />
        {:else if assistantStore.streaming}
          <div class="flex items-center gap-2 text-text-muted text-xs">
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Thinking...
          </div>
        {/if}
      {/if}
    </div>

    <!-- Input area -->
    {#if assistantStore.isReady}
      <div class="flex-shrink-0 border-t border-border-primary p-3">
        <!-- Context indicator -->
        {#if connectionStore.connected}
          <div class="flex items-center gap-1.5 mb-2">
            <div class="w-1.5 h-1.5 rounded-full bg-accent"></div>
            <span class="text-[10px] text-text-muted">
              {tableCount} {tableCount === 1 ? 'table' : 'tables'} in context
            </span>
          </div>
        {:else}
          <div class="flex items-center gap-1.5 mb-2">
            <div class="w-1.5 h-1.5 rounded-full bg-text-muted"></div>
            <span class="text-[10px] text-text-muted">Not connected — schema context unavailable</span>
          </div>
        {/if}

        <div class="flex items-end gap-2">
          <textarea
            bind:this={inputEl}
            bind:value={inputText}
            onkeydown={handleKeydown}
            oninput={handleInput}
            class="flex-1 px-3 py-2 bg-surface-tertiary border border-border-primary rounded-lg text-xs text-text-primary
                   placeholder:text-text-muted outline-none focus:border-accent/50 resize-none overflow-hidden"
            placeholder="Ask about SQL..."
            rows="1"
            disabled={assistantStore.streaming}
          ></textarea>

          {#if assistantStore.streaming}
            <button
              class="shrink-0 p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              onclick={() => assistantStore.stopStream()}
              title="Stop generation"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          {:else}
            <button
              class="shrink-0 p-2 rounded-lg transition-colors
                {inputText.trim()
                  ? 'bg-accent text-white hover:bg-accent-hover'
                  : 'bg-surface-tertiary text-text-muted'}"
              onclick={handleSend}
              disabled={!inputText.trim()}
              title="Send message"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .app-drag-region {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }
</style>
