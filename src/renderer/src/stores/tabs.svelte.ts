export interface Tab {
  id: string
  type: 'query' | 'table' | 'schema'
  title: string
  schema?: string
  table?: string
  query?: string
  preview?: boolean
}

const TABS_KEY = 'sql-client-tabs'
const ACTIVE_TAB_KEY = 'sql-client-active-tab'

function loadTabs(): Tab[] {
  try {
    const stored = localStorage.getItem(TABS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        // Filter out preview tabs — they're transient
        return parsed.filter((t: Tab) => !t.preview && t.id && t.type)
      }
    }
  } catch {
    // ignore
  }
  return []
}

function loadActiveTabId(validTabs: Tab[]): string | null {
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_KEY)
    if (stored && validTabs.some((t) => t.id === stored)) {
      return stored
    }
  } catch {
    // ignore
  }
  return validTabs.length > 0 ? validTabs[0].id : null
}

function saveTabs(): void {
  try {
    // Only persist non-preview tabs
    const toSave = tabs.filter((t) => !t.preview).map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      schema: t.schema,
      table: t.table,
      query: t.query
    }))
    localStorage.setItem(TABS_KEY, JSON.stringify(toSave))
    localStorage.setItem(ACTIVE_TAB_KEY, activeTabId ?? '')
  } catch {
    // localStorage not available
  }
}

// Debounce saves to avoid excessive writes during rapid changes
let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveTabs, 300)
}

const restoredTabs = loadTabs()

let tabs = $state<Tab[]>(restoredTabs)
let activeTabId = $state<string | null>(loadActiveTabId(restoredTabs))
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
      scheduleSave()
      return existing.id
    }
  }

  // For table tabs, reuse an existing preview tab instead of opening a new one
  if (tab.type === 'table' && tab.preview) {
    const previewTab = tabs.find((t) => t.type === 'table' && t.preview)
    if (previewTab) {
      Object.assign(previewTab, { title: tab.title, schema: tab.schema, table: tab.table })
      activeTabId = previewTab.id
      // Don't save preview tab changes
      return previewTab.id
    }
  }

  const id = generateId()
  tabs.push({ ...tab, id })
  activeTabId = id
  scheduleSave()
  return id
}

function pinTab(id: string): void {
  const tab = tabs.find((t) => t.id === id)
  if (tab && tab.preview) {
    tab.preview = false
    scheduleSave()
  }
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
  scheduleSave()
}

function setActiveTab(id: string): void {
  if (tabs.find((t) => t.id === id)) {
    activeTabId = id
    scheduleSave()
  }
}

function updateTab(id: string, updates: Partial<Omit<Tab, 'id'>>): void {
  const tab = tabs.find((t) => t.id === id)
  if (tab) {
    Object.assign(tab, updates)
    scheduleSave()
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
  pinTab,
  openDefaultTab
}
