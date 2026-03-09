import { generateId as makeId } from '../../../shared/utils'

export interface Tab {
  id: string
  type: 'query' | 'table' | 'schema'
  title: string
  schema?: string
  table?: string
  query?: string
  filePath?: string
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
        return parsed.filter((t: Tab) => !t.preview && t.id && t.type)
      }
    }
  } catch { /* ignore */ }
  return []
}

function loadActiveTabId(validTabs: Tab[]): string | null {
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_KEY)
    if (stored && validTabs.some((t) => t.id === stored)) {
      return stored
    }
  } catch { /* ignore */ }
  return validTabs.length > 0 ? validTabs[0].id : null
}

function saveTabs(): void {
  try {
    const toSave = tabs.filter((t) => !t.preview).map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      schema: t.schema,
      table: t.table,
      // Don't persist query content for file-backed tabs (content lives on disk)
      query: t.filePath ? undefined : t.query,
      filePath: t.filePath
    }))
    localStorage.setItem(TABS_KEY, JSON.stringify(toSave))
    localStorage.setItem(ACTIVE_TAB_KEY, activeTabId ?? '')
  } catch { /* ignore */ }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function scheduleSave(): void {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveTabs, 300)
}

const restoredTabs = loadTabs()

let tabs = $state<Tab[]>(restoredTabs)
let activeTabId = $state<string | null>(loadActiveTabId(restoredTabs))
let activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? null)

function addTab(tab: Omit<Tab, 'id'>): string {
  // If opening a table or schema tab, check if one already exists
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

  // For query tabs with filePath, check if already open
  if (tab.type === 'query' && tab.filePath) {
    const existing = tabs.find((t) => t.type === 'query' && t.filePath === tab.filePath)
    if (existing) {
      activeTabId = existing.id
      scheduleSave()
      return existing.id
    }
  }

  // For table tabs, reuse an existing preview tab
  if (tab.type === 'table' && tab.preview) {
    const previewTab = tabs.find((t) => t.type === 'table' && t.preview)
    if (previewTab) {
      Object.assign(previewTab, { title: tab.title, schema: tab.schema, table: tab.table })
      activeTabId = previewTab.id
      return previewTab.id
    }
  }

  const id = makeId('tab')
  tabs.push({ ...tab, id })
  activeTabId = id
  scheduleSave()
  return id
}

function openFile(filePath: string, name: string): string {
  // Strip .sql extension for display
  const title = name.replace(/\.sql$/i, '')
  return addTab({ type: 'query', title, filePath })
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
    // Will be replaced by file-backed tab creation in App.svelte
    addTab({ type: 'query', title: 'Query 1', query: '' })
  }
}

export const tabStore = {
  get tabs() { return tabs },
  get activeTabId() { return activeTabId },
  get activeTab() { return activeTab },
  addTab,
  openFile,
  closeTab,
  setActiveTab,
  updateTab,
  pinTab,
  openDefaultTab
}
