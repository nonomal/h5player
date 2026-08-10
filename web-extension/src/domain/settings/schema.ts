import * as z from 'zod/mini'
import { isNormalizedSiteOrigin } from './site-identity'

const boundedKeySchema = z.string().check(z.minLength(1), z.maxLength(256))
const siteOriginSchema = boundedKeySchema.check(z.refine(isNormalizedSiteOrigin))
const boundedTextSchema = z.string().check(z.maxLength(512))
const revisionSchema = z.int().check(z.nonnegative())
const timestampSchema = z.number().check(z.nonnegative())
const playbackRateSchema = z.number().check(z.gte(0.1), z.lte(16))
const volumeSchema = z.number().check(z.gte(0), z.lte(1))

export const hotkeyBindingSchema = z.strictObject({
  commandId: boundedKeySchema,
  disabled: z.boolean()
})

export const globalSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  ui: z.strictObject({
    overlayEnabled: z.boolean(),
    theme: z.enum(['system', 'light', 'dark']),
    locale: z.enum(['zh-CN', 'en-US'])
  }),
  hotkeys: z.strictObject({
    enabled: z.boolean(),
    scope: z.enum(['page', 'player']),
    bindings: z
      .record(boundedKeySchema, hotkeyBindingSchema)
      .check(z.refine((value) => Object.keys(value).length <= 256))
  }),
  media: z.strictObject({
    defaultPlaybackRate: playbackRateSchema,
    defaultVolume: volumeSchema,
    restoreProgress: z.boolean()
  }),
  policies: z.strictObject({
    protectPlaybackRate: z.boolean(),
    protectCurrentTime: z.boolean(),
    protectVolume: z.boolean(),
    allowExperimental: z.boolean()
  }),
  diagnostics: z.strictObject({
    localLogLevel: z.enum(['error', 'warn', 'info', 'debug']),
    retainProgressDays: z.int().check(z.gte(0), z.lte(365))
  })
})

export const siteOverrideSchema = z.strictObject({
  enabled: z.boolean(),
  includePath: z.optional(z.string().check(z.minLength(1), z.maxLength(256))),
  ui: z.optional(
    z.strictObject({
      overlayEnabled: z.optional(z.boolean())
    })
  ),
  media: z.optional(
    z.strictObject({
      defaultPlaybackRate: z.optional(playbackRateSchema),
      defaultVolume: z.optional(volumeSchema),
      restoreProgress: z.optional(z.boolean())
    })
  ),
  policies: z.optional(
    z.strictObject({
      protectPlaybackRate: z.optional(z.boolean()),
      protectCurrentTime: z.optional(z.boolean()),
      protectVolume: z.optional(z.boolean()),
      allowExperimental: z.optional(z.boolean())
    })
  )
})

export const progressRecordSchema = z.strictObject({
  site: siteOriginSchema,
  mediaKey: boundedKeySchema,
  positionSeconds: z.number().check(z.nonnegative()),
  durationSeconds: z.nullable(z.number().check(z.nonnegative())),
  titleHint: z.optional(boundedTextSchema),
  updatedAt: timestampSchema,
  expiresAt: timestampSchema
})

export const settingsDataSchema = z.strictObject({
  global: globalSettingsSchema,
  sites: z
    .record(siteOriginSchema, siteOverrideSchema)
    .check(z.refine((value) => Object.keys(value).length <= 1_000)),
  progress: z
    .record(boundedKeySchema, progressRecordSchema)
    .check(z.refine((value) => Object.keys(value).length <= 5_000))
})

const hotkeyBindingsPatchSchema = z
  .record(boundedKeySchema, z.union([hotkeyBindingSchema, z.null()]))
  .check(z.refine((value) => Object.keys(value).length <= 256))

export const settingsPatchSchema = z.strictObject({
  global: z.optional(
    z.strictObject({
      enabled: z.optional(z.boolean()),
      ui: z.optional(
        z.strictObject({
          overlayEnabled: z.optional(z.boolean()),
          theme: z.optional(z.enum(['system', 'light', 'dark'])),
          locale: z.optional(z.enum(['zh-CN', 'en-US']))
        })
      ),
      hotkeys: z.optional(
        z.strictObject({
          enabled: z.optional(z.boolean()),
          scope: z.optional(z.enum(['page', 'player'])),
          bindings: z.optional(hotkeyBindingsPatchSchema)
        })
      ),
      media: z.optional(
        z.strictObject({
          defaultPlaybackRate: z.optional(playbackRateSchema),
          defaultVolume: z.optional(volumeSchema),
          restoreProgress: z.optional(z.boolean())
        })
      ),
      policies: z.optional(
        z.strictObject({
          protectPlaybackRate: z.optional(z.boolean()),
          protectCurrentTime: z.optional(z.boolean()),
          protectVolume: z.optional(z.boolean()),
          allowExperimental: z.optional(z.boolean())
        })
      ),
      diagnostics: z.optional(
        z.strictObject({
          localLogLevel: z.optional(z.enum(['error', 'warn', 'info', 'debug'])),
          retainProgressDays: z.optional(z.int().check(z.gte(0), z.lte(365)))
        })
      )
    })
  ),
  sites: z.optional(
    z
      .record(siteOriginSchema, z.union([siteOverrideSchema, z.null()]))
      .check(z.refine((value) => Object.keys(value).length <= 1_000))
  )
})

export const persistedSettingsV1Schema = z.strictObject({
  schema: z.literal('h5player.web-extension'),
  schemaVersion: z.literal(1),
  revision: revisionSchema,
  updatedAt: timestampSchema,
  data: settingsDataSchema
})

export const persistedSettingsV0Schema = z.strictObject({
  schema: z.literal('h5player.web-extension'),
  schemaVersion: z.literal(0),
  revision: revisionSchema,
  updatedAt: timestampSchema,
  data: z.strictObject({
    enabled: z.boolean(),
    defaultPlaybackRate: playbackRateSchema,
    defaultVolume: volumeSchema
  })
})

export const settingsBackupSchema = z.strictObject({
  backupId: boundedKeySchema,
  createdAt: timestampSchema,
  reason: z.enum(['migration', 'corrupt-recovery', 'import', 'rollback']),
  checksum: z.string().check(z.regex(/^fnv1a64:[a-f0-9]{16}$/)),
  raw: z.unknown()
})

export const settingsExportFileSchema = z.strictObject({
  format: z.literal('h5player.web-extension.settings'),
  formatVersion: z.literal(1),
  exportedAt: z.string().check(z.minLength(20), z.maxLength(64)),
  data: settingsDataSchema
})

export type GlobalSettings = z.infer<typeof globalSettingsSchema>
export type SiteOverride = z.infer<typeof siteOverrideSchema>
export type SettingsData = z.infer<typeof settingsDataSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export type PersistedSettingsV1 = z.infer<typeof persistedSettingsV1Schema>
export type PersistedSettingsV0 = z.infer<typeof persistedSettingsV0Schema>
export type SettingsBackup = z.infer<typeof settingsBackupSchema>
export type SettingsExportFile = z.infer<typeof settingsExportFileSchema>
