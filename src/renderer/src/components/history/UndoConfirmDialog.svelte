<script lang="ts">
  import type { UndoData } from '../../../../shared/types'
  import { notificationStore } from '../../stores/notifications.svelte'
  import { historyStore } from '../../stores/history.svelte'

  let { open = $bindable(false), undoData = null } = $props<{
    open?: boolean
    undoData?: UndoData | null
  }>()

  let executing = $state(false)

  function inlineParams(sqlStr: string, params: unknown[]): string {
    if (!params || params.length === 0) return sqlStr
    return sqlStr.replace(/\$(\d+)/g, (_, idx) => {
      const val = params[parseInt(idx, 10) - 1]
      if (val === null || val === undefined) return 'NULL'
      if (typeof val === 'number') return String(val)
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
      return `'${String(val).replace(/'/g, "''")}'`
    })
  }

  async function executeUndo() {
    if (!undoData || executing) return
    executing = true
    try {
      const result = await window.api.executeUndo(JSON.parse(JSON.stringify(undoData.operations)))
      if (result.success) {
        notificationStore.add('success', `Undo successful — ${result.data?.affectedRows ?? 0} rows affected`)
        historyStore.refresh()
        open = false
      } else {
        notificationStore.add('error', `Undo failed: ${result.error}`)
      }
    } catch (e) {
      notificationStore.add('error', `Undo failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      executing = false
    }
  }
</script>

{#if open && undoData}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) open = false }}
    onkeydown={(e) => { if (e.key === 'Escape') open = false }}
  >
    <div class="bg-surface-secondary rounded-xl border border-border-primary shadow-2xl w-full max-w-lg mx-4">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-border-primary">
        <h2 class="text-sm font-semibold text-text-primary">Undo Transaction</h2>
        <button
          onclick={() => { open = false }}
          class="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-surface-hover"
          title="Close"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-5 py-4">
        <p class="text-xs text-text-secondary mb-3">
          The following SQL will be executed to reverse the changes. This is a new transaction that will appear in history.
        </p>

        <div class="max-h-60 overflow-y-auto bg-surface-tertiary rounded-lg border border-border-primary">
          {#each undoData.operations as op, i}
            <div class="px-3 py-2 {i > 0 ? 'border-t border-border-primary/50' : ''}">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] uppercase tracking-wider px-1 rounded font-medium
                  {op.type === 'reverse-update' ? 'bg-amber-900/30 text-amber-400' :
                   op.type === 'reverse-insert' ? 'bg-red-900/30 text-red-400' :
                   'bg-green-900/30 text-green-400'}">
                  {op.type === 'reverse-update' ? 'UPDATE' : op.type === 'reverse-insert' ? 'DELETE' : 'INSERT'}
                </span>
                <span class="text-[11px] text-text-muted">{op.description}</span>
              </div>
              <pre class="text-[11px] font-mono text-text-secondary whitespace-pre-wrap">{inlineParams(op.reverseSql, op.reverseParams)}</pre>
            </div>
          {/each}
        </div>

        <p class="text-[11px] text-amber-400/70 mt-3">
          Warning: If the data has been modified since the original transaction, the undo may produce unexpected results.
        </p>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-primary">
        <button
          class="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
          onclick={() => { open = false }}
        >
          Cancel
        </button>
        <button
          class="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50"
          onclick={executeUndo}
          disabled={executing}
        >
          {#if executing}Executing...{:else}Execute Undo{/if}
        </button>
      </div>
    </div>
  </div>
{/if}
