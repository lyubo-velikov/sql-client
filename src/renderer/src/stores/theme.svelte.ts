type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('sql-client-theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage not available
  }
  return 'dark'
}

let theme = $state<Theme>(getInitialTheme())

function applyTheme(t: Theme): void {
  const html = document.documentElement
  if (t === 'light') {
    html.classList.add('light')
    html.classList.remove('dark')
  } else {
    html.classList.add('dark')
    html.classList.remove('light')
  }
}

// Apply theme on init
applyTheme(getInitialTheme())

function toggleTheme(): void {
  theme = theme === 'dark' ? 'light' : 'dark'
  applyTheme(theme)
  try {
    localStorage.setItem('sql-client-theme', theme)
  } catch {
    // localStorage not available
  }
}

function setTheme(t: Theme): void {
  theme = t
  applyTheme(theme)
  try {
    localStorage.setItem('sql-client-theme', theme)
  } catch {
    // localStorage not available
  }
}

export const themeStore = {
  get theme() {
    return theme
  },
  toggleTheme,
  setTheme
}
