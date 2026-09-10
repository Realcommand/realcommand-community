export type HeaderPanel = 'closed' | 'menu' | 'graphics'

/** Header-Zustand bleibt teilbar, ohne Karten- oder Dialogparameter zu ersetzen. */
export function headerNavigation(
  browser: Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>,
  changed: (panel: HeaderPanel) => void,
) {
  return urlPanelNavigation(browser, 'header', ['closed', 'menu', 'graphics'], 'closed', changed)
}

export function urlPanelNavigation<T extends string>(
  browser: Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>,
  key: string, values: readonly T[], initial: T, changed: (panel: T) => void,
) {
  const read = (): T => {
    const value = new URL(browser.location.href).searchParams.get(key) as T
    return values.includes(value) ? value : initial
  }
  const restore = () => changed(read())
  browser.addEventListener('popstate', restore)
  return {
    current: read,
    set(panel: T) {
      const url = new URL(browser.location.href)
      if (panel === initial) url.searchParams.delete(key)
      else url.searchParams.set(key, panel)
      if (url.href !== browser.location.href) browser.history.replaceState(browser.history.state, '', url)
      changed(panel)
    },
    dispose: () => browser.removeEventListener('popstate', restore),
  }
}
