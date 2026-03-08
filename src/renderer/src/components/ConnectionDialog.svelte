<script lang="ts">
  import { connectionStore, type ConnectionInfo } from '../stores/connection.svelte'

  let { open = $bindable(false) } = $props()

  let form = $state<ConnectionInfo>({
    host: connectionStore.connectionInfo.host,
    port: connectionStore.connectionInfo.port,
    database: connectionStore.connectionInfo.database,
    username: connectionStore.connectionInfo.username,
    password: connectionStore.connectionInfo.password
  })

  let testing = $state(false)
  let testResult = $state<{ success: boolean; message: string } | null>(null)

  // Sync form when dialog opens
  $effect(() => {
    if (open) {
      form = { ...connectionStore.connectionInfo }
      testResult = null
    }
  })

  async function handleTestConnection(): Promise<void> {
    testing = true
    testResult = null
    try {
      // If already connected, disconnect first
      if (connectionStore.connected) {
        await connectionStore.disconnect()
      }
      const success = await connectionStore.connect(form)
      if (success) {
        testResult = { success: true, message: 'Connection successful' }
        // Disconnect after test so user can explicitly connect
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

  async function handleConnect(): Promise<void> {
    if (connectionStore.connected) {
      await connectionStore.disconnect()
    }
    const success = await connectionStore.connect(form)
    if (success) {
      open = false
    }
  }

  function handleClose(): void {
    open = false
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      handleClose()
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="Connection settings"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div class="bg-surface-secondary border border-border-primary rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-border-primary">
        <h2 class="text-base font-semibold text-text-primary">Connection Settings</h2>
        <button
          onclick={handleClose}
          class="text-text-muted hover:text-text-primary transition-colors duration-150 p-1 rounded-md hover:bg-surface-hover"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-5 space-y-4">
        <!-- Host + Port -->
        <div class="flex gap-3">
          <div class="flex-1">
            <label for="conn-host" class="block text-xs font-medium text-text-secondary mb-1.5">Host</label>
            <input
              id="conn-host"
              type="text"
              bind:value={form.host}
              class="w-full px-3 py-2 text-sm bg-surface-tertiary border border-border-primary rounded-lg
                     text-text-primary placeholder:text-text-muted
                     focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                     transition-colors duration-150"
              placeholder="localhost"
            />
          </div>
          <div class="w-24">
            <label for="conn-port" class="block text-xs font-medium text-text-secondary mb-1.5">Port</label>
            <input
              id="conn-port"
              type="number"
              bind:value={form.port}
              class="w-full px-3 py-2 text-sm bg-surface-tertiary border border-border-primary rounded-lg
                     text-text-primary placeholder:text-text-muted
                     focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                     transition-colors duration-150"
              placeholder="5432"
            />
          </div>
        </div>

        <!-- Database -->
        <div>
          <label for="conn-database" class="block text-xs font-medium text-text-secondary mb-1.5">Database</label>
          <input
            id="conn-database"
            type="text"
            bind:value={form.database}
            class="w-full px-3 py-2 text-sm bg-surface-tertiary border border-border-primary rounded-lg
                   text-text-primary placeholder:text-text-muted
                   focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                   transition-colors duration-150"
            placeholder="postgres"
          />
        </div>

        <!-- Username -->
        <div>
          <label for="conn-username" class="block text-xs font-medium text-text-secondary mb-1.5">Username</label>
          <input
            id="conn-username"
            type="text"
            bind:value={form.username}
            class="w-full px-3 py-2 text-sm bg-surface-tertiary border border-border-primary rounded-lg
                   text-text-primary placeholder:text-text-muted
                   focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                   transition-colors duration-150"
            placeholder="postgres"
          />
        </div>

        <!-- Password -->
        <div>
          <label for="conn-password" class="block text-xs font-medium text-text-secondary mb-1.5">Password</label>
          <input
            id="conn-password"
            type="password"
            bind:value={form.password}
            class="w-full px-3 py-2 text-sm bg-surface-tertiary border border-border-primary rounded-lg
                   text-text-primary placeholder:text-text-muted
                   focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                   transition-colors duration-150"
            placeholder="password"
          />
        </div>

        <!-- Test result -->
        {#if testResult}
          <div class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg {testResult.success ? 'bg-accent/10 text-accent' : 'bg-danger/10 text-danger'}">
            {#if testResult.success}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {:else}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            {/if}
            <span>{testResult.message}</span>
          </div>
        {/if}

        <!-- Connection error from store -->
        {#if connectionStore.error && !testResult}
          <div class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-danger/10 text-danger">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <span>{connectionStore.error}</span>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between px-6 py-4 border-t border-border-primary bg-surface-primary/50">
        <button
          onclick={handleTestConnection}
          disabled={testing || connectionStore.connecting}
          class="px-4 py-2 text-sm font-medium text-text-secondary
                 border border-border-secondary rounded-lg
                 hover:text-text-primary hover:bg-surface-hover hover:border-border-primary
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-colors duration-150"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        <div class="flex gap-2">
          <button
            onclick={handleClose}
            class="px-4 py-2 text-sm font-medium text-text-secondary
                   hover:text-text-primary hover:bg-surface-hover
                   rounded-lg transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            onclick={handleConnect}
            disabled={connectionStore.connecting}
            class="px-4 py-2 text-sm font-medium text-white
                   bg-accent hover:bg-accent-hover
                   disabled:opacity-50 disabled:cursor-not-allowed
                   rounded-lg transition-colors duration-150"
          >
            {connectionStore.connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
