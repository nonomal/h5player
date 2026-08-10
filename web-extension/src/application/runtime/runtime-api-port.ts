import type { SettingsPatch } from '../../domain/settings'
import type {
  SettingsMutationResponse,
  SettingsSnapshotResponse,
  SystemPingResponse
} from '../settings/contracts'

export interface RuntimeApiPort {
  ping(options?: { signal?: AbortSignal }): Promise<SystemPingResponse>
  getSettings(options?: { signal?: AbortSignal }): Promise<SettingsSnapshotResponse>
  updateSettings(
    patch: SettingsPatch,
    expectedRevision?: number,
    options?: { signal?: AbortSignal }
  ): Promise<SettingsMutationResponse>
  exportSettings(options?: { signal?: AbortSignal }): Promise<string>
  importSettings(
    content: string,
    expectedRevision?: number,
    options?: { signal?: AbortSignal }
  ): Promise<SettingsMutationResponse>
  restoreBackup(
    backupId: string,
    options?: { signal?: AbortSignal }
  ): Promise<SettingsMutationResponse>
}
