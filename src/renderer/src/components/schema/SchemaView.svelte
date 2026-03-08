<script lang="ts">
  import { tabStore } from '../../stores/tabs.svelte'

  let { schema, table }: { schema: string; table: string } = $props()

  let columns = $state<Array<{
    column_name: string
    data_type: string
    is_nullable: string
    column_default: string | null
    is_primary_key: boolean
  }>>([])

  let foreignKeys = $state<Array<{
    table_schema: string
    table_name: string
    column_name: string
    foreign_table_schema: string
    foreign_table_name: string
    foreign_column_name: string
    constraint_name?: string
  }>>([])

  let indexes = $state<Array<{
    index_name: string
    column_name: string
    is_unique: boolean
    is_primary: boolean
    index_type: string
  }>>([])

  let loading = $state(true)
  let error = $state<string | null>(null)

  // Group indexes by name
  let groupedIndexes = $derived.by(() => {
    const groups = new Map<string, { columns: string[]; isUnique: boolean; isPrimary: boolean; type: string }>()
    for (const idx of indexes) {
      if (!groups.has(idx.index_name)) {
        groups.set(idx.index_name, {
          columns: [],
          isUnique: idx.is_unique,
          isPrimary: idx.is_primary,
          type: idx.index_type
        })
      }
      groups.get(idx.index_name)!.columns.push(idx.column_name)
    }
    return groups
  })

  // Filter FKs for this table (outgoing)
  let outgoingFKs = $derived(
    foreignKeys.filter(fk => fk.table_schema === schema && fk.table_name === table)
  )

  // Filter FKs referencing this table (incoming)
  let incomingFKs = $derived(
    foreignKeys.filter(fk => fk.foreign_table_schema === schema && fk.foreign_table_name === table)
  )

  async function fetchAll() {
    loading = true
    error = null
    try {
      const [schemaResult, fkResult, indexResult] = await Promise.all([
        window.api.getTableSchema(schema, table),
        window.api.getForeignKeys(),
        window.api.getIndexes(schema, table)
      ])

      if (schemaResult.success && schemaResult.data) {
        columns = schemaResult.data
      } else {
        error = schemaResult.error ?? 'Failed to fetch schema'
      }

      if (fkResult.success && fkResult.data) {
        foreignKeys = fkResult.data
      }

      if (indexResult.success && indexResult.data) {
        indexes = indexResult.data
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  function openRelatedTable(s: string, t: string) {
    tabStore.addTab({
      type: 'table',
      title: t,
      schema: s,
      table: t
    })
  }

  function getTypeColor(dataType: string): string {
    const t = dataType.toLowerCase()
    if (t.includes('int') || t.includes('numeric') || t.includes('decimal') || t.includes('float') || t.includes('double') || t.includes('real') || t.includes('serial')) {
      return 'text-blue-400'
    }
    if (t.includes('char') || t.includes('text') || t.includes('varchar')) {
      return 'text-green-400'
    }
    if (t.includes('bool')) {
      return 'text-amber-400'
    }
    if (t.includes('date') || t.includes('time') || t.includes('timestamp')) {
      return 'text-purple-400'
    }
    if (t.includes('json')) {
      return 'text-orange-400'
    }
    if (t.includes('uuid')) {
      return 'text-pink-400'
    }
    return 'text-text-secondary'
  }

  $effect(() => {
    const _s = schema
    const _t = table
    fetchAll()
  })
</script>

<div class="h-full overflow-y-auto p-4 space-y-4">
  {#if loading}
    <div class="space-y-4">
      {#each [1, 2, 3] as _}
        <div class="bg-surface-secondary rounded-lg p-4 border border-border-primary">
          <div class="h-4 bg-surface-tertiary rounded w-32 mb-4 animate-pulse"></div>
          {#each [1, 2, 3, 4] as _row}
            <div class="h-3 bg-surface-tertiary rounded w-full mb-2 animate-pulse" style="width: {50 + Math.random() * 50}%"></div>
          {/each}
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="bg-red-950/30 rounded-lg p-4 border border-red-800/30">
      <p class="text-red-400 text-sm">{error}</p>
    </div>
  {:else}
    <!-- Table header -->
    <div class="flex items-center gap-3 mb-2">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
        </svg>
        <span class="text-text-secondary text-sm font-mono">{schema}.</span>
        <span class="text-text-primary text-lg font-semibold">{table}</span>
      </div>
      <span class="text-text-muted text-xs">{columns.length} columns</span>
    </div>

    <!-- Columns card -->
    <div class="bg-surface-secondary rounded-lg border border-border-primary overflow-hidden">
      <div class="px-4 py-2.5 border-b border-border-primary">
        <h3 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">Columns</h3>
      </div>
      <div class="divide-y divide-border-primary">
        {#each columns as col}
          <div class="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
            <!-- PK indicator -->
            <div class="w-5 flex-shrink-0">
              {#if col.is_primary_key}
                <svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.75 1.5a6.75 6.75 0 00-6 9.89L2.25 21.89l.89.89 3-1.5 1.5 3 4.5-4.5 1.5 3 3-1.5-.89-.89L5.86 10.5A6.75 6.75 0 1018.75 1.5zm0 10.5a3.75 3.75 0 110-7.5 3.75 3.75 0 010 7.5z"/>
                </svg>
              {/if}
            </div>

            <!-- Column name -->
            <span class="font-mono text-sm text-text-primary min-w-[140px]">{col.column_name}</span>

            <!-- Data type -->
            <span class="font-mono text-xs {getTypeColor(col.data_type)} min-w-[120px]">{col.data_type}</span>

            <!-- Nullable -->
            <span class="text-xs min-w-[60px]">
              {#if col.is_nullable === 'NO'}
                <span class="text-red-400/60 font-medium">NOT NULL</span>
              {:else}
                <span class="text-text-muted">nullable</span>
              {/if}
            </span>

            <!-- Default -->
            {#if col.column_default}
              <span class="text-xs text-text-muted font-mono truncate max-w-[200px]" title={col.column_default}>
                = {col.column_default}
              </span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Foreign Keys (Outgoing) -->
    {#if outgoingFKs.length > 0}
      <div class="bg-surface-secondary rounded-lg border border-border-primary overflow-hidden">
        <div class="px-4 py-2.5 border-b border-border-primary">
          <h3 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Foreign Keys
            <span class="text-text-muted font-normal normal-case ml-1">({outgoingFKs.length})</span>
          </h3>
        </div>
        <div class="divide-y divide-border-primary">
          {#each outgoingFKs as fk}
            <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors">
              <svg class="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <span class="font-mono text-sm text-text-primary">{fk.column_name}</span>
              <svg class="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
              <button
                class="font-mono text-sm text-accent hover:text-accent-hover hover:underline cursor-pointer transition-colors"
                onclick={() => openRelatedTable(fk.foreign_table_schema, fk.foreign_table_name)}
              >
                {fk.foreign_table_schema}.{fk.foreign_table_name}
              </button>
              <span class="text-xs text-text-muted font-mono">({fk.foreign_column_name})</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Referenced By (Incoming) -->
    {#if incomingFKs.length > 0}
      <div class="bg-surface-secondary rounded-lg border border-border-primary overflow-hidden">
        <div class="px-4 py-2.5 border-b border-border-primary">
          <h3 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Referenced By
            <span class="text-text-muted font-normal normal-case ml-1">({incomingFKs.length})</span>
          </h3>
        </div>
        <div class="divide-y divide-border-primary">
          {#each incomingFKs as fk}
            <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors">
              <svg class="w-4 h-4 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              <button
                class="font-mono text-sm text-accent hover:text-accent-hover hover:underline cursor-pointer transition-colors"
                onclick={() => openRelatedTable(fk.table_schema, fk.table_name)}
              >
                {fk.table_schema}.{fk.table_name}
              </button>
              <span class="text-xs text-text-muted font-mono">({fk.column_name})</span>
              <svg class="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
              </svg>
              <span class="font-mono text-xs text-text-secondary">{fk.foreign_column_name}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Indexes -->
    {#if groupedIndexes.size > 0}
      <div class="bg-surface-secondary rounded-lg border border-border-primary overflow-hidden">
        <div class="px-4 py-2.5 border-b border-border-primary">
          <h3 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Indexes
            <span class="text-text-muted font-normal normal-case ml-1">({groupedIndexes.size})</span>
          </h3>
        </div>
        <div class="divide-y divide-border-primary">
          {#each [...groupedIndexes] as [name, idx]}
            <div class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors">
              <svg class="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
              <span class="font-mono text-sm text-text-primary">{name}</span>
              <div class="flex items-center gap-1.5">
                {#if idx.isPrimary}
                  <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">PK</span>
                {/if}
                {#if idx.isUnique && !idx.isPrimary}
                  <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400">UNIQUE</span>
                {/if}
                <span class="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-tertiary">{idx.type}</span>
              </div>
              <span class="text-xs text-text-muted font-mono">
                ({idx.columns.join(', ')})
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- No FK/Index info -->
    {#if outgoingFKs.length === 0 && incomingFKs.length === 0 && groupedIndexes.size === 0}
      <div class="text-center py-6 text-text-muted text-xs">
        No foreign keys or indexes found for this table.
      </div>
    {/if}
  {/if}
</div>
