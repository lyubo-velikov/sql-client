<script lang="ts">
  import './app.css'
  import { onMount } from 'svelte'
  import { tabStore } from './stores/tabs.svelte'
  import { connectionStore } from './stores/connection.svelte'
  import Sidebar from './components/sidebar/Sidebar.svelte'
  import TabBar from './components/tabs/TabBar.svelte'
  import ConnectionDialog from './components/ConnectionDialog.svelte'
  import QueryEditor from './components/editor/QueryEditor.svelte'
  import TableView from './components/grid/TableView.svelte'
  import SchemaView from './components/schema/SchemaView.svelte'

  let connectionDialogOpen = $state(false)
  let sidebarCollapsed = $state(false)

  function openConnectionDialog(): void {
    connectionDialogOpen = true
  }

  onMount(() => {
    // Open a default query tab
    tabStore.openDefaultTab()

    // Auto-connect with default credentials
    connectionStore.connect()
  })
</script>

<div class="h-screen w-screen bg-surface-primary text-text-primary flex overflow-hidden">
  <!-- Sidebar -->
  <Sidebar onOpenConnectionDialog={openConnectionDialog} bind:collapsed={sidebarCollapsed} />

  <!-- Main content area -->
  <div class="flex flex-col flex-1 min-w-0">
    <!-- Tab bar -->
    <TabBar {sidebarCollapsed} />

    <!-- Tab content -->
    <div class="flex-1 overflow-hidden">
      {#if tabStore.activeTab}
        {#if tabStore.activeTab.type === 'query'}
          <QueryEditor initialQuery={tabStore.activeTab.query ?? ''} />
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
  </div>
</div>

<!-- Connection dialog modal -->
<ConnectionDialog bind:open={connectionDialogOpen} />
