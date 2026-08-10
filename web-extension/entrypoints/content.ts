import { browser } from 'wxt/browser'
import { injectScript } from 'wxt/utils/inject-script'
import { createSessionId } from '../src/shared/ids'
import { parsePhase0Message } from '../src/shared/protocol'

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  runAt: 'document_start',
  async main() {
    const root = document.documentElement
    if (!root) return

    const sessionId = createSessionId()
    root.dataset['h5playerWebextContent'] = 'ready'
    root.dataset['h5playerWebextSession'] = sessionId

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window) return
      const message = parsePhase0Message(event.data)
      if (!message || message.type !== 'phase0.content-ready' || message.sessionId !== sessionId)
        return
      root.dataset['h5playerWebextBridge'] = 'ready'
    }

    window.addEventListener('message', onMessage)
    await injectScript('/page-main.js')
    void browser.runtime
      .sendMessage({ type: 'phase0.content-ready', sessionId })
      .catch(() => undefined)
  }
})
