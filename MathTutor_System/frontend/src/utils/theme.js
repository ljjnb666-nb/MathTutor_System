export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(preference) {
  if (preference === 'auto') {
    return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light'
  }
  return preference === 'light' ? 'light' : 'dark'
}

export function applyTheme(preference) {
  const resolvedTheme = resolveTheme(preference)
  document.documentElement.dataset.theme = resolvedTheme
  return resolvedTheme
}

export function subscribeToSystemThemeChanges() {
  const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY)
  const handleSystemThemeChange = () => {
    const currentTheme = localStorage.getItem('ui_theme') || 'dark'
    if (currentTheme === 'auto') {
      applyTheme(currentTheme)
    }
  }

  mediaQuery.addEventListener('change', handleSystemThemeChange)
  return () => {
    mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }
}
