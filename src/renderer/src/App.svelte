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

  let connectionManagerOpen = $state(false)
  let sidebarCollapsed = $state(false)
  let showHistory = $state(false)

  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'h') {
      e.preventDefault()
      showHistory = !showHistory
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

  function handleQueryChange(query: string): void {
    if (tabStore.activeTabId) {
      tabStore.updateTab(tabStore.activeTabId, { query })
    }
  }

  onMount(async () => {
    tabStore.openDefaultTab()

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
    <TabBar {sidebarCollapsed} onToggleHistory={() => { showHistory = !showHistory }} />

    <!-- Tab content -->
    <div class="flex-1 overflow-hidden">
      {#if tabStore.activeTab}
        {#if tabStore.activeTab.type === 'query'}
          {#key tabStore.activeTabId}
            <QueryEditor initialQuery={tabStore.activeTab.query ?? ''} onQueryChange={handleQueryChange} onToggleHistory={() => { showHistory = !showHistory }} />
          {/key}
        {:else if tabStore.activeTab.type === 'table'}
          <TableView schema={tabStore.activeTab.schema ?? 'public'} table={tabStore.activeTab.table ?? ''} />
        {:else if tabStore.activeTab.type === 'schema'}
          <SchemaView schema={tabStore.activeTab.schema ?? 'public'} table={tabStore.activeTab.table ?? ''} />
        {/if}
      {:else}
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
</div>

<!-- Connection manager modal -->
<ConnectionManager bind:open={connectionManagerOpen} />
<Notifications />
