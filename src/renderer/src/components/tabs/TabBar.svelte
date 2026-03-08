<script lang="ts">
  import { tabStore } from '../../stores/tabs.svelte'

  let { sidebarCollapsed = false } = $props<{ sidebarCollapsed?: boolean }>()

  let queryCounter = $state(1)

  function getTabIcon(type: string): { viewBox: string; paths: string } {
    switch (type) {
      case 'table':
        return {
          viewBox: '0 0 24 24',
          paths: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/>'
        }
      case 'schema':
        return {
          viewBox: '0 0 24 24',
          paths: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
        }
      case 'query':
      default:
        return {
          viewBox: '0 0 24 24',
          paths: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'
        }
    }
  }

  function addQueryTab(): void {
    queryCounter++
    tabStore.addTab({
      type: 'query',
      title: `Query ${queryCounter}`,
      query: ''
    })
  }

  function handleTabMouseDown(e: MouseEvent, tabId: string): void {
    // Middle click to close
    if (e.button === 1) {
      e.preventDefault()
      tabStore.closeTab(tabId)
    }
  }

  function handleCloseClick(e: MouseEvent, tabId: string): void {
    e.stopPropagation()
    tabStore.closeTab(tabId)
  }
</script>

<div class="flex items-stretch bg-surface-primary border-b border-border-primary select-none app-drag-region
            {sidebarCollapsed ? 'pl-5 h-10' : 'h-9'}">
  <!-- Tabs scroll container -->
  <div class="flex items-stretch flex-1 overflow-x-auto no-scrollbar">
    {#each tabStore.tabs as tab (tab.id)}
      {@const icon = getTabIcon(tab.type)}
      {@const isActive = tab.id === tabStore.activeTabId}
      <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
      <div
        onclick={() => tabStore.setActiveTab(tab.id)}
        ondblclick={() => { if (tab.preview) tabStore.pinTab(tab.id) }}
        onmousedown={(e) => handleTabMouseDown(e, tab.id)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') tabStore.setActiveTab(tab.id) }}
        role="tab"
        tabindex="0"
        aria-selected={isActive}
        class="group flex items-center gap-1.5 px-3 min-w-0 max-w-[180px] shrink-0 cursor-pointer
               border-r border-border-primary
               transition-colors duration-100 no-drag
               {isActive
                 ? 'bg-surface-secondary text-text-primary border-b-2 border-b-accent'
                 : 'bg-surface-primary text-text-secondary hover:bg-surface-tertiary hover:text-text-primary border-b-2 border-b-transparent'}"
      >
        <!-- Tab icon -->
        <svg class="shrink-0 {isActive ? 'text-accent' : 'text-text-muted'}" width="12" height="12" viewBox={icon.viewBox} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {@html icon.paths}
        </svg>

        <!-- Tab title -->
        <span class="text-xs truncate {tab.preview ? 'italic opacity-70' : ''}">{tab.title}</span>

        <!-- Close button -->
        <button
          onclick={(e) => handleCloseClick(e, tab.id)}
          class="shrink-0 ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100
                 text-text-muted hover:text-text-primary hover:bg-surface-hover
                 transition-all duration-100"
          title="Close tab"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    {/each}
  </div>

  <!-- Add tab button -->
  <button
    onclick={addQueryTab}
    class="flex items-center justify-center w-9 shrink-0
           text-text-muted hover:text-text-primary hover:bg-surface-tertiary
           transition-colors duration-150 no-drag"
    title="New query tab"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  </button>
</div>

<style>
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .app-drag-region {
    -webkit-app-region: drag;
  }
  .no-drag {
    -webkit-app-region: no-drag;
  }
</style>
