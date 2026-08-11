import { describe, expect, it } from 'vitest'
import {
  HotkeyInterpreter,
  displayHotkeyChord,
  findHotkeyConflict,
  hotkeyChordSchema,
  keyboardEventToChord,
  resolveHotkeyBindings,
  validateHotkeyChord
} from '../../src/domain/hotkey'

const baseEvent = {
  code: 'Space',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  repeat: false,
  isComposing: false
} as const

const baseContext = {
  enabled: true,
  scope: 'page' as const,
  bindings: {},
  editableTarget: false,
  playerFocused: false
}

describe('hotkey domain', () => {
  it('canonicalizes supported chords and rejects modifier-only, unsupported, and browser-reserved input', () => {
    expect(validateHotkeyChord('shift+ctrl+x')).toEqual({
      ok: true,
      chord: 'Ctrl+Shift+KeyX'
    })
    expect(validateHotkeyChord('left')).toEqual({ ok: true, chord: 'ArrowLeft' })
    expect(validateHotkeyChord('Ctrl')).toEqual({ ok: false, code: 'MODIFIER_ONLY' })
    expect(validateHotkeyChord('F12')).toEqual({ ok: false, code: 'UNSUPPORTED_KEY' })
    expect(validateHotkeyChord('Ctrl+L')).toEqual({
      ok: false,
      code: 'RESERVED_BROWSER_SHORTCUT'
    })
    expect(hotkeyChordSchema.safeParse('Ctrl+KeyL').success).toBe(false)
  })

  it('uses physical KeyboardEvent.code and renders platform-appropriate labels', () => {
    expect(
      keyboardEventToChord({
        code: 'KeyC',
        ctrlKey: false,
        altKey: true,
        shiftKey: true,
        metaKey: false
      })
    ).toEqual({ ok: true, chord: 'Alt+Shift+KeyC' })
    expect(displayHotkeyChord('Ctrl+ArrowLeft', 'other')).toBe('Ctrl+←')
    expect(displayHotkeyChord('Shift+Meta+KeyC', 'mac')).toBe('⇧⌘C')
  })

  it('resolves frozen defaults, explicit overrides, disabled mappings, and conflicts deterministically', () => {
    const bindings = resolveHotkeyBindings({
      Space: { commandId: 'media.toggle-play', disabled: true },
      KeyP: { commandId: 'media.toggle-play', disabled: false }
    })
    expect(bindings.find((binding) => binding.chord === 'Space')).toMatchObject({
      disabled: true,
      customized: true
    })
    expect(bindings.find((binding) => binding.chord === 'KeyP')).toMatchObject({
      commandId: 'media.toggle-play',
      disabled: false,
      customized: true
    })
    expect(findHotkeyConflict(bindings, 'ArrowLeft', 'media.seek-forward-5')).toMatchObject({
      commandId: 'media.seek-backward-5'
    })
    expect(findHotkeyConflict(bindings, 'KeyP', 'media.toggle-play')).toBeNull()
  })

  it('applies editable, focus, composition, disabled, and repeat policies before matching', () => {
    const interpreter = new HotkeyInterpreter()
    expect(interpreter.decide(baseEvent, { ...baseContext, editableTarget: true })).toMatchObject({
      reason: 'EDITABLE_TARGET'
    })
    expect(interpreter.decide({ ...baseEvent, isComposing: true }, baseContext)).toMatchObject({
      reason: 'COMPOSING'
    })
    expect(interpreter.decide(baseEvent, { ...baseContext, scope: 'player' })).toMatchObject({
      reason: 'PLAYER_NOT_FOCUSED'
    })
    expect(
      interpreter.decide({ ...baseEvent, repeat: true }, { ...baseContext, playerFocused: true })
    ).toMatchObject({ reason: 'REPEAT_BLOCKED' })
    expect(
      interpreter.decide(
        { ...baseEvent, code: 'ArrowRight', repeat: true },
        { ...baseContext, playerFocused: true }
      )
    ).toMatchObject({ matched: true, binding: { commandId: 'media.seek-forward-5' } })
    expect(
      interpreter.decide(baseEvent, {
        ...baseContext,
        bindings: { Space: { commandId: 'media.toggle-play', disabled: true } }
      })
    ).toMatchObject({ reason: 'BINDING_DISABLED' })
  })
})
