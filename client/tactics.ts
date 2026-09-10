export const COMMAND_MODES = ['normal', 'move', 'attackmove', 'rally'] as const
export type CommandMode = typeof COMMAND_MODES[number]
export interface TacticalRoute { command: CommandMode, queued: boolean, repeat: boolean }

/** Restores input tools only. Opening a link never sends a unit order. */
export function tacticalNavigation(
  browser: Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>,
  changed: (route: TacticalRoute) => void,
) {
  const read = (): TacticalRoute => {
    const params = new URL(browser.location.href).searchParams
    return { command: COMMAND_MODES.find(mode => mode === params.get('command')) ?? 'normal', queued: params.get('queue') === 'on', repeat: params.get('repeat') === 'on' }
  }
  const restore = () => changed(read())
  browser.addEventListener('popstate', restore)
  return {
    current: read,
    set(change: Partial<TacticalRoute>) {
      const route = { ...read(), ...change }
      const url = new URL(browser.location.href)
      if (route.command === 'normal') url.searchParams.delete('command')
      else url.searchParams.set('command', route.command)
      if (route.queued) url.searchParams.set('queue', 'on')
      else url.searchParams.delete('queue')
      if (route.repeat) url.searchParams.set('repeat', 'on')
      else url.searchParams.delete('repeat')
      if (url.href !== browser.location.href) browser.history.replaceState(browser.history.state, '', url)
      restore()
    },
    dispose: () => browser.removeEventListener('popstate', restore),
  }
}
