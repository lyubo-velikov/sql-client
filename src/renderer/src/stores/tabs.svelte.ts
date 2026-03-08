export interface Tab {
  id: string
  type: 'query' | 'table' | 'schema'
  title: string
  schema?: string
  table?: string
  query?: string
}

let tabs = $state<Tab[]>([])
let activeTabId = $state<string | null>(null)
let activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? null)

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function addTab(tab: Omit<Tab, 'id'>): string {
  // If opening a table or schema tab, check if one already exists for the same table
  if (tab.type === 'table' || tab.type === 'schema') {
    const existing = tabs.find(
      (t) => t.type === tab.type && t.schema === tab.schema && t.table === tab.table
    )
    if (existing) {
      activeTabId = existing.id
      return existing.id
    }
  }

  const id = generateId()
  tabs.push({ ...tab, id })
  activeTabId = id
  return id
}

function closeTab(id: string): void {
  const index = tabs.findIndex((t) => t.id === id)
  if (index === -1) return

  tabs.splice(index, 1)

  // If we closed the active tab, activate an adjacent one
  if (activeTabId === id) {
    if (tabs.length === 0) {
      activeTabId = null
    } else if (index >= tabs.length) {
      activeTabId = tabs[tabs.length - 1].id
    } else {
      activeTabId = tabs[index].id
    }
  }
}

function setActiveTab(id: string): void {
  if (tabs.find((t) => t.id === id)) {
    activeTabId = id
  }
}

function updateTab(id: string, updates: Partial<Omit<Tab, 'id'>>): void {
  const tab = tabs.find((t) => t.id === id)
  if (tab) {
    Object.assign(tab, updates)
  }
}

function openDefaultTab(): void {
  if (tabs.length === 0) {
    addTab({ type: 'query', title: 'Query 1', query: '' })
  }
}

export const tabStore = {
  get tabs() {
    return tabs
  },
  get activeTabId() {
    return activeTabId
  },
  get activeTab() {
    return activeTab
  },
  addTab,
  closeTab,
  setActiveTab,
  updateTab,
  openDefaultTab
}
