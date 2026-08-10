import { failure, success, type Result } from '../../shared/result'
import type { PersistedSettingsV1, SettingsBackup, SettingsPatch } from '../../domain/settings'
import type { SettingsError, SettingsMutation, SettingsRepositoryPort } from './settings-port'

export class SettingsService {
  constructor(private readonly repository: SettingsRepositoryPort) {}

  async getSnapshot(): Promise<
    Result<
      {
        settings: PersistedSettingsV1
        latestBackup: SettingsBackup | null
      },
      SettingsError
    >
  > {
    const snapshot = await this.repository.getSnapshot()
    return snapshot.ok ? success(snapshot.value) : failure(snapshot.error)
  }

  update(
    patch: SettingsPatch,
    expectedRevision: number | undefined,
    source: string
  ): Promise<Result<SettingsMutation, SettingsError>> {
    return this.repository.update(patch, expectedRevision, source)
  }

  export(): Promise<Result<string, SettingsError>> {
    return this.repository.export()
  }

  import(
    content: string,
    expectedRevision: number | undefined,
    source: string
  ): Promise<Result<SettingsMutation, SettingsError>> {
    return this.repository.import(content, expectedRevision, source)
  }

  restoreBackup(
    backupId: string,
    source: string
  ): Promise<Result<SettingsMutation, SettingsError>> {
    return this.repository.restoreBackup(backupId, source)
  }
}
