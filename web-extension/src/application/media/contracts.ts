import * as z from 'zod/mini'
import { commandResultSchema, mediaCommandSchema } from '../../domain/command'
import { mediaIdSchema, mediaSnapshotSchema } from '../../domain/media'

const frameIdSchema = z.int().check(z.nonnegative())
const revisionSchema = z.int().check(z.nonnegative())
const timestampSchema = z.number().check(z.nonnegative())

export const mediaPageStateSchema = z
  .strictObject({
    frameId: frameIdSchema,
    revision: revisionSchema,
    activeMediaId: z.nullable(mediaIdSchema),
    media: z.array(mediaSnapshotSchema).check(z.maxLength(128)),
    observedAt: timestampSchema
  })
  .check(
    z.refine((state) => {
      if (state.activeMediaId === null) return state.media.length === 0
      return state.media.some((snapshot) => snapshot.id === state.activeMediaId)
    })
  )

export const mediaGetStatePayloadSchema = z.strictObject({})

export const mediaExecutePayloadSchema = z.strictObject({
  command: mediaCommandSchema
})

export const mediaCommandResultResponseSchema = z.strictObject({
  result: commandResultSchema,
  state: mediaPageStateSchema
})

export type MediaPageState = z.infer<typeof mediaPageStateSchema>
export type MediaExecutePayload = z.infer<typeof mediaExecutePayloadSchema>
export type MediaCommandResultResponse = z.infer<typeof mediaCommandResultResponseSchema>
