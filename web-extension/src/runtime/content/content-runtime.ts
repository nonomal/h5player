import { systemPingResponseSchema } from '../../application/settings/contracts'
import {
  mediaExecutePayloadSchema,
  mediaGetStatePayloadSchema,
  mediaPageStateSchema,
  mediaCommandResultResponseSchema
} from '../../application/media'
import { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import { RuntimeRequestClient } from '../../infrastructure/messaging/request-client'
import { systemClock, systemScheduler } from '../../infrastructure/time/system-time'
import { createSessionId, createSessionNonce } from '../../shared/ids'
import {
  createTabError,
  createTabSuccess,
  parseTabRequest,
  type TabRequestEnvelope
} from '../../shared/tab-protocol'
import { PageBridge, PageBridgeError } from './page-bridge'

type ContentRuntimeOptions = {
  window: Window
  document: Document
  extensionId: string
  transport: ConstructorParameters<typeof RuntimeRequestClient>[1]
  injectPageMain: () => Promise<void>
}

export type ContentMessageSender = {
  readonly id?: string
}

export type ContentRuntimeHandle = {
  readonly handleTabMessage: (rawMessage: unknown, sender: ContentMessageSender) => Promise<unknown>
  readonly teardown: () => void
}

function bridgeFailure(request: TabRequestEnvelope, error: unknown): unknown {
  if (error instanceof PageBridgeError) {
    const unavailable =
      error.code === 'BRIDGE_UNAVAILABLE' ||
      error.code === 'PAGE_RUNTIME_UNAVAILABLE' ||
      error.code === 'REQUEST_TIMEOUT'
    return createTabError(
      request,
      unavailable ? 'PAGE_RUNTIME_UNAVAILABLE' : 'INTERNAL_ERROR',
      unavailable ? 'media.error.runtime-unavailable' : 'media.error.internal',
      unavailable
    )
  }
  return createTabError(request, 'INTERNAL_ERROR', 'media.error.internal')
}

export async function startContentRuntime(
  options: ContentRuntimeOptions
): Promise<ContentRuntimeHandle> {
  const root = options.document.documentElement
  if (!root) {
    return {
      handleTabMessage: () => Promise.resolve(null),
      teardown: () => undefined
    }
  }

  const sessionId = createSessionId()
  const nonce = createSessionNonce()
  const runtime = new RuntimeRequestClient('content', options.transport, systemScheduler, {
    sessionId
  })
  let frameId = 0

  root.dataset['h5playerWebextContent'] = 'ready'
  try {
    const ping = await runtime.request('system.ping', {}, systemPingResponseSchema)
    frameId = ping.frameId ?? 0
    root.dataset['h5playerWebextBackground'] = 'ready'
  } catch {
    root.dataset['h5playerWebextBackground'] = 'failed'
  }

  const bridge = new PageBridge({
    window: options.window,
    session: { sessionId, nonce, origin: options.window.location.origin },
    replayGuard: new ReplayGuard(systemClock),
    scheduler: systemScheduler,
    injectPageMain: options.injectPageMain
  })

  const bridgeReady = await bridge.start()
  root.dataset['h5playerWebextBridge'] = bridgeReady ? 'ready' : 'failed'
  let mediaReady = false
  if (bridgeReady) {
    try {
      mediaReady = await bridge.configure(frameId)
      bridge.ping()
    } catch {
      mediaReady = false
    }
  }
  root.dataset['h5playerWebextMedia'] = mediaReady ? 'ready' : 'failed'

  const tabReplayGuard = new ReplayGuard(systemClock)

  const handleTabMessage = async (
    rawMessage: unknown,
    sender: ContentMessageSender
  ): Promise<unknown> => {
    const request = parseTabRequest(rawMessage)
    if (!request) return null
    if (sender.id !== options.extensionId) {
      return createTabError(request, 'UNAUTHORIZED_SOURCE', 'protocol.error.unauthorized-source')
    }
    if (!tabReplayGuard.accept(`background:${sessionId}`, request.requestId)) {
      return createTabError(request, 'REPLAY_DETECTED', 'protocol.error.replay-detected')
    }
    if (!mediaReady) {
      return createTabError(
        request,
        'PAGE_RUNTIME_UNAVAILABLE',
        'media.error.runtime-unavailable',
        true
      )
    }

    try {
      if (request.type === 'media.get-state') {
        if (!mediaGetStatePayloadSchema.safeParse(request.payload).success) {
          return createTabError(request, 'INVALID_PAYLOAD', 'protocol.error.invalid-payload')
        }
        return createTabSuccess(request, mediaPageStateSchema.parse(await bridge.getMediaState()))
      }

      const payload = mediaExecutePayloadSchema.safeParse(request.payload)
      if (!payload.success) {
        return createTabError(request, 'INVALID_PAYLOAD', 'protocol.error.invalid-payload')
      }
      return createTabSuccess(
        request,
        mediaCommandResultResponseSchema.parse(
          await bridge.executeMediaCommand(payload.data.command)
        )
      )
    } catch (error) {
      return bridgeFailure(request, error)
    }
  }

  return {
    handleTabMessage,
    teardown: () => bridge.stop()
  }
}
