import { h } from '../engine/render.ts'
import { graphicsSettings } from './settings.ts'
import { onCleanup } from '../engine/signal.ts'
import { MOBILE_QUERY, syncResponsiveView } from '../responsive.ts'

export function graphicsControls() {
  const settings = graphicsSettings(location.search, matchMedia('(prefers-reduced-motion: reduce)').matches)
  const field = (key: string, label: string, value: string, options: [string, string][]) => h('label', { class: 'poly-field' },
    h('span', label), h('select', { 'aria-label': label, onChange: (ev: Event) => {
      const url = new URL(location.href)
      url.searchParams.set(key, (ev.target as HTMLSelectElement).value)
      location.assign(url)
    } }, ...options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))))
  const viewField = field('view', 'Perspektive', settings.view, [['perspective', 'Weltkonzept'], ['tactical', 'Taktisch (Draufsicht)']])
  const viewSelect = viewField.querySelector('select')!
  const mobile = matchMedia(MOBILE_QUERY)
  const syncView = () => {
    viewSelect.value = syncResponsiveView(window, mobile.matches)
    viewSelect.disabled = mobile.matches
    viewSelect.title = mobile.matches ? 'Auf Smartphones und Tablets wird immer die taktische Draufsicht verwendet.' : 'Perspektive wählen'
  }
  syncView()
  mobile.addEventListener('change', syncView)
  onCleanup(() => mobile.removeEventListener('change', syncView))
  return h('div', { class: 'poly-settings' },
    viewField,
    field('quality', 'Grafikqualität', settings.quality, [['low', 'Sparsam'], ['balanced', 'Ausgewogen'], ['high', 'Hoch']]),
    field('light', 'Licht', settings.light, [['day', 'Tageslicht'], ['dusk', 'Abendlicht']]),
    field('motion', 'Animationen', settings.motion ? 'on' : 'off', [['on', 'Ein'], ['off', 'Reduziert']]),
  )
}
