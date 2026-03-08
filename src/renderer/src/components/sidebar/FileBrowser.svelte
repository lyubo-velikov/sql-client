<script lang="ts">
  import { queryFilesStore } from '../../stores/queryFiles.svelte'
  import { tabStore } from '../../stores/tabs.svelte'
  import type { QueryFile } from '../../../../shared/types'

  let collapsed = $state(false)
  let contextMenu = $state<{ x: number; y: number; file: QueryFile } | null>(null)
  let renamingFile = $state<string | null>(null)
  let renameValue = $state('')

  function handleFileClick(file: QueryFile) {
    tabStore.openFile(file.filePath, file.name)
  }

  async function handleCreateFile() {
    const result = await queryFilesStore.createFile()
    tabStore.openFile(result.filePath, result.name)
  }

  function handleContextMenu(e: MouseEvent, file: QueryFile) {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY, file }
  }

  function closeContextMenu() {
    contextMenu = null
  }

  function startRename(file: QueryFile) {
    renamingFile = file.filePath
    renameValue = file.name.replace(/\.sql$/i, '')
    closeContextMenu()
  }

  async function commitRename(oldPath: string) {
    if (renameValue.trim()) {
      const result = await queryFilesStore.renameFile(oldPath, renameValue.trim())
      // Update any open tab referencing this file
      const tab = tabStore.tabs.find((t) => t.filePath === oldPath)
      if (tab) {
        const newName = renameValue.trim().replace(/\.sql$/i, '')
        tabStore.updateTab(tab.id, { filePath: result.newPath, title: newName })
      }
    }
    renamingFile = null
  }

  function cancelRename() {
    renamingFile = null
  }

  async function handleDelete(file: QueryFile) {
    if (confirm(`Delete "${file.name}"?`)) {
      await queryFilesStore.deleteFile(file.filePath)
      // Close any tab referencing this file
      const tab = tabStore.tabs.find((t) => t.filePath === file.filePath)
      if (tab) tabStore.closeTab(tab.id)
    }
    closeContextMenu()
  }

  function handleReveal(file: QueryFile) {
    queryFilesStore.revealInFinder(file.filePath)
    closeContextMenu()
  }

  function formatTime(ts: number): string {
    const diff = Date.now() - ts
    if (diff < 60_000) return 'now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  function displayName(name: string): string {
    return name.replace(/\.sql$/i, '')
  }
</script>

<svelte:window onclick={() => { if (contextMenu) closeContextMenu() }} />

<div class="border-b border-border-primary">
  <!-- Header -->
  <div class="flex items-center gap-1.5 px-3 py-1.5">
    <button
      class="flex items-center gap-1.5 flex-1 text-[11px] font-semibold text-text-muted
             uppercase tracking-wider hover:text-text-secondary transition-colors duration-150"
      onclick={() => { collapsed = !collapsed }}
    >
      <svg
        class="transition-transform duration-150 {collapsed ? '' : 'rotate-90'}"
        width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
      Queries
      <span class="text-text-muted font-normal ml-auto">{queryFilesStore.files.length}</span>
    </button>
    <!-- New file button -->
    <button
      class="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text-primary transition-colors"
      onclick={handleCreateFile}
      title="New query file (Cmd+N)"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  </div>

  {#if !collapsed}
    <div class="pb-1">
      {#if queryFilesStore.files.length === 0}
        <div class="px-3 py-2 text-text-muted text-[11px]">No query files yet</div>
      {:else}
        {#each queryFilesStore.files as file (file.filePath)}
          {@const isActive = tabStore.activeTab?.filePath === file.filePath}
          {#if renamingFile === file.filePath}
            <div class="flex items-center gap-1.5 px-3 py-1 mx-1">
              <!-- svelte-ignore a11y_autofocus -->
              <input
                type="text"
                class="flex-1 text-xs bg-surface-tertiary border border-accent rounded px-1.5 py-0.5
                       text-text-primary outline-none font-mono"
                bind:value={renameValue}
                autofocus
                onkeydown={(e) => {
                  if (e.key === 'Enter') commitRename(renamingFile!)
                  if (e.key === 'Escape') cancelRename()
                }}
                onblur={() => commitRename(renamingFile!)}
              />
            </div>
          {:else}
            <button
              class="flex items-center gap-2 w-full px-3 py-1 mx-1 rounded-md text-left
                     transition-colors duration-100 group
                     {isActive ? 'bg-surface-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}"
              style="width: calc(100% - 8px);"
              onclick={() => handleFileClick(file)}
              oncontextmenu={(e) => handleContextMenu(e, file)}
            >
              <!-- File icon -->
              <svg class="shrink-0 {isActive ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'} transition-colors" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
              <span class="text-xs truncate flex-1">{displayName(file.name)}</span>
              <span class="text-[10px] text-text-muted tabular-nums shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {formatTime(file.mtime)}
              </span>
            </button>
          {/if}
        {/each}
      {/if}

      <!-- Change directory link -->
      <button
        class="flex items-center gap-1 px-3 py-1 mt-0.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        onclick={() => queryFilesStore.changeDirectory()}
        title={queryFilesStore.directory}
      >
        <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
        </svg>
        {queryFilesStore.directory.replace(/^\/Users\/[^/]+/, '~')}
      </button>
    </div>
  {/if}
</div>

<!-- Context menu -->
{#if contextMenu}
  <div
    class="fixed z-50 bg-surface-secondary border border-border-primary rounded-lg shadow-xl py-1 min-w-[140px]"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
  >
    <button
      onclick={() => { if (contextMenu) startRename(contextMenu.file) }}
      class="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      Rename
    </button>
    <button
      onclick={() => { if (contextMenu) handleReveal(contextMenu.file) }}
      class="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
    >
      Reveal in Finder
    </button>
    <div class="my-1 border-t border-border-primary"></div>
    <button
      onclick={() => { if (contextMenu) handleDelete(contextMenu.file) }}
      class="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
    >
      Delete
    </button>
  </div>
{/if}
