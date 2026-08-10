import type { Teardown } from '../../application/ports/browser'
import { systemPingResponseSchema } from '../../application/settings/contracts'
import { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import { RuntimeRequestClient } from '../../infrastructure/messaging/request-client'
import { systemClock, systemScheduler } from '../../infrastructure/time/system-time'
import { createSessionId, createSessionNonce } from '../../shared/ids'
import { PageBridge } from './page-bridge'

type ContentRuntimeOptions = {
  window: Window
  document: Document
  transport: ConstructorParameters<typeof RuntimeRequestClient>[1]
  injectPageMain: () => Promise<void>
}

export async function startContentRuntime(options: ContentRuntimeOptions): Promise<Teardown> {
  const root = options.document.documentElement
  if (!root) return () => undefined

  const sessionId = createSessionId()
  const nonce = createSessionNonce()
  const bridge = new PageBridge({
    window: options.window,
    session: { sessionId, nonce, origin: options.window.location.origin },
    replayGuard: new ReplayGuard(systemClock),
    scheduler: systemScheduler,
    injectPageMain: options.injectPageMain
  })

  root.dataset['h5playerWebextContent'] = 'ready'
  const bridgeReady = await bridge.start()
  root.dataset['h5playerWebextBridge'] = bridgeReady ? 'ready' : 'failed'

  if (bridgeReady) {
    const runtime = new RuntimeRequestClient('content', options.transport, systemScheduler, {
      sessionId
    })
    try {
      await runtime.request('system.ping', {}, systemPingResponseSchema)
      root.dataset['h5playerWebextBackground'] = 'ready'
      bridge.ping()
    } catch {
      root.dataset['h5playerWebextBackground'] = 'failed'
    }
  }

  return bridge.teardown()
}
