// Regler für Ton und Musik in der Einstellungsklappe der Kopfzeile.
// Wie die Grafikregler kennt dieser Baustein keinen Dienst: er bekommt Werte und
// meldet Änderungen zurück, damit der DOM-Aufbau im Gerüst bleibt.

import { h } from '../engine/render.ts'
import { type Accessor } from '../engine/signal.ts'
import { Field, Segmented, Slider, Switch } from '../engine/widgets.ts'

export type VolumeKey = 'master' | 'world' | 'ambient' | 'ui' | 'music' | 'radio' | 'machines'
export type VoiceMode = 'speech' | 'codes' | 'off'
/** Lautstärken in Prozent, wie sie die Regler zeigen. */
export type Volumes = Record<VolumeKey, number>

/** Effekte und Musik stehen getrennt: das eine will man oft ohne das andere. */
const EFFECTS: [VolumeKey, string, string][] = [
  ['world', 'Gefecht', 'Schüsse, Treffer, Einstürze und Bauarbeiten'],
  ['machines', 'Maschinen', 'Motoren, Turbinen und das Summen der Anlagen'],
  ['ambient', 'Umgebung', 'Wind, Brandung und Laub'],
  ['ui', 'Bedienung', 'Meldungen, Auswahl und Knöpfe'],
]

export interface AudioControlProps {
  on: Accessor<boolean>
  music: Accessor<boolean>
  voice: Accessor<VoiceMode>
  volumes: Accessor<Volumes>
  onToggle(): void
  onToggleMusic(): void
  onVoice(mode: VoiceMode): void
  onVolume(which: VolumeKey, value: number): void
}

export function audioControls(p: AudioControlProps) {
  // Beschriftung über dem Regler: die Klappe ist schmal, nebeneinander bricht
  // schon der erste Hinweis in drei Zeilen um.
  const volume = (key: VolumeKey, label: string, hint: string, enabled: Accessor<boolean>) =>
    Field({ label, hint }, Slider({
      value: () => p.volumes()[key],
      onInput: (value) => p.onVolume(key, value),
      min: 0, max: 100, step: 5,
      disabled: () => !enabled(),
      format: (v) => v + ' %',
    }))
  const both = () => p.on() && p.music()
  return h('div', { class: 'poly-settings hud-audio' },
    h('label', { class: 'poly-field' }, Switch({ checked: p.on, onChange: () => p.onToggle(), label: 'Ton' })),
    volume('master', 'Gesamt', 'Lautstärke aller Klänge', p.on),
    h('b', { class: 'hud-audio-group' }, 'Effekte'),
    ...EFFECTS.map(([key, label, hint]) => volume(key, label, hint, p.on)),
    h('b', { class: 'hud-audio-group' }, 'Funk'),
    Field({ label: 'Meldungen', hint: 'Einheiten melden sich beim Antippen und quittieren Befehle' },
      Segmented({
        value: p.voice,
        onChange: p.onVoice,
        options: [
          { value: 'speech' as VoiceMode, label: 'Sprache' },
          { value: 'codes' as VoiceMode, label: 'Kürzel' },
          { value: 'off' as VoiceMode, label: 'Aus' },
        ],
      })),
    volume('radio', 'Lautstärke', 'Funkstimmen, Quittungen und Meldungen', () => p.on() && p.voice() !== 'off'),
    h('b', { class: 'hud-audio-group' }, 'Musik'),
    h('label', { class: 'poly-field' }, Switch({ checked: p.music, onChange: () => p.onToggleMusic(), label: 'Titelmusik', disabled: () => !p.on() })),
    volume('music', 'Lautstärke', '„Kestrel Run“ – eigene Titelmusik im Stil der Achtziger', both),
  )
}
