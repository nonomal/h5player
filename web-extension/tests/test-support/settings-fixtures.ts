import { createDefaultSettings, type PersistedSettingsV2 } from '../../src/domain/settings'

export function createSettingsEnvelope(revision = 0): PersistedSettingsV2 {
  return {
    schema: 'h5player.web-extension',
    schemaVersion: 2,
    revision,
    updatedAt: 1_700_000_000_000,
    data: createDefaultSettings()
  }
}
