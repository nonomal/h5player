import * as z from 'zod/mini'
import { adapterRuntimeDiagnosticsSchema } from '../adapter'

export const siteContextResponseSchema = z.strictObject({
  tab: z.nullable(
    z.strictObject({
      id: z.int().check(z.nonnegative()),
      origin: z.optional(z.string().check(z.minLength(1), z.maxLength(256))),
      hostname: z.optional(z.string().check(z.minLength(1), z.maxLength(256))),
      protocol: z.optional(z.string().check(z.minLength(1), z.maxLength(32)))
    })
  ),
  permission: z.enum(['granted', 'missing', 'restricted', 'unknown']),
  enabled: z.boolean(),
  temporaryDisabled: z.boolean(),
  mediaCount: z.int().check(z.nonnegative()),
  activeMedia: z.boolean(),
  adapters: z.optional(adapterRuntimeDiagnosticsSchema),
  runtime: z.enum(['ready', 'disabled', 'unavailable', 'unknown']),
  reason: z.enum([
    'none',
    'no-active-tab',
    'restricted-page',
    'permission-required',
    'extension-disabled',
    'site-disabled',
    'temporarily-disabled',
    'no-media',
    'initialization-failed'
  ])
})

export const siteReconcilePayloadSchema = z.strictObject({
  bootstrapCurrentTab: z.boolean()
})

export const siteReconcileResponseSchema = z.strictObject({
  registeredOrigins: z.int().check(z.nonnegative()),
  bootstrapped: z.boolean()
})

export const siteTemporaryDisablePayloadSchema = z.strictObject({
  disabled: z.boolean()
})

export const siteTemporaryDisableResponseSchema = z.strictObject({
  disabled: z.boolean()
})

export const siteRuntimeStateResponseSchema = z.strictObject({
  ready: z.boolean(),
  temporaryDisabled: z.boolean(),
  mediaCount: z.int().check(z.nonnegative()),
  activeMedia: z.boolean(),
  adapters: z.optional(adapterRuntimeDiagnosticsSchema)
})

export type SiteContextResponse = z.infer<typeof siteContextResponseSchema>
export type SiteReconcilePayload = z.infer<typeof siteReconcilePayloadSchema>
export type SiteReconcileResponse = z.infer<typeof siteReconcileResponseSchema>
export type SiteTemporaryDisablePayload = z.infer<typeof siteTemporaryDisablePayloadSchema>
export type SiteTemporaryDisableResponse = z.infer<typeof siteTemporaryDisableResponseSchema>
export type SiteRuntimeStateResponse = z.infer<typeof siteRuntimeStateResponseSchema>
