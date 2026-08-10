import { createDefaultSettings, type PersistedSettingsV1 } from '../../src/domain/settings'

export function createSettingsEnvelope(revision = 0): PersistedSettingsV1 {
  return {
    schema: 'h5player.web-extension',
    schemaVersion: 1,
    revision,
    updatedAt: 1_700_000_000_000,
    data: createDefaultSettings()
  }
}
