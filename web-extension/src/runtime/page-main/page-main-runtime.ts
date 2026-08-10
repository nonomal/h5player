import { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import { systemClock } from '../../infrastructure/time/system-time'
import { createBridgeMessage, parseBridgeMessage } from '../../shared/protocol'

export function startPageMainRuntime(window: Window, document: Document): () => void {
  const root = document.documentElement
  if (root) root.dataset['h5playerWebextMain'] = 'ready'

  const replayGuard = new ReplayGuard(systemClock)
  let session: { sessionId: string; nonce: string; origin: string } | null = null

  const post = (
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

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const message = parseBridgeMessage(event.data)
    if (!message || message.source !== 'content') return

    if (message.type === 'bridge.init') {
      if (session && (session.sessionId !== message.sessionId || session.nonce !== message.nonce)) {
        return
      }
      session ??= {
        sessionId: message.sessionId,
        nonce: message.nonce,
        origin: event.origin
      }
      if (!replayGuard.accept(`content:${session.sessionId}`, message.requestId)) return
      post('bridge.ready', message.requestId, session)
      return
    }

    if (
      !session ||
      message.sessionId !== session.sessionId ||
      message.nonce !== session.nonce ||
      !replayGuard.accept(`content:${session.sessionId}`, message.requestId)
    ) {
      return
    }

    if (message.type === 'bridge.ping') post('bridge.pong', message.requestId, session)
    if (message.type === 'bridge.dispose') teardown()
  }

  const teardown = (): void => {
    window.removeEventListener('message', onMessage)
    session = null
  }

  window.addEventListener('message', onMessage)
  return teardown
}
