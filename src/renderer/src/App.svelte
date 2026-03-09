<script lang="ts">
  import './app.css'
  import { onMount } from 'svelte'
  import { tabStore } from './stores/tabs.svelte'
  import { connectionStore, getLegacyConnection } from './stores/connection.svelte'
  import { savedConnectionsStore } from './stores/savedConnections.svelte'
  import Sidebar from './components/sidebar/Sidebar.svelte'
  import TabBar from './components/tabs/TabBar.svelte'
  import ConnectionManager from './components/ConnectionManager.svelte'
  import QueryEditor from './components/editor/QueryEditor.svelte'
  import TableView from './components/grid/TableView.svelte'
  import SchemaView from './components/schema/SchemaView.svelte'
  import Notifications from './components/Notifications.svelte'
  import HistoryDrawer from './components/history/HistoryDrawer.svelte'
  import AiAssistant from './components/ai/AiAssistant.svelte'
  import { queryFilesStore } from './stores/queryFiles.svelte'
  import { assistantStore } from './stores/assistant.svelte'

  let connectionManagerOpen = $state(false)
  let sidebarCollapsed = $state(false)
  let showHistory = $state(false)
  let showAiAssistant = $state(false)

  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
      e.preventDefault()
      showAiAssistant = !showAiAssistant
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'h') {
      e.preventDefault()
      showHistory = !showHistory
      return
    }

    // Cmd+W to close active tab (prevent window close)
    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      e.preventDefault()
      if (tabStore.activeTabId) {
        tabStore.closeTab(tabStore.activeTabId)
      }
      return
    }

    // Cmd+N to create new query file
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault()
      createNewQueryFile()
      return
    }

    // Cmd+S to save active query tab to file
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && !e.shiftKey) {
      // Only handle for query tabs — TableView handles its own Cmd+S
      const tab = tabStore.activeTab
      if (tab?.type === 'query' && tab.filePath) {
        e.preventDefault()
        // Force immediate save (editor has auto-save but this is explicit)
        // The editor's auto-save handles this, but we can also do nothing here
        // since the editor debounce is short enough. The editor handles Cmd+S internally.
      }
      return
    }

    // Cmd+K to open connection manager
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      connectionManagerOpen = !connectionManagerOpen
      return
    }

    // Cmd+1 through Cmd+9 to switch tabs
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 9) {
        e.preventDefault()
        const idx = num - 1
        if (idx < tabStore.tabs.length) {
          tabStore.setActiveTab(tabStore.tabs[idx].id)
        }
      }
    }
  }

  function openConnectionManager(): void {
    connectionManagerOpen = true
  }

  async function createNewQueryFile() {
    const result = await queryFilesStore.createFile()
    tabStore.openFile(result.filePath, result.name)
  }

  onMount(async () => {
    // Load query files and AI assistant
    await queryFilesStore.load()
    assistantStore.load()

    // Open default tab if none exist — create a file-backed query
    if (tabStore.tabs.length === 0) {
      await createNewQueryFile()
    }

    // Load saved connections
    await savedConnectionsStore.load()

    // Migrate legacy single connection if needed
    if (savedConnectionsStore.connections.length === 0) {
      const legacy = getLegacyConnection()
      if (legacy) {
        const saved = await savedConnectionsStore.create({
          name: legacy.database,
          color: '#10a37f',
          ...legacy
        })
        await connectionStore.connectSaved(saved)
        return
      }
    }

    // Auto-connect to last active connection
    const lastId = connectionStore.loadLastActiveId()
    if (lastId) {
      const conn = savedConnectionsStore.connections.find((c) => c.id === lastId)
      if (conn) {
        await connectionStore.connectSaved(conn)
        return
      }
    }

    // If we have saved connections but none active, show the manager
    if (savedConnectionsStore.connections.length > 0) {
      connectionManagerOpen = true
    } else {
      // No connections at all — show manager for first-time setup
      connectionManagerOpen = true
    }
  })
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="h-screen w-screen bg-surface-primary text-text-primary flex overflow-hidden">
  <!-- Sidebar -->
  <Sidebar onOpenConnectionDialog={openConnectionManager} bind:collapsed={sidebarCollapsed} />

  <!-- Main content area -->
  <div class="flex flex-col flex-1 min-w-0">
    <!-- Tab bar -->
    <TabBar {sidebarCollapsed} onToggleHistory={() => { showHistory = !showHistory }} onToggleAi={() => { showAiAssistant = !showAiAssistant }} />

    <!-- Tab content — all tabs stay mounted, only active one is visible -->
    <div class="flex-1 overflow-hidden relative">
      {#each tabStore.tabs as tab (tab.id)}
        {@const isActive = tab.id === tabStore.activeTabId}
        <div class="absolute inset-0" style:display={isActive ? '' : 'none'}>
          {#if tab.type === 'query'}
            <QueryEditor
              initialQuery={tab.query ?? ''}
              filePath={tab.filePath}
              onQueryChange={(q) => tabStore.updateTab(tab.id, { query: q })}
              onToggleHistory={() => { showHistory = !showHistory }}
              onAskAi={(params) => {
                showAiAssistant = true
                if (params.type === 'fix-error') {
                  assistantStore.sendMessage(`I ran this SQL query and got an error. Please explain what went wrong and provide the corrected query I can run.\n\n**Query:**\n\`\`\`sql\n${params.query}\n\`\`\`\n\n**Error:**\n\`\`\`\n${params.error}\n\`\`\``)
                } else if (params.type === 'explain') {
                  assistantStore.sendMessage(`Explain this SQL query:\n\n\`\`\`sql\n${params.query}\n\`\`\``)
                }
              }}
            />
          {:else if tab.type === 'table'}
            <TableView schema={tab.schema ?? 'public'} table={tab.table ?? ''} />
          {:else if tab.type === 'schema'}
            <SchemaView schema={tab.schema ?? 'public'} table={tab.table ?? ''} />
          {/if}
        </div>
      {/each}

      {#if tabStore.tabs.length === 0}
        <!-- Empty state: no tabs open -->
        <div class="h-full flex flex-col items-center justify-center text-text-muted">
          <svg class="mb-4 opacity-20" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
          </svg>
          <p class="text-sm font-medium text-text-secondary mb-1">No tabs open</p>
          <p class="text-xs">Select a table from the sidebar or open a new query tab</p>
        </div>
      {/if}
    </div>

    <!-- History drawer -->
    <HistoryDrawer bind:open={showHistory} />
  </div>

  <!-- AI Assistant right sidebar -->
  <AiAssistant bind:open={showAiAssistant} />
</div>

<!-- Connection manager modal -->
<ConnectionManager bind:open={connectionManagerOpen} />
<Notifications />
