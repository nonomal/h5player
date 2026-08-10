import { browser } from 'wxt/browser'
import { WxtRuntimeTransport } from '../src/infrastructure/browser/wxt-browser-ports'
import {
  startContentRuntime,
  type ContentRuntimeHandle
} from '../src/runtime/content/content-runtime'

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_start',
  async main(ctx) {
    let runtime: ContentRuntimeHandle | null = null
    let invalidated = false
    const onMessage = (
      rawMessage: unknown,
      sender: Parameters<Parameters<typeof browser.runtime.onMessage.addListener>[0]>[1],
      sendResponse: (response?: unknown) => void
    ): boolean => {
      if (!runtime) return false
      const metadata = sender.id ? { id: sender.id } : {}
      void runtime.handleTabMessage(rawMessage, metadata).then((response) => {
        sendResponse(response)
      })
      return true
    }
    browser.runtime.onMessage.addListener(onMessage)

    ctx.onInvalidated(() => {
      invalidated = true
      browser.runtime.onMessage.removeListener(onMessage)
      runtime?.teardown()
    })

    runtime = await startContentRuntime({
      window,
      document,
      extensionId: browser.runtime.id,
      transport: new WxtRuntimeTransport(),
      injectPageMain: () => Promise.resolve()
    })
    if (invalidated) runtime.teardown()
  }
})
