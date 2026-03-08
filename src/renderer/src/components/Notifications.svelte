<script lang="ts">
  import { notificationStore } from '../stores/notifications.svelte'
</script>

{#if notificationStore.notifications.length > 0}
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    {#each notificationStore.notifications as notif (notif.id)}
      <div
        class="pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-lg shadow-lg border text-xs font-medium max-w-xs animate-slide-in
          {notif.type === 'success' ? 'bg-green-950/90 border-green-800/50 text-green-300' :
           notif.type === 'error' ? 'bg-red-950/90 border-red-800/50 text-red-300' :
           notif.type === 'warning' ? 'bg-amber-950/90 border-amber-800/50 text-amber-300' :
           'bg-surface-secondary border-border-primary text-text-primary'}"
      >
        {#if notif.type === 'success'}
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        {:else if notif.type === 'error'}
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        {/if}
        <span class="flex-1">{notif.message}</span>
        <button
          class="shrink-0 p-0.5 rounded opacity-60 hover:opacity-100 transition-opacity"
          onclick={() => notificationStore.remove(notif.id)}
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  @keyframes slide-in {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .animate-slide-in {
    animation: slide-in 0.2s ease-out;
  }
</style>
