import * as z from 'zod/mini'

const requestIdSchema = z.string().check(z.minLength(1), z.maxLength(128))
const sessionIdSchema = z.string().check(z.minLength(16), z.maxLength(128))
const versionSchema = z.string().check(z.minLength(1), z.maxLength(32))

export const phase0PingSchema = z.strictObject({
  type: z.literal('phase0.ping'),
  requestId: requestIdSchema
})

export const phase0ContentReadySchema = z.strictObject({
  type: z.literal('phase0.content-ready'),
  sessionId: sessionIdSchema
})

export const phase0MessageSchema = z.union([phase0PingSchema, phase0ContentReadySchema])

export type Phase0Message = z.infer<typeof phase0MessageSchema>

export type Phase0Pong = {
  type: 'phase0.pong'
  requestId: string
  extensionVersion: string
}

export const phase0PongSchema = z.strictObject({
  type: z.literal('phase0.pong'),
  requestId: requestIdSchema,
  extensionVersion: versionSchema
})

export function parsePhase0Message(value: unknown): Phase0Message | null {
  const result = phase0MessageSchema.safeParse(value)
  return result.success ? result.data : null
}
