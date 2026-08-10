import { describe, expect, it } from 'vitest'
import { commandSuccess } from '../../src/domain/command'
import { createMediaCapabilities, type MediaSnapshot } from '../../src/domain/media'
import {
  createPageMediaMessage,
  createPageMediaRequest,
  createPageMediaResponse,
  parsePageMediaMessage
} from '../../src/infrastructure/messaging/page-media-protocol'

const sessionId = 'session-identifier-1'
const nonce = 'a'.repeat(64)
const requestId = 'request-identifier-1'

function snapshot(): MediaSnapshot {
  return {
    id: 'media-1',
    frameId: 0,
    kind: 'video',
    state: 'paused',
    metrics: {
      width: 640,
      height: 360,
      duration: 120,
      currentTime: 12,
      volume: 0.5,
      playbackRate: 1,
      muted: false,
      visible: true
    },
    capabilities: createMediaCapabilities({
      playback: true,
      seek: true,
      playbackRate: true,
      volume: true,
      mute: true
    }),
    adapterId: 'generic',
    updatedAt: 100
  }
}

function state() {
  const media = snapshot()
  return {
    frameId: 0,
    revision: 2,
    activeMediaId: media.id,
    media: [media],
    observedAt: 101
  }
}

describe('page media protocol boundaries', () => {
  it('constructs and parses every request and response with correlated IDs', () => {
    const mediaState = state()
    const command = { type: 'media.set-volume', mediaId: 'media-1', value: 0.8 } as const
    const context = createPageMediaRequest(
      'media.context',
      sessionId,
      nonce,
      { frameId: 0 },
      requestId
    )
    const getState = createPageMediaRequest('media.get-state', sessionId, nonce, {})
    const execute = createPageMediaRequest(
      'media.execute',
      sessionId,
      nonce,
      { command },
      requestId
    )
    const ready = createPageMediaResponse(
      'media.context-ready',
      sessionId,
      nonce,
      {},
      context.requestId
    )
    const stateResponse = createPageMediaResponse(
      'media.state',
      sessionId,
      nonce,
      { state: mediaState },
      getState.requestId
    )
    const commandResponse = createPageMediaResponse(
      'media.command-result',
      sessionId,
      nonce,
      {
        result: commandSuccess(command, snapshot(), true),
        state: mediaState
      },
      execute.requestId
    )
    const error = createPageMediaResponse(
      'media.error',
      sessionId,
      nonce,
      {
        requestType: 'media.execute',
        code: 'RUNTIME_UNAVAILABLE',
        messageKey: 'media.error.runtime-unavailable'
      },
      execute.requestId
    )
    const direct = createPageMediaMessage('media.get-state', 'content', sessionId, nonce, {})

    for (const message of [
      context,
      getState,
      execute,
      ready,
      stateResponse,
      commandResponse,
      error,
      direct
    ]) {
      expect(parsePageMediaMessage(message)).toEqual(message)
    }
    expect(getState.requestId.length).toBeGreaterThanOrEqual(16)
    expect(direct.requestId.length).toBeGreaterThanOrEqual(16)
    expect(ready.requestId).toBe(context.requestId)
    expect(commandResponse.requestId).toBe(execute.requestId)
  })

  it('rejects wrong direction, malformed identity fields, extras, and invalid payloads', () => {
    const valid = createPageMediaRequest(
      'media.context',
      sessionId,
      nonce,
      { frameId: 0 },
      requestId
    )
    const validState = state()
    const validStateMessage = createPageMediaMessage(
      'media.state',
      'page-main',
      sessionId,
      nonce,
      { state: validState },
      requestId
    )
    const invalidMessages: unknown[] = [
      null,
      { ...valid, protocol: 2 },
      { ...valid, source: 'page-main' },
      { ...valid, requestId: 'short' },
      { ...valid, sessionId: 'short' },
      { ...valid, nonce: nonce.toUpperCase() },
      { ...valid, nonce: 'a'.repeat(63) },
      { ...valid, extra: true },
      { ...valid, payload: { frameId: -1 } },
      { ...valid, payload: { frameId: 0, extra: true } },
      {
        ...validStateMessage,
        payload: { state: { ...validState, activeMediaId: null } }
      },
      {
        ...createPageMediaRequest(
          'media.execute',
          sessionId,
          nonce,
          { command: { type: 'media.play', mediaId: 'media-1' } },
          requestId
        ),
        payload: { command: { type: 'media.play', mediaId: 'media-1', extra: true } }
      },
      {
        ...createPageMediaResponse(
          'media.error',
          sessionId,
          nonce,
          {
            requestType: 'media.get-state',
            code: 'INTERNAL_ERROR',
            messageKey: 'media.error.internal'
          },
          requestId
        ),
        payload: {
          requestType: 'media.get-state',
          code: 'UNKNOWN_ERROR',
          messageKey: ''
        }
      }
    ]

    for (const message of invalidMessages) {
      expect(parsePageMediaMessage(message)).toBeNull()
    }
  })
})
