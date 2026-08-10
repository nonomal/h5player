import * as z from 'zod/mini'
import {
  persistedSettingsV1Schema,
  settingsPatchSchema,
  settingsBackupSchema
} from '../../domain/settings'

const revisionSchema = z.int().check(z.nonnegative())

export const emptyPayloadSchema = z.strictObject({})

export const settingsUpdatePayloadSchema = z.strictObject({
  patch: settingsPatchSchema,
  expectedRevision: z.optional(revisionSchema)
})

export const settingsImportPayloadSchema = z.strictObject({
  content: z.string().check(z.minLength(1), z.maxLength(262_144)),
  expectedRevision: z.optional(revisionSchema)
})

export const settingsRestorePayloadSchema = z.strictObject({
  backupId: z.string().check(z.minLength(1), z.maxLength(256))
})

export const protocolCancelPayloadSchema = z.strictObject({
  targetRequestId: z.string().check(z.minLength(16), z.maxLength(128))
})

export const settingsSnapshotResponseSchema = z.strictObject({
  settings: persistedSettingsV1Schema,
  latestBackup: z.nullable(settingsBackupSchema)
})

export const settingsMutationResponseSchema = z.strictObject({
  settings: persistedSettingsV1Schema,
  changedPaths: z.array(z.string().check(z.minLength(1), z.maxLength(512))),
  rebased: z.boolean()
})

export const settingsExportResponseSchema = z.strictObject({
  content: z.string().check(z.minLength(1), z.maxLength(262_144))
})

export const cancellationResponseSchema = z.strictObject({
  cancelled: z.boolean()
})

export const systemPingResponseSchema = z.strictObject({
  extensionVersion: z.string().check(z.minLength(1), z.maxLength(32)),
  phase: z.literal(2),
  protocol: z.literal(1),
  settingsSchemaVersion: z.literal(1),
  tabId: z.optional(z.int().check(z.nonnegative())),
  frameId: z.optional(z.int().check(z.nonnegative()))
})

export type SettingsUpdatePayload = z.infer<typeof settingsUpdatePayloadSchema>
export type SettingsImportPayload = z.infer<typeof settingsImportPayloadSchema>
export type SettingsRestorePayload = z.infer<typeof settingsRestorePayloadSchema>
export type ProtocolCancelPayload = z.infer<typeof protocolCancelPayloadSchema>
export type SettingsSnapshotResponse = z.infer<typeof settingsSnapshotResponseSchema>
export type SettingsMutationResponse = z.infer<typeof settingsMutationResponseSchema>
export type SystemPingResponse = z.infer<typeof systemPingResponseSchema>
