<script lang="ts">
  import { connectionStore } from '../../stores/connection.svelte'
  import { tabStore } from '../../stores/tabs.svelte'
  import ThemeToggle from '../ThemeToggle.svelte'
  import FileBrowser from './FileBrowser.svelte'

  let { onOpenConnectionDialog, collapsed = $bindable(false) } = $props<{ onOpenConnectionDialog: () => void; collapsed?: boolean }>()

  let searchQuery = $state('')
  let contextMenu = $state<{ x: number; y: number; schema: string; table: string } | null>(null)

  // Group tables by schema
  let groupedTables = $derived.by(() => {
    const filtered = connectionStore.tables.filter((t) => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return t.tablename.toLowerCase().includes(q) || t.schemaname.toLowerCase().includes(q)
    })

    const groups: Record<string, typeof filtered> = {}
    for (const table of filtered) {
      if (!groups[table.schemaname]) {
        groups[table.schemaname] = []
      }
      groups[table.schemaname].push(table)
    }
    return groups
  })

  let schemaNames = $derived(Object.keys(groupedTables).sort())

  // Track collapsed schemas
  let collapsedSchemas = $state<Set<string>>(new Set())

  function toggleSchema(schema: string): void {
    if (collapsedSchemas.has(schema)) {
      collapsedSchemas.delete(schema)
    } else {
      collapsedSchemas.add(schema)
    }
    // Trigger reactivity
    collapsedSchemas = new Set(collapsedSchemas)
  }

  function handleTableClick(schema: string, table: string): void {
    tabStore.addTab({
      type: 'table',
      title: table,
      schema,
      table,
      preview: true
    })
  }

  function handleContextMenu(e: MouseEvent, schema: string, table: string): void {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY, schema, table }
  }

  function closeContextMenu(): void {
    contextMenu = null
  }

  function handleContextAction(action: 'data' | 'schema' | 'query'): void {
    if (!contextMenu) return
    const { schema, table } = contextMenu

    switch (action) {
      case 'data':
        tabStore.addTab({ type: 'table', title: table, schema, table })
        break
      case 'schema':
        tabStore.addTab({ type: 'schema', title: `${table} (schema)`, schema, table })
        break
      case 'query':
        tabStore.addTab({
          type: 'query',
          title: `Query - ${table}`,
          query: `SELECT * FROM "${schema}"."${table}" LIMIT 100;`
        })
        break
    }
    closeContextMenu()
  }

  function formatRowCount(count: number): string {
    if (count < 0) return '?'
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
    return String(count)
  }

  function handleGlobalClick(): void {
    if (contextMenu) closeContextMenu()
  }
</script>

<svelte:window onclick={handleGlobalClick} />

{#if collapsed}
  <!-- Collapsed sidebar -->
  <div class="flex flex-col items-center pb-3 w-12 bg-surface-secondary border-r border-border-primary shrink-0">
    <!-- Drag region above traffic lights -->
    <div class="w-full h-14 shrink-0 app-drag-region"></div>
    <!-- Expand button -->
    <button
      onclick={() => (collapsed = false)}
      class="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors duration-150"
      title="Expand sidebar"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>

    <div class="flex-1"></div>

    <!-- Connection indicator -->
    <div class="mb-2">
      {#if connectionStore.connected}
        <div class="w-2.5 h-2.5 rounded-full" style="background-color: {connectionStore.activeConnectionColor}"></div>
      {:else}
        <div class="w-2.5 h-2.5 rounded-full bg-text-muted"></div>
      {/if}
    </div>

    <ThemeToggle />

    <button
      onclick={onOpenConnectionDialog}
      class="mt-1 p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors duration-150"
      title="Connection settings"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
    </button>
  </div>
{:else}
  <!-- Expanded sidebar -->
  <div class="flex flex-col w-[260px] bg-surface-secondary border-r border-border-primary shrink-0 select-none">
    <!-- Drag region covering traffic lights area -->
    <div class="w-full h-10 shrink-0 app-drag-region"></div>
    <!-- Header -->
    <div class="flex items-center justify-between px-4 pb-2">
      <button
        class="flex items-center gap-2 hover:opacity-80 transition-opacity"
        onclick={onOpenConnectionDialog}
        title="Switch connection (Cmd+K)"
      >
        {#if connectionStore.connected}
          <div class="w-2 h-2 rounded-full transition-colors duration-300" style="background-color: {connectionStore.activeConnectionColor}"></div>
          <span class="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {connectionStore.activeConnectionName || connectionStore.connectionInfo.database}
          </span>
        {:else}
          <div class="w-2 h-2 rounded-full bg-text-muted transition-colors duration-300"></div>
          <span class="text-xs font-medium text-text-secondary uppercase tracking-wider">Not connected</span>
        {/if}
      </button>
      <button
        onclick={() => (collapsed = true)}
        class="p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors duration-150"
        title="Collapse sidebar"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
    </div>

    <!-- Query files browser -->
    <FileBrowser />

    <!-- Search -->
    <div class="px-3 py-2">
      <div class="relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Filter tables..."
          class="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-tertiary border border-border-primary rounded-md
                 text-text-primary placeholder:text-text-muted
                 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20
                 transition-colors duration-150"
        />
        {#if searchQuery}
          <button
            onclick={() => (searchQuery = '')}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Table list -->
    <div class="flex-1 overflow-y-auto px-1 pb-2">
      {#if !connectionStore.connected}
        <div class="flex flex-col items-center justify-center h-full text-center px-4">
          <svg class="text-text-muted mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          <p class="text-xs text-text-muted mb-3">No database connected</p>
          <button
            onclick={onOpenConnectionDialog}
            class="px-3 py-1.5 text-xs font-medium text-accent border border-accent/30
                   rounded-md hover:bg-accent/10 transition-colors duration-150"
          >
            Connect
          </button>
        </div>
      {:else if connectionStore.tables.length === 0}
        <div class="flex flex-col items-center justify-center h-32 text-center px-4">
          <p class="text-xs text-text-muted">No tables found</p>
        </div>
      {:else}
        {#each schemaNames as schema}
          <!-- Schema group -->
          <div class="mt-1">
            <button
              onclick={() => toggleSchema(schema)}
              class="flex items-center gap-1.5 w-full px-3 py-1 text-[11px] font-semibold text-text-muted
                     uppercase tracking-wider hover:text-text-secondary transition-colors duration-150"
            >
              <svg
                class="transition-transform duration-150 {collapsedSchemas.has(schema) ? '' : 'rotate-90'}"
                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              {schema}
              <span class="text-text-muted font-normal ml-auto">{groupedTables[schema].length}</span>
            </button>

            {#if !collapsedSchemas.has(schema)}
              <div class="mt-0.5">
                {#each groupedTables[schema] as table}
                  <button
                    onclick={() => handleTableClick(table.schemaname, table.tablename)}
                    oncontextmenu={(e) => handleContextMenu(e, table.schemaname, table.tablename)}
                    class="flex items-center gap-2 w-full px-3 py-1 mx-1 rounded-md text-left
                           text-text-secondary hover:text-text-primary hover:bg-surface-hover
                           transition-colors duration-100 group"
                    style="width: calc(100% - 8px);"
                  >
                    <!-- Table icon -->
                    <svg class="shrink-0 text-text-muted group-hover:text-text-secondary transition-colors" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="3" y1="9" x2="21" y2="9"></line>
                      <line x1="9" y1="3" x2="9" y2="21"></line>
                    </svg>
                    <span class="text-xs truncate flex-1">{table.tablename}</span>
                    <span class="text-[10px] text-text-muted tabular-nums shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatRowCount(table.row_count)}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between px-3 py-2 border-t border-border-primary">
      <div class="flex items-center gap-1">
        <ThemeToggle />
        <button
          onclick={onOpenConnectionDialog}
          class="flex items-center justify-center w-8 h-8 rounded-md
                 text-text-secondary hover:text-text-primary hover:bg-surface-hover
                 transition-colors duration-150"
          title="Connection settings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
      {#if connectionStore.connected}
        <button
          onclick={() => connectionStore.refreshTables()}
          class="flex items-center justify-center w-8 h-8 rounded-md
                 text-text-secondary hover:text-text-primary hover:bg-surface-hover
                 transition-colors duration-150"
          title="Refresh tables"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .app-drag-region {
    -webkit-app-region: drag;
  }
</style>

<!-- Context menu -->
{#if contextMenu}
  <div
    class="fixed z-50 bg-surface-secondary border border-border-primary rounded-lg shadow-xl py-1 min-w-[160px]"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
  >
    <button
      onclick={() => handleContextAction('data')}
      class="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="9" y1="3" x2="9" y2="21"></line>
      </svg>
      View Data
    </button>
    <button
      onclick={() => handleContextAction('schema')}
      class="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
      </svg>
      View Schema
    </button>
    <div class="my-1 border-t border-border-primary"></div>
    <button
      onclick={() => handleContextAction('query')}
      class="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
      New Query
    </button>
  </div>
{/if}
