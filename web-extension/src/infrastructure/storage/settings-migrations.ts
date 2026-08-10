import {
  createDefaultSettings,
  persistedSettingsV0Schema,
  persistedSettingsV1Schema,
  type PersistedSettingsV1
} from '../../domain/settings'

export type SettingsMigrationOutcome =
  | { kind: 'missing'; value: PersistedSettingsV1 }
  | { kind: 'current'; value: PersistedSettingsV1 }
  | { kind: 'migrated'; value: PersistedSettingsV1; raw: unknown }
  | { kind: 'future'; schemaVersion: number }
  | { kind: 'corrupt'; raw: unknown }

function readSchemaVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const version = (value as Record<string, unknown>)['schemaVersion']
  return typeof version === 'number' && Number.isInteger(version) ? version : null
}

export function classifyPersistedSettings(raw: unknown, now: number): SettingsMigrationOutcome {
  if (raw === undefined) {
    return {
      kind: 'missing',
      value: {
        schema: 'h5player.web-extension',
        schemaVersion: 1,
        revision: 0,
        updatedAt: now,
        data: createDefaultSettings()
      }
    }
  }

  const current = persistedSettingsV1Schema.safeParse(raw)
  if (current.success) return { kind: 'current', value: current.data }

  const schemaVersion = readSchemaVersion(raw)
  if (schemaVersion !== null && schemaVersion > 1) {
    return { kind: 'future', schemaVersion }
  }

  const previous = persistedSettingsV0Schema.safeParse(raw)
  if (!previous.success) return { kind: 'corrupt', raw }

  const defaults = createDefaultSettings()
  defaults.global.enabled = previous.data.data.enabled
  defaults.global.media.defaultPlaybackRate = previous.data.data.defaultPlaybackRate
  defaults.global.media.defaultVolume = previous.data.data.defaultVolume

  return {
    kind: 'migrated',
    raw,
    value: {
      schema: 'h5player.web-extension',
      schemaVersion: 1,
      revision: previous.data.revision + 1,
      updatedAt: now,
      data: defaults
    }
  }
}
