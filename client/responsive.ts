/** Dieselbe Grenze wie die mobile Kartenoberfläche in hud.css. */
export const MOBILE_QUERY = '(max-width: 1024px)'

export function responsiveView(search: string, mobile: boolean): 'tactical' | 'perspective' {
  return mobile || new URLSearchParams(search).get('view') === 'tactical' ? 'tactical' : 'perspective'
}

export function syncResponsiveView(
  browser: Pick<Window, 'location' | 'history'>, mobile: boolean,
): 'tactical' | 'perspective' {
  const url = new URL(browser.location.href)
  const view = responsiveView(url.search, mobile)
  if (mobile && url.searchParams.get('view') !== view) {
    url.searchParams.set('view', view)
    browser.history.replaceState(browser.history.state, '', url)
  }
  return view
}
