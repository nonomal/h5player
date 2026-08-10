import { describe, expect, it } from 'vitest'
import { classifyPersistedSettings } from '../../src/infrastructure/storage/settings-migrations'

describe('settings migrations', () => {
  it('creates defaults for an empty store', () => {
    const result = classifyPersistedSettings(undefined, 100)
    expect(result.kind).toBe('missing')
    if (result.kind === 'missing') expect(result.value.updatedAt).toBe(100)
  })

  it('migrates N-1 settings without guessing unknown fields', () => {
    const result = classifyPersistedSettings(
      {
        schema: 'h5player.web-extension',
        schemaVersion: 0,
        revision: 4,
        updatedAt: 50,
        data: { enabled: false, defaultPlaybackRate: 2, defaultVolume: 0.5 }
      },
      100
    )
    expect(result.kind).toBe('migrated')
    if (result.kind === 'migrated') {
      expect(result.value.revision).toBe(5)
      expect(result.value.data.global.enabled).toBe(false)
      expect(result.value.data.global.media).toMatchObject({
        defaultPlaybackRate: 2,
        defaultVolume: 0.5
      })
    }
  })

  it('separates corrupt and future data so future versions are never overwritten', () => {
    expect(classifyPersistedSettings({ schemaVersion: 1, data: 'broken' }, 100).kind).toBe(
      'corrupt'
    )
    expect(classifyPersistedSettings({ schemaVersion: 2, data: {} }, 100)).toEqual({
      kind: 'future',
      schemaVersion: 2
    })
  })
})
