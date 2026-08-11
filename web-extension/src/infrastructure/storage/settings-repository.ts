import type { BrowserStoragePort, ClockPort, Teardown } from '../../application/ports/browser'
import type { LoggerPort } from '../../application/ports/logging'
import type {
  SettingsChangedEvent,
  SettingsError,
  SettingsMutation,
  SettingsRepositoryPort
} from '../../application/settings/settings-port'
import {
  createDefaultSettings,
  mergeSettings,
  normalizeSiteOrigin,
  SETTINGS_EXPORT_FORMAT_VERSION,
  SETTINGS_SCHEMA_VERSION,
  settingsBackupSchema,
  settingsImportFileSchema,
  type PersistedSettingsV2,
  type SettingsBackup,
  type SettingsData,
  type SettingsPatch
} from '../../domain/settings'
import { createRequestId } from '../../shared/ids'
import { failure, success, type Result } from '../../shared/result'
import { checksumUnknown } from './checksum'
import { classifyPersistedSettings, migrateSettingsDataV1 } from './settings-migrations'

export const SETTINGS_STORAGE_KEY = 'h5player.web-extension.settings'
export const SETTINGS_BACKUP_KEY = 'h5player.web-extension.settings.backup'
export const MAX_IMPORT_BYTES = 262_144

function settingsError(code: SettingsError['code'], message: string): SettingsError {
  return { code, message }
}

function validateIdentities(data: SettingsData): boolean {
  for (const siteId of Object.keys(data.sites)) {
    const normalized = normalizeSiteOrigin(siteId)
    if (!normalized.ok || normalized.value !== siteId) return false
  }
  return true
}

export class SettingsRepository implements SettingsRepositoryPort {
  private mutationTail: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<(event: SettingsChangedEvent) => void>()

  constructor(
    private readonly storage: BrowserStoragePort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort
  ) {}

  get(): Promise<Result<PersistedSettingsV2, SettingsError>> {
    return this.serialize(() => this.loadCurrent())
  }

  getSnapshot(): Promise<
    Result<{ settings: PersistedSettingsV2; latestBackup: SettingsBackup | null }, SettingsError>
  > {
    return this.serialize(async () => {
      const settings = await this.loadCurrent()
      if (!settings.ok) return settings
      const latestBackup = await this.readBackup()
      if (!latestBackup.ok) return latestBackup
      return success({ settings: settings.value, latestBackup: latestBackup.value })
    })
  }

  update(
    patch: SettingsPatch,
    expectedRevision: number | undefined,
    source: string
  ): Promise<Result<SettingsMutation, SettingsError>> {
    return this.serialize(async () => {
      const current = await this.loadCurrent()
      if (!current.ok) return current
      const merged = mergeSettings(current.value.data, patch)
      const rebased = expectedRevision !== undefined && expectedRevision !== current.value.revision

      if (merged.changedPaths.length === 0) {
        return success({ settings: current.value, changedPaths: [], rebased })
      }

      const next: PersistedSettingsV2 = {
        ...current.value,
        revision: current.value.revision + 1,
        updatedAt: this.clock.now(),
        data: merged.data
      }
      const stored = await this.writeValues({ [SETTINGS_STORAGE_KEY]: next })
      if (!stored.ok) return stored
      this.notify({ revision: next.revision, changedPaths: merged.changedPaths, source })
      return success({ settings: next, changedPaths: merged.changedPaths, rebased })
    })
  }

  export(): Promise<Result<string, SettingsError>> {
    return this.serialize(async () => {
      const current = await this.loadCurrent()
      if (!current.ok) return current
      return success(
        JSON.stringify(
          {
            format: 'h5player.web-extension.settings',
            formatVersion: SETTINGS_EXPORT_FORMAT_VERSION,
            exportedAt: new Date(this.clock.now()).toISOString(),
            data: current.value.data
          },
          null,
          2
        )
      )
    })
  }

  import(
    content: string,
    expectedRevision: number | undefined,
    source: string
  ): Promise<Result<SettingsMutation, SettingsError>> {
    return this.serialize(async () => {
      if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) {
        return failure(settingsError('IMPORT_INVALID', 'Import exceeds the size limit'))
      }

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(content) as unknown
      } catch {
        return failure(settingsError('IMPORT_INVALID', 'Import is not valid JSON'))
      }

      const imported = settingsImportFileSchema.safeParse(parsedJson)
      if (!imported.success) {
        return failure(settingsError('IMPORT_INVALID', 'Import does not match settings schema'))
      }
      const importedData =
        imported.data.formatVersion === SETTINGS_EXPORT_FORMAT_VERSION
          ? imported.data.data
          : migrateSettingsDataV1(imported.data.data)
      if (!validateIdentities(importedData)) {
        return failure(settingsError('IMPORT_INVALID', 'Import contains invalid site identities'))
      }

      const current = await this.loadCurrent()
      if (!current.ok) return current
      const rebased = expectedRevision !== undefined && expectedRevision !== current.value.revision
      if (JSON.stringify(importedData) === JSON.stringify(current.value.data)) {
        return success({ settings: current.value, changedPaths: [], rebased })
      }
      const next: PersistedSettingsV2 = {
        schema: 'h5player.web-extension',
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        revision: current.value.revision + 1,
        updatedAt: this.clock.now(),
        data: importedData
      }
      const backup = this.createBackup(current.value, 'import')
      const stored = await this.writeValues({
        [SETTINGS_STORAGE_KEY]: next,
        [SETTINGS_BACKUP_KEY]: backup
      })
      if (!stored.ok) return stored

      const changedPaths = ['global', 'sites', 'progress']
      this.notify({ revision: next.revision, changedPaths, source })
      return success({ settings: next, changedPaths, rebased })
    })
  }

  restoreBackup(
    backupId: string,
    source: string
  ): Promise<Result<SettingsMutation, SettingsError>> {
    return this.serialize(async () => {
      const backupResult = await this.readBackup()
      if (!backupResult.ok) return backupResult
      const backup = backupResult.value
      if (!backup || backup.backupId !== backupId) {
        return failure(settingsError('BACKUP_NOT_FOUND', 'Requested backup was not found'))
      }
      if (checksumUnknown(backup.raw) !== backup.checksum) {
        return failure(settingsError('BACKUP_CORRUPT', 'Backup checksum mismatch'))
      }

      const restored = classifyPersistedSettings(backup.raw, this.clock.now())
      if (restored.kind === 'future') {
        return failure(settingsError('FUTURE_SCHEMA', 'Backup uses a future schema version'))
      }
      if (restored.kind === 'corrupt' || restored.kind === 'missing') {
        return failure(settingsError('BACKUP_CORRUPT', 'Backup cannot be restored'))
      }

      const current = await this.loadCurrent()
      if (!current.ok) return current
      const next: PersistedSettingsV2 = {
        schema: 'h5player.web-extension',
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        revision: current.value.revision + 1,
        updatedAt: this.clock.now(),
        data: restored.value.data
      }
      const rollbackBackup = this.createBackup(current.value, 'rollback')
      const stored = await this.writeValues({
        [SETTINGS_STORAGE_KEY]: next,
        [SETTINGS_BACKUP_KEY]: rollbackBackup
      })
      if (!stored.ok) return stored

      const changedPaths = ['global', 'sites', 'progress']
      this.notify({ revision: next.revision, changedPaths, source })
      return success({ settings: next, changedPaths, rebased: false })
    })
  }

  getLatestBackup(): Promise<Result<SettingsBackup | null, SettingsError>> {
    return this.readBackup()
  }

  reset(
    scope: 'all' | 'global' | 'sites' | 'progress',
    source: string
  ): Promise<Result<SettingsMutation, SettingsError>> {
    return this.serialize(async () => {
      const current = await this.loadCurrent()
      if (!current.ok) return current
      const defaults = createDefaultSettings()
      const nextData: SettingsData = {
        global: scope === 'all' || scope === 'global' ? defaults.global : current.value.data.global,
        sites: scope === 'all' || scope === 'sites' ? {} : current.value.data.sites,
        progress: scope === 'all' || scope === 'progress' ? {} : current.value.data.progress
      }
      if (JSON.stringify(nextData) === JSON.stringify(current.value.data)) {
        return success({ settings: current.value, changedPaths: [], rebased: false })
      }

      const next: PersistedSettingsV2 = {
        schema: 'h5player.web-extension',
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        revision: current.value.revision + 1,
        updatedAt: this.clock.now(),
        data: nextData
      }
      const backup = this.createBackup(current.value, 'reset')
      const stored = await this.writeValues({
        [SETTINGS_STORAGE_KEY]: next,
        [SETTINGS_BACKUP_KEY]: backup
      })
      if (!stored.ok) return stored
      const changedPaths = scope === 'all' ? ['global', 'sites', 'progress'] : [scope]
      this.notify({ revision: next.revision, changedPaths, source })
      return success({ settings: next, changedPaths, rebased: false })
    })
  }

  subscribe(listener: (event: SettingsChangedEvent) => void): Teardown {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(work, work)
    this.mutationTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private async loadCurrent(): Promise<Result<PersistedSettingsV2, SettingsError>> {
    const rawResult = await this.readValue(SETTINGS_STORAGE_KEY)
    if (!rawResult.ok) return rawResult
    const outcome = classifyPersistedSettings(rawResult.value, this.clock.now())

    if (outcome.kind === 'current') return success(outcome.value)
    if (outcome.kind === 'future') {
      return failure(
        settingsError('FUTURE_SCHEMA', `Unsupported schema version ${outcome.schemaVersion}`)
      )
    }

    if (outcome.kind === 'missing') {
      const stored = await this.writeValues({ [SETTINGS_STORAGE_KEY]: outcome.value })
      return stored.ok ? success(outcome.value) : stored
    }

    if (outcome.kind === 'migrated') {
      const backup = this.createBackup(outcome.raw, 'migration')
      const stored = await this.writeValues({
        [SETTINGS_STORAGE_KEY]: outcome.value,
        [SETTINGS_BACKUP_KEY]: backup
      })
      if (!stored.ok) return stored
      this.logger.log({
        level: 'info',
        module: 'settings-repository',
        eventCode: 'SETTINGS_MIGRATED',
        details: { schemaVersion: SETTINGS_SCHEMA_VERSION }
      })
      return success(outcome.value)
    }

    const recovered: PersistedSettingsV2 = {
      schema: 'h5player.web-extension',
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      revision: 0,
      updatedAt: this.clock.now(),
      data: createDefaultSettings()
    }
    const backup = this.createBackup(outcome.raw, 'corrupt-recovery')
    const stored = await this.writeValues({
      [SETTINGS_STORAGE_KEY]: recovered,
      [SETTINGS_BACKUP_KEY]: backup
    })
    if (!stored.ok) return stored
    this.logger.log({
      level: 'warn',
      module: 'settings-repository',
      eventCode: 'SETTINGS_CORRUPT_RECOVERED'
    })
    return success(recovered)
  }

  private createBackup(raw: unknown, reason: SettingsBackup['reason']): SettingsBackup {
    return {
      backupId: createRequestId(),
      createdAt: this.clock.now(),
      reason,
      checksum: checksumUnknown(raw),
      raw
    }
  }

  private async readBackup(): Promise<Result<SettingsBackup | null, SettingsError>> {
    const raw = await this.readValue(SETTINGS_BACKUP_KEY)
    if (!raw.ok) return raw
    if (raw.value === undefined) return success(null)
    const parsed = settingsBackupSchema.safeParse(raw.value)
    return parsed.success
      ? success(parsed.data)
      : failure(settingsError('BACKUP_CORRUPT', 'Stored backup is invalid'))
  }

  private async readValue(key: string): Promise<Result<unknown, SettingsError>> {
    try {
      return success(await this.storage.get(key))
    } catch (error) {
      return failure(
        settingsError(
          'STORAGE_READ_FAILED',
          error instanceof Error ? error.message : 'Storage read failed'
        )
      )
    }
  }

  private async writeValues(
    values: Readonly<Record<string, unknown>>
  ): Promise<Result<void, SettingsError>> {
    try {
      await this.storage.set(values)
      return success(undefined)
    } catch (error) {
      return failure(
        settingsError(
          'STORAGE_WRITE_FAILED',
          error instanceof Error ? error.message : 'Storage write failed'
        )
      )
    }
  }

  private notify(event: SettingsChangedEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
