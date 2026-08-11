import * as z from 'zod/mini'
import {
  mediaCommandResultResponseSchema,
  mediaPageStateSchema,
  mediaPageStateSummarySchema
} from '../../application/media'
import { mediaCommandSchema } from '../../domain/command'
import { createRequestId } from '../../shared/ids'
import { PROTOCOL_VERSION } from '../../shared/protocol'

const requestIdSchema = z.string().check(z.minLength(16), z.maxLength(128))
const sessionIdSchema = z.string().check(z.minLength(16), z.maxLength(128))
const nonceSchema = z.string().check(z.regex(/^[a-f0-9]{64}$/))
const frameIdSchema = z.int().check(z.nonnegative())

const baseShape = {
  protocol: z.literal(PROTOCOL_VERSION),
  requestId: requestIdSchema,
  sessionId: sessionIdSchema,
  nonce: nonceSchema
}

export const pageMediaMessageSchema = z.union([
  z.strictObject({
    ...baseShape,
    type: z.literal('media.context'),
    source: z.literal('content'),
    payload: z.strictObject({ frameId: frameIdSchema })
  }),
  z.strictObject({
    ...baseShape,
    type: z.literal('media.context-ready'),
    source: z.literal('page-main'),
    payload: z.strictObject({})
  }),
  z.strictObject({
    ...baseShape,
    type: z.literal('media.get-state'),
    source: z.literal('content'),
    payload: z.strictObject({})
  }),
  z.strictObject({
    ...baseShape,
    type: z.literal('media.state'),
    source: z.literal('page-main'),
    payload: z.strictObject({ state: mediaPageStateSchema })
  }),
  z.strictObject({
    ...baseShape,
    type: z.literal('media.state-changed'),
    source: z.literal('page-main'),
    payload: z.strictObject({ summary: mediaPageStateSummarySchema })
  }),
  z.strictObject({
    ...baseShape,
    type: z.literal('media.execute'),
    source: z.literal('content'),
    payload: z.strictObject({ command: mediaCommandSchema })
  }),
  z.strictObject({
    ...baseShape,
    type: z.literal('media.command-result'),
    source: z.literal('page-main'),
    payload: mediaCommandResultResponseSchema
  }),
  z.strictObject({
    ...baseShape,
    type: z.literal('media.error'),
    source: z.literal('page-main'),
    payload: z.strictObject({
      requestType: z.enum(['media.context', 'media.get-state', 'media.execute']),
      code: z.enum(['INVALID_PAYLOAD', 'RUNTIME_UNAVAILABLE', 'INTERNAL_ERROR']),
      messageKey: z.string().check(z.minLength(1), z.maxLength(128))
    })
  })
])

export type PageMediaMessage = z.infer<typeof pageMediaMessageSchema>
export type PageMediaMessageType = PageMediaMessage['type']
export type PageMediaRequestType = 'media.context' | 'media.get-state' | 'media.execute'
export type PageMediaResponseType =
  | 'media.context-ready'
  | 'media.state'
  | 'media.state-changed'
  | 'media.command-result'
  | 'media.error'
export type PageMediaMessageForType<T extends PageMediaMessageType> = Extract<
  PageMediaMessage,
  { type: T }
>

export type PageMediaPayloadByType = {
  'media.context': { frameId: number }
  'media.context-ready': Record<string, never>
  'media.get-state': Record<string, never>
  'media.state': { state: z.infer<typeof mediaPageStateSchema> }
  'media.state-changed': { summary: z.infer<typeof mediaPageStateSummarySchema> }
  'media.execute': { command: z.infer<typeof mediaCommandSchema> }
  'media.command-result': z.infer<typeof mediaCommandResultResponseSchema>
  'media.error': {
    requestType: 'media.context' | 'media.get-state' | 'media.execute'
    code: 'INVALID_PAYLOAD' | 'RUNTIME_UNAVAILABLE' | 'INTERNAL_ERROR'
    messageKey: string
  }
}

type PageMediaSourceByType = {
  'media.context': 'content'
  'media.context-ready': 'page-main'
  'media.get-state': 'content'
  'media.state': 'page-main'
  'media.state-changed': 'page-main'
  'media.execute': 'content'
  'media.command-result': 'page-main'
  'media.error': 'page-main'
}

export function createPageMediaMessage<T extends PageMediaMessageType>(
  type: T,
  source: PageMediaSourceByType[T],
  sessionId: string,
  nonce: string,
  payload: PageMediaPayloadByType[T],
  requestId = createRequestId()
): PageMediaMessageForType<T> {
  return pageMediaMessageSchema.parse({
    protocol: PROTOCOL_VERSION,
    type,
    requestId,
    source,
    sessionId,
    nonce,
    payload
  }) as PageMediaMessageForType<T>
}

export function createPageMediaRequest<T extends PageMediaRequestType>(
  type: T,
  sessionId: string,
  nonce: string,
  payload: PageMediaPayloadByType[T],
  requestId = createRequestId()
): PageMediaMessageForType<T> {
  return createPageMediaMessage(type, 'content', sessionId, nonce, payload, requestId)
}

export function createPageMediaResponse<T extends PageMediaResponseType>(
  type: T,
  sessionId: string,
  nonce: string,
  payload: PageMediaPayloadByType[T],
  requestId: string
): PageMediaMessageForType<T> {
  return createPageMediaMessage(type, 'page-main', sessionId, nonce, payload, requestId)
}

export function createPageMediaNotification(
  sessionId: string,
  nonce: string,
  summary: z.infer<typeof mediaPageStateSummarySchema>,
  requestId = createRequestId()
): PageMediaMessageForType<'media.state-changed'> {
  return createPageMediaMessage(
    'media.state-changed',
    'page-main',
    sessionId,
    nonce,
    { summary },
    requestId
  )
}

export function parsePageMediaMessage(value: unknown): PageMediaMessage | null {
  const parsed = pageMediaMessageSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
