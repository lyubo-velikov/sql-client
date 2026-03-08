<script lang="ts">
  import { connectionStore } from '../stores/connection.svelte'
  import { savedConnectionsStore } from '../stores/savedConnections.svelte'
  import { CONNECTION_COLORS } from '../../../shared/types'
  import type { SavedConnection } from '../../../shared/types'

  let { open = $bindable(false) } = $props()

  // View state: 'list' or 'form'
  let view = $state<'list' | 'form'>('list')
  let editingId = $state<string | null>(null)

  // Form state
  let formName = $state('')
  let formColor = $state(CONNECTION_COLORS[0])
  let formHost = $state('localhost')
  let formPort = $state(5432)
  let formDatabase = $state('postgres')
  let formUsername = $state('')
  let formPassword = $state('')
  let testing = $state(false)
  let testResult = $state<{ success: boolean; message: string } | null>(null)

  $effect(() => {
    if (open) {
      view = 'list'
      editingId = null
      testResult = null
    }
  })

  function openNewForm() {
    editingId = null
    formName = ''
    formColor = CONNECTION_COLORS[0]
    formHost = 'localhost'
    formPort = 5432
    formDatabase = 'postgres'
    formUsername = ''
    formPassword = ''
    testResult = null
    view = 'form'
  }

  function openEditForm(conn: SavedConnection) {
    editingId = conn.id
    formName = conn.name
    formColor = conn.color
    formHost = conn.host
    formPort = conn.port
    formDatabase = conn.database
    formUsername = conn.username
    formPassword = conn.password
    testResult = null
    view = 'form'
  }

  async function handleSave() {
    const data = {
      name: formName || formDatabase || 'Untitled',
      color: formColor,
      host: formHost,
      port: formPort,
      database: formDatabase,
      username: formUsername,
      password: formPassword
    }

    if (editingId) {
      await savedConnectionsStore.update(editingId, data)
    } else {
      await savedConnectionsStore.create(data)
    }
    view = 'list'
  }

  async function handleSaveAndConnect() {
    const data = {
      name: formName || formDatabase || 'Untitled',
      color: formColor,
      host: formHost,
      port: formPort,
      database: formDatabase,
      username: formUsername,
      password: formPassword
    }

    let saved: SavedConnection | null
    if (editingId) {
      saved = await savedConnectionsStore.update(editingId, data)
    } else {
      saved = await savedConnectionsStore.create(data)
    }

    if (saved) {
      await connectionStore.connectSaved(saved)
      open = false
    }
  }

  async function handleConnect(conn: SavedConnection) {
    await connectionStore.connectSaved(conn)
    open = false
  }

  async function handleDelete(id: string) {
    if (confirm('Delete this connection?')) {
      await savedConnectionsStore.remove(id)
    }
  }

  async function handleDuplicate(id: string) {
    await savedConnectionsStore.duplicate(id)
  }

  async function handleTestConnection() {
    testing = true
    testResult = null
    try {
      if (connectionStore.connected) {
        await connectionStore.disconnect()
      }
      const success = await connectionStore.connect({
        host: formHost,
        port: formPort,
        database: formDatabase,
        username: formUsername,
        password: formPassword
      })
      if (success) {
        testResult = { success: true, message: 'Connection successful' }
        await connectionStore.disconnect()
      } else {
        testResult = { success: false, message: connectionStore.error ?? 'Connection failed' }
      }
    } catch (err) {
      testResult = { success: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      testing = false
    }
  }

  function formatTime(ts?: number): string {
    if (!ts) return 'Never'
    const diff = Date.now() - ts
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  function handleClose() {
    open = false
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    onkeydown={(e) => { if (e.key === 'Escape') { if (view === 'form') view = 'list'; else handleClose() } }}
  >
    <div class="bg-surface-secondary border border-border-primary rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

      {#if view === 'list'}
        <!-- ===== LIST VIEW ===== -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-border-primary">
          <h2 class="text-sm font-semibold text-text-primary">Connections</h2>
          <button
            onclick={handleClose}
            class="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-surface-hover"
            title="Close"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="max-h-80 overflow-y-auto">
          {#if savedConnectionsStore.connections.length === 0}
            <div class="flex flex-col items-center justify-center py-12 text-text-muted">
              <svg class="w-10 h-10 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
              <p class="text-xs">No saved connections</p>
            </div>
          {:else}
            {#each savedConnectionsStore.connections as conn (conn.id)}
              {@const isActive = conn.id === connectionStore.activeConnectionId}
              <div class="group flex items-center gap-3 px-5 py-3 border-b border-border-primary/50 hover:bg-surface-hover/50 transition-colors">
                <!-- Color bar -->
                <div class="w-1 h-8 rounded-full shrink-0" style="background-color: {conn.color}"></div>

                <!-- Info (clickable to connect) -->
                <button class="flex-1 text-left min-w-0" ondblclick={() => handleConnect(conn)}>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-text-primary truncate">{conn.name}</span>
                    {#if isActive}
                      <span class="text-[9px] uppercase tracking-wider px-1 rounded bg-accent/20 text-accent">Active</span>
                    {/if}
                  </div>
                  <span class="text-[11px] text-text-muted font-mono truncate block">
                    {conn.username}@{conn.host}:{conn.port}/{conn.database}
                  </span>
                </button>

                <!-- Last connected -->
                <span class="text-[10px] text-text-muted shrink-0 hidden group-hover:hidden">{formatTime(conn.lastConnectedAt)}</span>

                <!-- Action buttons (visible on hover) -->
                <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onclick={() => handleConnect(conn)}
                    class="p-1 rounded text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                    title="Connect"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  </button>
                  <button
                    onclick={() => openEditForm(conn)}
                    class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                    title="Edit"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    onclick={() => handleDuplicate(conn.id)}
                    class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                    title="Duplicate"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  </button>
                  <button
                    onclick={() => handleDelete(conn.id)}
                    class="p-1 rounded text-text-muted hover:text-red-400 hover:bg-red-900/20 transition-colors"
                    title="Delete"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
                    </svg>
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>

        <div class="px-5 py-3 border-t border-border-primary">
          <button
            onclick={openNewForm}
            class="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            New Connection
          </button>
        </div>

      {:else}
        <!-- ===== FORM VIEW ===== -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-border-primary">
          <div class="flex items-center gap-2">
            <button
              onclick={() => { view = 'list' }}
              class="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-surface-hover"
              title="Back to list"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <h2 class="text-sm font-semibold text-text-primary">
              {editingId ? 'Edit Connection' : 'New Connection'}
            </h2>
          </div>
          <button
            onclick={handleClose}
            class="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-surface-hover"
            title="Close"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="px-5 py-4 space-y-3.5">
          <!-- Name -->
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">Name</label>
            <input type="text" bind:value={formName} placeholder="My Database" class="conn-input" />
          </div>

          <!-- Color picker -->
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1.5">Color</label>
            <div class="flex gap-2">
              {#each CONNECTION_COLORS as color}
                <button
                  class="w-6 h-6 rounded-full transition-all {formColor === color ? 'ring-2 ring-offset-2 ring-offset-surface-secondary scale-110' : 'hover:scale-110'}"
                  style="background-color: {color}; {formColor === color ? `ring-color: ${color}` : ''}"
                  onclick={() => { formColor = color }}
                ></button>
              {/each}
            </div>
          </div>

          <!-- Host + Port -->
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block text-xs font-medium text-text-secondary mb-1">Host</label>
              <input type="text" bind:value={formHost} placeholder="localhost" class="conn-input" />
            </div>
            <div class="w-24">
              <label class="block text-xs font-medium text-text-secondary mb-1">Port</label>
              <input type="number" bind:value={formPort} placeholder="5432" class="conn-input" />
            </div>
          </div>

          <!-- Database -->
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">Database</label>
            <input type="text" bind:value={formDatabase} placeholder="postgres" class="conn-input" />
          </div>

          <!-- Username -->
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">Username</label>
            <input type="text" bind:value={formUsername} placeholder="postgres" class="conn-input" />
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-medium text-text-secondary mb-1">Password</label>
            <input type="password" bind:value={formPassword} placeholder="password" class="conn-input" />
          </div>

          <!-- Test result -->
          {#if testResult}
            <div class="flex items-center gap-2 px-3 py-2 text-xs rounded-lg {testResult.success ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}">
              <div class="w-1.5 h-1.5 rounded-full {testResult.success ? 'bg-green-400' : 'bg-red-400'}"></div>
              {testResult.message}
            </div>
          {/if}
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-5 py-3 border-t border-border-primary bg-surface-primary/50">
          <button
            onclick={handleTestConnection}
            disabled={testing}
            class="px-3 py-1.5 text-xs font-medium text-text-secondary border border-border-secondary rounded-lg
                   hover:text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
          <div class="flex gap-2">
            <button
              onclick={handleSave}
              class="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onclick={handleSaveAndConnect}
              disabled={connectionStore.connecting}
              class="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg transition-colors"
            >
              {connectionStore.connecting ? 'Connecting...' : 'Save & Connect'}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .conn-input {
    width: 100%;
    padding: 6px 10px;
    font-size: 13px;
    background: var(--color-surface-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: 6px;
    color: var(--color-text-primary);
    outline: none;
    transition: border-color 0.15s;
  }
  .conn-input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(16, 163, 127, 0.15);
  }
  .conn-input::placeholder {
    color: var(--color-text-muted);
  }
</style>
