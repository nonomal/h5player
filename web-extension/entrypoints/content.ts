import { browser } from 'wxt/browser'
import { createApp, defineComponent, h, shallowRef } from 'vue'
import {
  WxtRuntimeTransport,
  WxtStoragePort
} from '../src/infrastructure/browser/wxt-browser-ports'
import { SETTINGS_STORAGE_KEY } from '../src/infrastructure/storage/settings-repository'
import { downloadCaptureArtifact } from '../src/ui/files/download-capture'
import { MediaOverlay, type OverlayEvent, type OverlayViewModel } from '../src/ui/overlay'
import overlayCss from '../src/ui/overlay/MediaOverlay.css?inline'
import { ContentOverlayController } from '../src/runtime/content/content-overlay-controller'
import {
  startContentRuntime,
  type ContentRuntimeHandle,
  type ContentRuntimeSnapshot
} from '../src/runtime/content/content-runtime'

function resetOverlayHost(shadowHost: HTMLElement, uiContainer: HTMLElement): void {
  const hostStyles: Readonly<Record<string, string>> = {
    all: 'initial',
    position: 'fixed',
    inset: '0 auto auto 0',
    display: 'block',
    width: '0',
    height: '0',
    margin: '0',
    padding: '0',
    border: '0',
    overflow: 'visible',
    visibility: 'visible',
    opacity: '1',
    'pointer-events': 'none',
    direction: 'ltr',
    'unicode-bidi': 'isolate',
    'z-index': '2147483000'
  }
  for (const [property, value] of Object.entries(hostStyles)) {
    shadowHost.style.setProperty(property, value, 'important')
  }
  shadowHost.id = 'h5p-ext-overlay-host'
  shadowHost.dataset['h5pExtOverlayHost'] = 'ready'
  uiContainer.classList.add('h5p-ext-overlay-container')
  uiContainer.style.setProperty('pointer-events', 'none', 'important')
}

export default defineContentScript({
  matches: [],
  registration: 'runtime',
  allFrames: true,
  runAt: 'document_start',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const runtimeKey = Symbol.for('h5player.web-extension.content-runtime.v3')
    if (Reflect.get(globalThis, runtimeKey) === true) return
    Reflect.set(globalThis, runtimeKey, true)
    let runtime: ContentRuntimeHandle | null = null
    let invalidated = false
    const isTopFrame = window.top === window
    const storage = new WxtStoragePort()
    const systemTheme = isTopFrame ? window.matchMedia('(prefers-color-scheme: dark)') : null
    let latestRuntimeState: ContentRuntimeSnapshot | null = null
    let updateOverlayModel: (model: OverlayViewModel) => void = () => undefined
    const overlay = isTopFrame
      ? new ContentOverlayController({
          media: {
            getMediaState: () =>
              runtime?.getMediaState() ?? Promise.reject(new Error('Content runtime unavailable')),
            executeMediaCommand: (command) =>
              runtime?.executeMediaCommand(command) ??
              Promise.reject(new Error('Content runtime unavailable'))
          },
          downloadCapture: downloadCaptureArtifact,
          resolveTheme: (theme) =>
            theme === 'system' ? (systemTheme?.matches ? 'dark' : 'light') : theme,
          onModelChanged: (model) => updateOverlayModel(model)
        })
      : null
    const overlayModel = shallowRef<OverlayViewModel | null>(overlay?.currentModel() ?? null)
    const overlayUi = overlay
      ? await createShadowRootUi(ctx, {
          name: 'h5p-ext-overlay',
          position: 'inline',
          anchor: () => document.documentElement,
          append: 'last',
          css: overlayCss,
          mode: 'closed',
          inheritStyles: false,
          isolateEvents: [
            'keydown',
            'keyup',
            'keypress',
            'click',
            'dblclick',
            'pointerdown',
            'pointerup',
            'mousedown',
            'mouseup',
            'input',
            'change',
            'wheel',
            'touchstart',
            'touchend',
            'contextmenu',
            'focusin',
            'focusout'
          ],
          onMount(uiContainer, _shadow, shadowHost) {
            resetOverlayHost(shadowHost, uiContainer)
            const root = defineComponent({
              name: 'H5PlayerContentOverlayRoot',
              setup: () => () => {
                const model = overlayModel.value
                return model === null
                  ? null
                  : h(MediaOverlay, {
                      model,
                      onIntent: (event: OverlayEvent) => {
                        void overlay.handle(event)
                      }
                    })
              }
            })
            const app = createApp(root)
            app.mount(uiContainer)
            return app
          },
          onRemove(app) {
            app?.unmount()
          }
        })
      : null
    if (ctx.isInvalid) {
      overlayUi?.remove()
      Reflect.deleteProperty(globalThis, runtimeKey)
      return
    }
    if (overlay !== null && overlayUi !== null) {
      updateOverlayModel = (model) => {
        overlayModel.value = model
        if (model.open && overlayUi.mounted === undefined) overlayUi.mount()
        else if (!model.open && overlayUi.mounted !== undefined) overlayUi.remove()
      }
    }
    const onSystemThemeChanged = (): void => {
      if (overlay !== null && latestRuntimeState !== null) {
        overlay.updateRuntime(latestRuntimeState)
      }
    }
    systemTheme?.addEventListener('change', onSystemThemeChanged)
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
      systemTheme?.removeEventListener('change', onSystemThemeChanged)
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
        }),
      onRuntimeStateChanged: (state) => {
        latestRuntimeState = state
        overlay?.updateRuntime(state)
      }
    })
    if (invalidated) {
      runtime.teardown()
      Reflect.deleteProperty(globalThis, runtimeKey)
    }
  }
})
