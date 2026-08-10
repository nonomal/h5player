import { describe, expect, it } from 'vitest'
import {
  createDefaultSettings,
  mergeSettings,
  normalizeSiteOrigin,
  resolveSettings,
  settingsDataSchema,
  settingsPatchSchema
} from '../../src/domain/settings'

describe('settings domain', () => {
  it('creates schema-valid defaults and rejects unsafe ranges or unknown fields', () => {
    expect(settingsDataSchema.safeParse(createDefaultSettings()).success).toBe(true)
    expect(
      settingsPatchSchema.safeParse({ global: { media: { defaultPlaybackRate: 100 } } }).success
    ).toBe(false)
    expect(
      settingsPatchSchema.safeParse({ global: { enabled: true, script: 'alert(1)' } }).success
    ).toBe(false)
  })

  it('merges independent fields and reports exact changed paths', () => {
    const current = createDefaultSettings()
    const result = mergeSettings(current, {
      global: {
        enabled: false,
        media: { defaultPlaybackRate: 2 },
        hotkeys: { bindings: { space: { commandId: 'media.toggle', disabled: false } } }
      },
      sites: {
        'https://example.com': { enabled: false }
      }
    })

    expect(result.data.global.enabled).toBe(false)
    expect(result.data.global.media.defaultPlaybackRate).toBe(2)
    expect(result.data.global.hotkeys.bindings['space']?.commandId).toBe('media.toggle')
    expect(result.changedPaths).toEqual([
      'global.enabled',
      'global.hotkeys.bindings.space',
      'global.media.defaultPlaybackRate',
      'sites.https://example.com'
    ])
    expect(current.global.enabled).toBe(true)
  })

  it('removes binding and site entries without changing absent entries', () => {
    const current = createDefaultSettings()
    current.global.hotkeys.bindings['space'] = { commandId: 'media.toggle', disabled: false }
    current.sites['https://example.com'] = { enabled: false }

    const result = mergeSettings(current, {
      global: { hotkeys: { bindings: { space: null, missing: null } } },
      sites: { 'https://example.com': null, 'https://missing.example': null }
    })
    expect(result.data.global.hotkeys.bindings).toEqual({})
    expect(result.data.sites).toEqual({})
    expect(result.changedPaths).toEqual([
      'global.hotkeys.bindings.space',
      'sites.https://example.com'
    ])
  })

  it('normalizes safe origins and resolves session over site over global settings', () => {
    expect(normalizeSiteOrigin('HTTPS://Example.COM:443/path?q=1')).toEqual({
      ok: true,
      value: 'https://example.com'
    })
    expect(normalizeSiteOrigin('javascript:alert(1)')).toEqual({
      ok: false,
      error: 'INVALID_SCHEME'
    })

    const settings = createDefaultSettings()
    settings.global.media.defaultPlaybackRate = 1.25
    settings.sites['https://example.com'] = {
      enabled: false,
      media: { defaultPlaybackRate: 2 }
    }
    const resolved = resolveSettings(settings, 'https://example.com/watch', {
      global: { enabled: true, media: { defaultPlaybackRate: 3 } }
    })
    expect(resolved.enabled).toBe(true)
    expect(resolved.media.defaultPlaybackRate).toBe(3)
  })
})
