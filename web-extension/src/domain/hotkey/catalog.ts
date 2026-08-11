import type { MediaCommand } from '../command'
import type { MediaSnapshot } from '../media'
import type { HotkeyBindingMap, HotkeyChord, HotkeyCommandId } from './model'
import { hotkeyChordSchema, hotkeyCommandIdSchema } from './model'

export type HotkeyCommandDefinition = Readonly<{
  id: HotkeyCommandId
  labelKey: string
  category: 'playback' | 'seek' | 'rate' | 'volume'
  repeatable: boolean
  createCommand(snapshot: MediaSnapshot): MediaCommand
}>

function definition(
  value: Omit<HotkeyCommandDefinition, 'createCommand'> & {
    createCommand(snapshot: MediaSnapshot): MediaCommand
  }
): HotkeyCommandDefinition {
  return Object.freeze(value)
}

export const HOTKEY_COMMAND_CATALOG: readonly HotkeyCommandDefinition[] = Object.freeze([
  definition({
    id: 'media.toggle-play',
    labelKey: 'hotkey.command.togglePlay',
    category: 'playback',
    repeatable: false,
    createCommand: (snapshot) => ({
      type: snapshot.state === 'active' ? 'media.pause' : 'media.play',
      mediaId: snapshot.id
    })
  }),
  definition({
    id: 'media.seek-backward-5',
    labelKey: 'hotkey.command.seekBackward5',
    category: 'seek',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.seek',
      mediaId: snapshot.id,
      deltaSeconds: -5
    })
  }),
  definition({
    id: 'media.seek-forward-5',
    labelKey: 'hotkey.command.seekForward5',
    category: 'seek',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.seek',
      mediaId: snapshot.id,
      deltaSeconds: 5
    })
  }),
  definition({
    id: 'media.seek-backward-30',
    labelKey: 'hotkey.command.seekBackward30',
    category: 'seek',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.seek',
      mediaId: snapshot.id,
      deltaSeconds: -30
    })
  }),
  definition({
    id: 'media.seek-forward-30',
    labelKey: 'hotkey.command.seekForward30',
    category: 'seek',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.seek',
      mediaId: snapshot.id,
      deltaSeconds: 30
    })
  }),
  definition({
    id: 'media.volume-down',
    labelKey: 'hotkey.command.volumeDown',
    category: 'volume',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.adjust-volume',
      mediaId: snapshot.id,
      delta: -0.05
    })
  }),
  definition({
    id: 'media.volume-up',
    labelKey: 'hotkey.command.volumeUp',
    category: 'volume',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.adjust-volume',
      mediaId: snapshot.id,
      delta: 0.05
    })
  }),
  definition({
    id: 'media.rate-down',
    labelKey: 'hotkey.command.rateDown',
    category: 'rate',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.adjust-rate',
      mediaId: snapshot.id,
      delta: -0.1
    })
  }),
  definition({
    id: 'media.rate-up',
    labelKey: 'hotkey.command.rateUp',
    category: 'rate',
    repeatable: true,
    createCommand: (snapshot) => ({
      type: 'media.adjust-rate',
      mediaId: snapshot.id,
      delta: 0.1
    })
  }),
  ...([1, 2, 3, 4] as const).map((value) =>
    definition({
      id: `media.rate-${value}`,
      labelKey: `hotkey.command.rate${value}`,
      category: 'rate',
      repeatable: false,
      createCommand: (snapshot) => ({
        type: 'media.set-rate',
        mediaId: snapshot.id,
        value
      })
    })
  ),
  definition({
    id: 'media.rate-reset',
    labelKey: 'hotkey.command.rateReset',
    category: 'rate',
    repeatable: false,
    createCommand: (snapshot) => ({
      type: 'media.set-rate',
      mediaId: snapshot.id,
      value: 1
    })
  }),
  definition({
    id: 'media.toggle-mute',
    labelKey: 'hotkey.command.toggleMute',
    category: 'volume',
    repeatable: false,
    createCommand: (snapshot) => ({ type: 'media.toggle-mute', mediaId: snapshot.id })
  })
])

const catalogById = new Map(HOTKEY_COMMAND_CATALOG.map((item) => [item.id, item]))

export const DEFAULT_HOTKEY_BINDINGS: Readonly<Record<HotkeyChord, HotkeyCommandId>> =
  Object.freeze({
    Space: 'media.toggle-play',
    ArrowLeft: 'media.seek-backward-5',
    ArrowRight: 'media.seek-forward-5',
    'Ctrl+ArrowLeft': 'media.seek-backward-30',
    'Ctrl+ArrowRight': 'media.seek-forward-30',
    ArrowDown: 'media.volume-down',
    ArrowUp: 'media.volume-up',
    KeyX: 'media.rate-down',
    KeyC: 'media.rate-up',
    KeyZ: 'media.rate-reset',
    Digit1: 'media.rate-1',
    Digit2: 'media.rate-2',
    Digit3: 'media.rate-3',
    Digit4: 'media.rate-4'
  })

export type ResolvedHotkeyBinding = Readonly<{
  chord: HotkeyChord
  commandId: HotkeyCommandId
  disabled: boolean
  customized: boolean
}>

export function getHotkeyCommandDefinition(commandId: HotkeyCommandId): HotkeyCommandDefinition {
  const item = catalogById.get(commandId)
  if (!item) throw new TypeError(`Unknown hotkey command: ${commandId}`)
  return item
}

export function resolveHotkeyBindings(
  overrides: HotkeyBindingMap
): readonly ResolvedHotkeyBinding[] {
  const resolved = new Map<HotkeyChord, ResolvedHotkeyBinding>()
  for (const [chord, commandId] of Object.entries(DEFAULT_HOTKEY_BINDINGS)) {
    const parsedChord = hotkeyChordSchema.safeParse(chord)
    if (!parsedChord.success) continue
    resolved.set(parsedChord.data, {
      chord: parsedChord.data,
      commandId,
      disabled: false,
      customized: false
    })
  }

  for (const [chord, binding] of Object.entries(overrides)) {
    const parsedChord = hotkeyChordSchema.safeParse(chord)
    const parsedCommand = hotkeyCommandIdSchema.safeParse(binding.commandId)
    if (!parsedChord.success || !parsedCommand.success) continue
    resolved.set(parsedChord.data, {
      chord: parsedChord.data,
      commandId: parsedCommand.data,
      disabled: binding.disabled,
      customized: true
    })
  }

  return Object.freeze(
    [...resolved.values()].sort((left, right) => left.chord.localeCompare(right.chord))
  )
}

export function findHotkeyConflict(
  bindings: readonly ResolvedHotkeyBinding[],
  chord: HotkeyChord,
  commandId: HotkeyCommandId
): ResolvedHotkeyBinding | null {
  return (
    bindings.find(
      (binding) => !binding.disabled && binding.chord === chord && binding.commandId !== commandId
    ) ?? null
  )
}
