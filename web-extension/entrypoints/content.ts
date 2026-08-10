import { injectScript } from 'wxt/utils/inject-script'
import { WxtRuntimeTransport } from '../src/infrastructure/browser/wxt-browser-ports'
import { startContentRuntime } from '../src/runtime/content/content-runtime'

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  runAt: 'document_start',
  async main(ctx) {
    let dispose: () => void = () => undefined
    let invalidated = false
    ctx.onInvalidated(() => {
      invalidated = true
      dispose()
    })

    dispose = await startContentRuntime({
      window,
      document,
      transport: new WxtRuntimeTransport(),
      injectPageMain: async () => {
        await injectScript('/page-main.js')
      }
    })
    if (invalidated) dispose()
  }
})
