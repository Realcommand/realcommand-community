// Real Command · Funksprüche
// =============================================================================
// Nur Tabellen, keine Logik. Alle Sätze sind eigene Formulierungen: deutsch,
// militärisch knapp, höchstens drei Wörter, keine Anleihe bei einem anderen Spiel.
//
// Vorgelesen wird ausschließlich, was hier steht – nie ein Objektname, eine
// Kennung oder ein Spielername. Sonst buchstabiert die Stimme „extractor_17“.

/** Klangrolle eines Objekts. Sie folgt der Gattung, nicht dem Bauplan. */
export type VoiceRole = 'infantry' | 'vehicle' | 'air' | 'sea' | 'plant'
export const VOICE_ROLES: readonly VoiceRole[] = ['infantry', 'vehicle', 'air', 'sea', 'plant']

/** Anlass einer Ansage. Quittungen folgen einer Eingabe, Meldungen kommen von selbst. */
export type VoiceEvent =
  | 'select' | 'move' | 'attack' | 'hold' | 'work'
  | 'capture' | 'load' | 'unload' | 'rally' | 'group'
  | 'deny' | 'under_fire' | 'losses' | 'losses_heavy' | 'position_lost' | 'target_down'
  | 'cargo_full' | 'ammo_empty' | 'unit_ready' | 'power_low' | 'avatar_down'

/** Anlässe, die auf eine eigene Eingabe folgen. Alles andere ist eine Meldung. */
export const ACK_EVENTS: readonly VoiceEvent[] = ['select', 'move', 'attack', 'hold', 'work', 'capture', 'load', 'unload', 'rally', 'group']

type RoleLines = Partial<Record<VoiceRole, string[]>>

/** Nach Gattung getrennt: ein Trupp meldet sich anders als eine Brücke. */
export const ROLE_LINES: Partial<Record<VoiceEvent, RoleLines>> = {
  select: {
    infantry: ['Trupp meldet sich.', 'Wir stehen bereit.', 'Auf Posten.', 'Sagen Sie an.'],
    vehicle: ['Fahrer bereit.', 'Motor läuft.', 'Wagen steht.', 'Sagen Sie an.'],
    air: ['In der Luft.', 'Kanzel bereit.', 'Warten auf Kurs.', 'Wir hören.'],
    sea: ['Brücke hört.', 'Schiff ist klar.', 'Ruder besetzt.'],
    plant: ['Anlage läuft.', 'Betrieb ist normal.', 'Bereit zur Arbeit.'],
  },
  move: {
    infantry: ['Wir gehen los.', 'Marsch.', 'Weg ist frei.'],
    vehicle: ['Wir rollen an.', 'Kurs aufgenommen.', 'Wir fahren.'],
    air: ['Kurs liegt an.', 'Wir drehen ein.'],
    sea: ['Maschine voraus.', 'Wir laufen aus.'],
  },
  attack: {
    infantry: ['Ziel erfasst.', 'Wir gehen ran.', 'Feuer frei.'],
    vehicle: ['Rohr frei.', 'Ziel erfasst.'],
    air: ['Anflug auf Ziel.', 'Wir greifen an.'],
    sea: ['Geschütze klar.'],
    plant: ['Ziel erfasst.'],
  },
  hold: {
    infantry: ['Wir bleiben.', 'Stellung wird gehalten.', 'Verstanden, halten.'],
    vehicle: ['Wir bleiben.', 'Stellung wird gehalten.', 'Verstanden, halten.'],
    air: ['Wir bleiben.', 'Stellung wird gehalten.'],
    sea: ['Wir bleiben.', 'Stellung wird gehalten.'],
  },
  work: {
    infantry: ['Wir packen an.', 'Machen wir.', 'Wird erledigt.'],
    vehicle: ['Fördern läuft an.', 'Wir laden.'],
  },
}

/** Anlässe mit einer Stimme für alle: die Lage ist wichtiger als die Gattung. */
export const PLAIN_LINES: Partial<Record<VoiceEvent, string[]>> = {
  capture: ['Wir gehen rein.', 'Übernahme läuft an.'],
  load: ['Aufsitzen.'],
  unload: ['Absitzen.'],
  rally: ['Sammelpunkt steht.'],
  group: ['Verband hört.'],
  deny: ['Geht nicht.', 'Nicht von hier.', 'Fehlt uns.'],
  under_fire: ['Feindkontakt.', 'Sie beschießen uns.', 'Wir nehmen Feuer.'],
  losses: ['Wir haben Verluste.'],
  losses_heavy: ['Schwere Verluste.'],
  position_lost: ['Stellung verloren.'],
  target_down: ['Ziel erledigt.'],
  cargo_full: ['Laderaum ist voll.'],
  ammo_empty: ['Munition ist leer.'],
  unit_ready: ['Einheit steht bereit.', 'Abholbereit.'],
  power_low: ['Strom reicht nicht.'],
  avatar_down: ['Kommandant ist gefallen.'],
}

/** Fraktionsfarbe: eigene Wendungen statt eigener Stimmen. */
export const FACTION_LINES: Record<string, string[]> = {
  aurora: ['Auf Kurs.', 'Bestätigt.', 'Zeitplan hält.'],
  meridian: ['Wird gemacht.', 'Wir halten das.', 'Kein Zurück.'],
  kestrel: ['Notiert.', 'Wir sehen es.', 'Auf Sicht.'],
}

/** Stimmfarbe je Fraktion: heller und schneller, tiefer und schwerer, trocken. */
export const FACTION_VOICE: Record<string, { pitch: number, rate: number }> = {
  aurora: { pitch: 1.15, rate: 1.4 },
  meridian: { pitch: 0.8, rate: 1.2 },
  kestrel: { pitch: 1, rate: 1.3 },
}

/** Stimmfarbe je Gattung, falls das Gerät nur eine deutsche Stimme kennt. */
export const ROLE_VOICE: Record<VoiceRole, { pitch: number, rate: number }> = {
  infantry: { pitch: 1.05, rate: 1.35 },
  vehicle: { pitch: 0.85, rate: 1.25 },
  air: { pitch: 1.15, rate: 1.4 },
  sea: { pitch: 0.75, rate: 1.15 },
  plant: { pitch: 0.95, rate: 1.2 },
}

/**
 * Ohne deutsche Stimme spricht das Funkgerät in Kürzeln: dieselbe Bedeutung,
 * dieselbe Dosierung, nur ohne Worte. Diese Zuordnung ist der Ausweichweg.
 */
export const EVENT_CODE: Record<VoiceEvent, string> = {
  select: 'code.report', move: 'code.move', attack: 'code.attack', hold: 'code.report', work: 'code.work',
  capture: 'code.work', load: 'code.work', unload: 'code.work', rally: 'code.move', group: 'code.report',
  deny: 'code.deny', under_fire: 'code.alert', losses: 'code.alert', losses_heavy: 'code.alert',
  position_lost: 'code.alert', target_down: 'code.report', cargo_full: 'code.report', ammo_empty: 'code.alert',
  unit_ready: 'code.report', power_low: 'code.alert', avatar_down: 'code.alert',
}

/** Alle Zeilen, die jemals vorgelesen werden – Grundlage der Prüfung. */
export function allLines(): string[] {
  const lines: string[] = []
  for (const roles of Object.values(ROLE_LINES)) for (const list of Object.values(roles)) lines.push(...list)
  for (const list of Object.values(PLAIN_LINES)) lines.push(...list)
  for (const list of Object.values(FACTION_LINES)) lines.push(...list)
  return lines
}
