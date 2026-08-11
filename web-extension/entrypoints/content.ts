import { browser } from 'wxt/browser'
import {
  WxtRuntimeTransport,
  WxtStoragePort
} from '../src/infrastructure/browser/wxt-browser-ports'
import { SETTINGS_STORAGE_KEY } from '../src/infrastructure/storage/settings-repository'
import {
  startContentRuntime,
  type ContentRuntimeHandle
} from '../src/runtime/content/content-runtime'

export default defineContentScript({
  matches: [],
  registration: 'runtime',
  allFrames: true,
  runAt: 'document_start',
  async main(ctx) {
    const runtimeKey = Symbol.for('h5player.web-extension.content-runtime.v3')
    if (Reflect.get(globalThis, runtimeKey) === true) return
    Reflect.set(globalThis, runtimeKey, true)
    let runtime: ContentRuntimeHandle | null = null
    let invalidated = false
    const storage = new WxtStoragePort()
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
      Reflect.deleteProperty(globalThis, runtimeKey)
    })

    runtime = await startContentRuntime({
      window,
      document,
      extensionId: browser.runtime.id,
      transport: new WxtRuntimeTransport(),
      injectPageMain: () => Promise.resolve(),
      subscribeSettings: (listener) =>
        storage.subscribe((change) => {
          if (change.key === SETTINGS_STORAGE_KEY) listener()
        })
    })
    if (invalidated) {
      runtime.teardown()
      Reflect.deleteProperty(globalThis, runtimeKey)
    }
  }
})
