import { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import type { MediaPageStateSummary } from '../../application/media'
import {
  createPageMediaNotification,
  createPageMediaResponse,
  parsePageMediaMessage,
  type PageMediaMessage,
  type PageMediaPayloadByType,
  type PageMediaResponseType
} from '../../infrastructure/messaging/page-media-protocol'
import { systemClock } from '../../infrastructure/time/system-time'
import { createBridgeMessage, parseBridgeMessage } from '../../shared/protocol'
import { MediaPageRuntime } from './media-page-runtime'

const RUNTIME_KEY = Symbol.for('h5player.web-extension.page-runtime.v1')
const RUNTIME_BRAND = 'h5player.web-extension.page-runtime'

type RuntimeMarker = {
  readonly brand: string
  readonly version: 1
}

function installRuntimeMarker(currentWindow: Window): RuntimeMarker | null {
  const existing = Object.getOwnPropertyDescriptor(currentWindow, RUNTIME_KEY)
  if (existing !== undefined) return null

  const marker: RuntimeMarker = Object.freeze({ brand: RUNTIME_BRAND, version: 1 })
  try {
    Object.defineProperty(currentWindow, RUNTIME_KEY, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: marker
    })
    return marker
  } catch {
    return marker
  }
}

export function startPageMainRuntime(window: Window, document: Document): () => void {
  const root = document.documentElement
  if (root) root.dataset['h5playerWebextMain'] = 'ready'

  const marker = installRuntimeMarker(window)
  if (marker === null) return () => undefined

  const replayGuard = new ReplayGuard(systemClock)
  let session: { sessionId: string; nonce: string; origin: string } | null = null
  let mediaRuntime: MediaPageRuntime | null = null
  let mediaStateSubscription: (() => void) | null = null
  let mediaFrameId = 0
  let stopped = false

  const teardown = (): void => {
    if (stopped) return
    stopped = true
    window.removeEventListener('message', onMessage)
    mediaRuntime?.teardown()
    mediaStateSubscription?.()
    mediaStateSubscription = null
    mediaRuntime = null
    session = null
    const descriptor = Object.getOwnPropertyDescriptor(window, RUNTIME_KEY)
    if (descriptor?.value === marker) {
      try {
        delete (window as unknown as Record<PropertyKey, unknown>)[RUNTIME_KEY]
      } catch {
        // A hostile page may make the marker non-configurable after startup.
      }
    }
  }

  const postLifecycle = (
    type: 'bridge.ready' | 'bridge.pong',
    requestId: string,
    activeSession: { sessionId: string; nonce: string; origin: string }
  ): void => {
    window.postMessage(
      createBridgeMessage(
        type,
        'page-main',
        activeSession.sessionId,
        activeSession.nonce,
        requestId
      ),
      activeSession.origin
    )
  }

  const postMedia = <T extends PageMediaResponseType>(
    type: T,
    requestId: string,
    payload: PageMediaPayloadByType[T],
    activeSession: { sessionId: string; nonce: string; origin: string }
  ): void => {
    try {
      const message = createPageMediaResponse(
        type,
        activeSession.sessionId,
        activeSession.nonce,
        payload,
        requestId
      )
      window.postMessage(message, activeSession.origin)
    } catch {
      // Invalid page data is contained at the page boundary.
    }
  }

  const postMediaError = (
    request: PageMediaMessage,
    code: 'INVALID_PAYLOAD' | 'RUNTIME_UNAVAILABLE' | 'INTERNAL_ERROR',
    messageKey: string
  ): void => {
    if (!session) return
    postMedia(
      'media.error',
      request.requestId,
      {
        requestType:
          request.type === 'media.context' ||
          request.type === 'media.get-state' ||
          request.type === 'media.execute'
            ? request.type
            : 'media.get-state',
        code,
        messageKey
      },
      session
    )
  }

  const postMediaStateChanged = (
    summary: MediaPageStateSummary,
    activeSession: { sessionId: string; nonce: string; origin: string }
  ): void => {
    try {
      window.postMessage(
        createPageMediaNotification(activeSession.sessionId, activeSession.nonce, summary),
        activeSession.origin
      )
    } catch {
      // Invalid page data is contained at the page boundary.
    }
  }

  const handleMediaMessage = (message: PageMediaMessage): void => {
    if (!session) return
    const scope = `content:${session.sessionId}`
    if (!replayGuard.accept(scope, message.requestId)) return

    if (message.type === 'media.context') {
      if (mediaRuntime !== null && mediaFrameId !== message.payload.frameId) {
        mediaStateSubscription?.()
        mediaStateSubscription = null
        mediaRuntime.teardown()
        mediaRuntime = null
      }
      try {
        mediaRuntime ??= new MediaPageRuntime(window, document, message.payload.frameId)
        mediaFrameId = message.payload.frameId
        if (mediaStateSubscription === null) {
          const runtime = mediaRuntime
          const subscribe = Reflect.get(runtime, 'subscribeStateChanged') as unknown
          if (typeof subscribe === 'function') {
            mediaStateSubscription = Reflect.apply(subscribe, runtime, [
              (summary: MediaPageStateSummary) => {
                if (session) postMediaStateChanged(summary, session)
              }
            ]) as () => void
          }
        }
        postMedia('media.context-ready', message.requestId, {}, session)
      } catch {
        postMediaError(message, 'INTERNAL_ERROR', 'media.error.runtime-init')
      }
      return
    }

    if (mediaRuntime === null) {
      postMediaError(message, 'RUNTIME_UNAVAILABLE', 'media.error.runtime-unavailable')
      return
    }

    if (message.type === 'media.get-state') {
      try {
        postMedia('media.state', message.requestId, { state: mediaRuntime.getState() }, session)
      } catch {
        postMediaError(message, 'INTERNAL_ERROR', 'media.error.state-failed')
      }
      return
    }

    if (message.type === 'media.execute') {
      void mediaRuntime
        .execute(message.payload.command)
        .then((response) => {
          if (session) postMedia('media.command-result', message.requestId, response, session)
        })
        .catch(() => postMediaError(message, 'INTERNAL_ERROR', 'media.error.command-failed'))
    }
  }

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (stopped || event.source !== window || event.origin !== window.location.origin) return

    const lifecycle = parseBridgeMessage(event.data)
    if (lifecycle && lifecycle.source === 'content') {
      if (lifecycle.type === 'bridge.init') {
        if (
          session &&
          (session.sessionId !== lifecycle.sessionId || session.nonce !== lifecycle.nonce)
        ) {
          return
        }
        session ??= {
          sessionId: lifecycle.sessionId,
          nonce: lifecycle.nonce,
          origin: event.origin
        }
        if (!replayGuard.accept(`content:${session.sessionId}`, lifecycle.requestId)) return
        postLifecycle('bridge.ready', lifecycle.requestId, session)
        return
      }

      if (
        !session ||
        lifecycle.sessionId !== session.sessionId ||
        lifecycle.nonce !== session.nonce ||
        !replayGuard.accept(`content:${session.sessionId}`, lifecycle.requestId)
      ) {
        return
      }

      if (lifecycle.type === 'bridge.ping')
        postLifecycle('bridge.pong', lifecycle.requestId, session)
      if (lifecycle.type === 'bridge.dispose') teardown()
      return
    }

    const media = parsePageMediaMessage(event.data)
    if (
      !media ||
      media.source !== 'content' ||
      !session ||
      media.sessionId !== session.sessionId ||
      media.nonce !== session.nonce
    ) {
      return
    }
    handleMediaMessage(media)
  }

  window.addEventListener('message', onMessage)
  return teardown
}
