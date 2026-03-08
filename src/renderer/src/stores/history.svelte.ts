export interface HistoryEntryView {
  id: string
  timestamp: number
  source: 'manual' | 'transaction'
  sql: string
  status: 'success' | 'error'
  error?: string
  duration: number
  affectedRows?: number
  database: string
}

let entries = $state<HistoryEntryView[]>([])
let total = $state(0)
let loading = $state(false)
let searchQuery = $state('')

async function refresh() {
  loading = true
  try {
    if (searchQuery.trim()) {
      const results = await window.api.searchHistory(searchQuery, 200)
      entries = results
      total = results.length
    } else {
      const result = await window.api.getHistory({ limit: 200 })
      entries = result.entries
      total = result.total
    }
  } catch (e) {
    console.error('Failed to load history:', e)
  } finally {
    loading = false
  }
}

function setSearch(query: string) {
  searchQuery = query
  refresh()
}

async function clear() {
  await window.api.clearHistory()
  entries = []
  total = 0
}

export const historyStore = {
  get entries() { return entries },
  get total() { return total },
  get loading() { return loading },
  get searchQuery() { return searchQuery },
  refresh,
  setSearch,
  clear
}
