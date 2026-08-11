import type {
  FullscreenMode,
  MediaCapabilities,
  MediaId,
  MediaPresentationState,
  MediaSnapshot,
  VisualState
} from '../../domain/media'
import {
  clampMediaTime,
  clampPlaybackRate,
  clampUnit,
  cloneVisualState,
  createMediaCapabilities,
  DEFAULT_VISUAL_STATE,
  isDefaultVisualState,
  parseVisualState,
  serializeVisualFilter,
  serializeVisualTransform
} from '../../domain/media'
import type {
  AdapterTeardown,
  MediaControllerChange,
  MediaControllerChangeReason,
  MediaControllerContext,
  MediaControllerListener,
  ObservableMediaController
} from '../../domain/adapter'
import type { CaptureOptions } from '../../domain/capture'
import { nativeMediaBindings } from './native-media-bindings'
import { nativeCaptureBindings } from './native-capture-bindings'

const STATE_EVENTS = [
  'durationchange',
  'emptied',
  'ended',
  'loadedmetadata',
  'pause',
  'play',
  'ratechange',
  'resize',
  'seeked',
  'seeking',
  'timeupdate',
  'volumechange',
  'enterpictureinpicture',
  'leavepictureinpicture',
  'blur'
] as const

const INTERACTION_EVENTS = ['click', 'focus', 'mousedown', 'pointerdown', 'touchstart'] as const
const DOCUMENT_STATE_EVENTS = ['fullscreenchange'] as const

const WEB_FULLSCREEN_STYLES = Object.freeze({
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  'max-width': 'none',
  'max-height': 'none',
  margin: '0',
  'object-fit': 'contain',
  background: '#000',
  'z-index': '2147483647'
})

function scheduleMicrotask(callback: () => void): void {
  void Promise.resolve().then(callback)
}

function firstPositive(...values: readonly number[]): number {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) return value
  }
  return 0
}

function normalizeVolume(value: number): number {
  return clampUnit(Number.isFinite(value) ? value : 1)
}

function normalizePlaybackRate(value: number): number {
  return clampPlaybackRate(Number.isFinite(value) ? value : 1)
}

function normalizeTimestamp(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function asError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? value : new Error(fallbackMessage)
}

function runOperation(operation: () => void, fallbackMessage: string): Promise<void> {
  try {
    operation()
    return Promise.resolve()
  } catch (error) {
    return Promise.reject(asError(error, fallbackMessage))
  }
}

function combineStyleValue(baseline: string, enhancement: string): string {
  const normalized = baseline.trim()
  return normalized === '' || normalized === 'none' ? enhancement : `${normalized} ${enhancement}`
}

function visibleDimensions(element: HTMLMediaElement): {
  readonly width: number
  readonly height: number
  readonly visible: boolean
} {
  const rect = nativeMediaBindings.getBoundingClientRect(element)
  const attributeWidth = nativeMediaBindings.getNumericAttribute(element, 'width')
  const attributeHeight = nativeMediaBindings.getNumericAttribute(element, 'height')
  const intrinsicWidth = nativeMediaBindings.readVideoWidth(element)
  const intrinsicHeight = nativeMediaBindings.readVideoHeight(element)
  const width = firstPositive(
    rect?.width ?? 0,
    nativeMediaBindings.readClientWidth(element),
    nativeMediaBindings.readDisplayWidth(element),
    attributeWidth,
    intrinsicWidth
  )
  const height = firstPositive(
    rect?.height ?? 0,
    nativeMediaBindings.readClientHeight(element),
    nativeMediaBindings.readDisplayHeight(element),
    attributeHeight,
    intrinsicHeight
  )
  const hasDimensions = width > 0 && height > 0
  const documentVisible = element.ownerDocument.visibilityState !== 'hidden'
  const connected = nativeMediaBindings.readIsConnected(element)
  const explicitlyHidden = nativeMediaBindings.readHidden(element)
  const rendered = nativeMediaBindings.isRendered(element)

  let intersectsViewport = true
  const view = element.ownerDocument.defaultView
  if (rect !== null && view !== null && rect.width > 0 && rect.height > 0) {
    intersectsViewport =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < view.innerHeight &&
      rect.left < view.innerWidth
  }

  return {
    width,
    height,
    visible:
      connected &&
      documentVisible &&
      !explicitlyHidden &&
      rendered &&
      hasDimensions &&
      intersectsViewport
  }
}

export class GenericMediaController implements ObservableMediaController {
  readonly mediaId: MediaId
  readonly capabilities: MediaCapabilities

  private readonly element: HTMLMediaElement
  private readonly frameId: number
  private readonly now: () => number
  private readonly schedule: (callback: () => void) => void
  private readonly originalStyleCssText: string
  private readonly originalTransform: string
  private readonly originalFilter: string
  private readonly listeners = new Set<MediaControllerListener>()
  private visualState: VisualState
  private webFullscreenActive = false
  private observing = false
  private disposed = false
  private notificationQueued = false
  private notificationGeneration = 0
  private pendingReason: MediaControllerChangeReason = 'state'
  private pendingObservedAt = 0

  constructor(element: HTMLMediaElement, context: MediaControllerContext) {
    if (!nativeMediaBindings.isMediaElement(element)) {
      throw new TypeError('GenericMediaController requires an HTML video or audio element')
    }
    this.element = element
    this.mediaId = context.mediaId
    this.frameId = Number.isInteger(context.frameId) && context.frameId >= 0 ? context.frameId : 0
    this.now = context.now
    this.schedule = context.schedule ?? scheduleMicrotask
    this.originalStyleCssText = nativeMediaBindings.readStyleCssText(element)
    this.originalTransform = nativeMediaBindings.readStyleProperty(element, 'transform')
    this.originalFilter = nativeMediaBindings.readStyleProperty(element, 'filter')
    this.visualState = cloneVisualState(DEFAULT_VISUAL_STATE)
    const isVideo = nativeMediaBindings.isVideo(element)
    const visual = isVideo && nativeMediaBindings.hasVisualStyles
    const fullscreenNative =
      isVideo &&
      nativeMediaBindings.hasFullscreenNative &&
      nativeMediaBindings.isFullscreenEnabled(element)
    const fullscreenWeb = isVideo && nativeMediaBindings.hasFullscreenWeb
    this.capabilities = Object.freeze(
      createMediaCapabilities({
        playback: nativeMediaBindings.hasPlayback,
        seek: nativeMediaBindings.hasSeek,
        playbackRate: nativeMediaBindings.hasPlaybackRate,
        volume: nativeMediaBindings.hasVolume,
        mute: nativeMediaBindings.hasMute,
        visual,
        fullscreen: fullscreenNative || fullscreenWeb,
        fullscreenNative,
        fullscreenWeb,
        pictureInPicture: isVideo && nativeMediaBindings.isPictureInPictureEnabled(element),
        capture: isVideo && nativeCaptureBindings.available,
        downloadExperimental: false
      })
    )
  }

  getSnapshot(): MediaSnapshot {
    const dimensions = visibleDimensions(this.element)
    const durationValue = nativeMediaBindings.readDuration(this.element)
    const duration = Number.isFinite(durationValue) && durationValue >= 0 ? durationValue : null
    const currentTime = clampMediaTime(nativeMediaBindings.readCurrentTime(this.element), duration)
    const connected = nativeMediaBindings.readIsConnected(this.element)
    const hasError = nativeMediaBindings.readError(this.element) !== null
    const state = !connected
      ? 'removed'
      : hasError
        ? 'error'
        : nativeMediaBindings.readPaused(this.element)
          ? 'paused'
          : 'active'

    const metrics = Object.freeze({
      width: dimensions.width,
      height: dimensions.height,
      duration,
      currentTime,
      volume: normalizeVolume(nativeMediaBindings.readVolume(this.element)),
      playbackRate: normalizePlaybackRate(nativeMediaBindings.readPlaybackRate(this.element)),
      muted: nativeMediaBindings.readMuted(this.element),
      visible: dimensions.visible
    })
    const presentation = this.getPresentationState()

    return Object.freeze({
      id: this.mediaId,
      frameId: this.frameId,
      kind: nativeMediaBindings.isVideo(this.element) ? 'video' : 'audio',
      state,
      metrics,
      capabilities: this.capabilities,
      visual: this.visualState,
      presentation,
      adapterId: 'generic',
      updatedAt: normalizeTimestamp(this.now())
    })
  }

  async play(): Promise<void> {
    this.assertUsable('playback', 'play')
    await nativeMediaBindings.play(this.element)
    this.queueNotification('state')
  }

  pause(): Promise<void> {
    return runOperation(() => {
      this.assertUsable('playback', 'pause')
      nativeMediaBindings.pause(this.element)
      this.queueNotification('state')
    }, 'Native media pause failed')
  }

  seekTo(seconds: number): Promise<void> {
    return runOperation(() => {
      this.assertUsable('seek', 'seek')
      const duration = nativeMediaBindings.readDuration(this.element)
      const normalizedDuration = Number.isFinite(duration) && duration >= 0 ? duration : null
      nativeMediaBindings.writeCurrentTime(
        this.element,
        clampMediaTime(seconds, normalizedDuration)
      )
      this.queueNotification('state')
    }, 'Native media seek failed')
  }

  setPlaybackRate(value: number): Promise<void> {
    return runOperation(() => {
      this.assertUsable('playbackRate', 'set playback rate')
      nativeMediaBindings.writePlaybackRate(this.element, normalizePlaybackRate(value))
      this.queueNotification('state')
    }, 'Native media playback rate update failed')
  }

  setVolume(value: number): Promise<void> {
    return runOperation(() => {
      this.assertUsable('volume', 'set volume')
      nativeMediaBindings.writeVolume(this.element, clampUnit(value))
      this.queueNotification('state')
    }, 'Native media volume update failed')
  }

  setMuted(muted: boolean): Promise<void> {
    return runOperation(() => {
      this.assertUsable('mute', 'set mute')
      nativeMediaBindings.writeMuted(this.element, muted)
      this.queueNotification('state')
    }, 'Native media mute update failed')
  }

  setVisualState(state: VisualState): Promise<void> {
    return runOperation(() => {
      this.assertUsable('visual', 'set visual state')
      const parsed = parseVisualState(state)
      if (!parsed.ok) throw new TypeError('Invalid visual state')
      // Render first and commit the immutable state only after every DOM
      // operation succeeds. This gives reset and normal updates atomic state
      // semantics even when a hostile style implementation throws.
      this.renderStyles(parsed.value, this.webFullscreenActive)
      this.visualState = parsed.value
      this.queueNotification('state')
    }, 'Native media visual state update failed')
  }

  async toggleFullscreen(mode: FullscreenMode): Promise<void> {
    this.assertUsable('fullscreen', `${mode} fullscreen`)
    if (mode === 'web') {
      if (this.webFullscreenActive) {
        this.renderStyles(this.visualState, false)
        this.webFullscreenActive = false
      } else {
        const nativeElement = nativeMediaBindings.readFullscreenElement(this.element)
        if (nativeElement !== null && this.isOwnedFullscreen(nativeElement)) {
          await nativeMediaBindings.exitFullscreen(this.element)
        }
        this.renderStyles(this.visualState, true)
        this.webFullscreenActive = true
      }
      this.queueNotification('state')
      return
    }

    const nativeElement = nativeMediaBindings.readFullscreenElement(this.element)
    if (nativeElement !== null && this.isOwnedFullscreen(nativeElement)) {
      await nativeMediaBindings.exitFullscreen(this.element)
    } else {
      await nativeMediaBindings.requestFullscreen(this.element)
    }
    if (this.webFullscreenActive) {
      this.renderStyles(this.visualState, false)
      this.webFullscreenActive = false
    }
    this.queueNotification('state')
  }

  async togglePictureInPicture(): Promise<void> {
    this.assertUsable('pictureInPicture', 'toggle picture-in-picture')
    const current = nativeMediaBindings.readPictureInPictureElement(this.element)
    if (current === this.element) {
      await nativeMediaBindings.exitPictureInPicture(this.element)
    } else {
      await nativeMediaBindings.requestPictureInPicture(this.element)
    }
    this.queueNotification('state')
  }

  captureFrame(options: CaptureOptions) {
    this.assertUsable('capture', 'capture a frame')
    return nativeCaptureBindings.captureVideoFrame(this.element, options)
  }

  subscribe(listener: MediaControllerListener): AdapterTeardown {
    this.assertNotDisposed()
    this.listeners.add(listener)
    this.startObserving()
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) this.stopObserving()
    }
  }

  teardown(): void {
    if (this.disposed) return
    this.disposed = true
    this.notificationGeneration += 1
    this.notificationQueued = false
    this.listeners.clear()
    this.stopObserving()
    try {
      this.renderStyles(DEFAULT_VISUAL_STATE, false)
    } catch {
      // Teardown must remain best-effort when a page replaces native style APIs.
    }
    const fullscreenElement = nativeMediaBindings.readFullscreenElement(this.element)
    if (fullscreenElement !== null && this.isOwnedFullscreen(fullscreenElement)) {
      void nativeMediaBindings.exitFullscreen(this.element).catch(() => undefined)
    }
    if (nativeMediaBindings.readPictureInPictureElement(this.element) === this.element) {
      void nativeMediaBindings.exitPictureInPicture(this.element).catch(() => undefined)
    }
  }

  private readonly handleStateEvent: EventListener = () => {
    this.queueNotification('state')
  }

  private readonly handleInteractionEvent: EventListener = () => {
    this.queueNotification('interaction')
  }

  private getPresentationState(): MediaPresentationState {
    const nativeElement = nativeMediaBindings.readFullscreenElement(this.element)
    const nativeFullscreen = nativeElement !== null && this.isOwnedFullscreen(nativeElement)
    return Object.freeze({
      fullscreen: this.webFullscreenActive ? 'web' : nativeFullscreen ? 'native' : 'none',
      pictureInPicture:
        nativeMediaBindings.readPictureInPictureElement(this.element) === this.element
    })
  }

  private isOwnedFullscreen(element: Element): boolean {
    return element === this.element || nativeMediaBindings.contains(element, this.element)
  }

  private renderStyles(state: VisualState, webFullscreen: boolean): void {
    nativeMediaBindings.writeStyleCssText(this.element, this.originalStyleCssText)
    if (!isDefaultVisualState(state)) {
      nativeMediaBindings.setStyleProperty(
        this.element,
        'transform',
        combineStyleValue(this.originalTransform, serializeVisualTransform(state)),
        'important'
      )
      nativeMediaBindings.setStyleProperty(
        this.element,
        'filter',
        combineStyleValue(this.originalFilter, serializeVisualFilter(state)),
        'important'
      )
    }
    if (webFullscreen) {
      for (const [property, value] of Object.entries(WEB_FULLSCREEN_STYLES)) {
        nativeMediaBindings.setStyleProperty(this.element, property, value, 'important')
      }
    }
  }

  private startObserving(): void {
    if (this.observing || this.disposed) return
    this.observing = true
    for (const event of STATE_EVENTS) {
      nativeMediaBindings.addEventListener(this.element, event, this.handleStateEvent, true)
    }
    for (const event of INTERACTION_EVENTS) {
      nativeMediaBindings.addEventListener(this.element, event, this.handleInteractionEvent, true)
    }
    for (const event of DOCUMENT_STATE_EVENTS) {
      nativeMediaBindings.addDocumentEventListener(
        this.element.ownerDocument,
        event,
        this.handleStateEvent,
        true
      )
    }
  }

  private stopObserving(): void {
    if (!this.observing) return
    this.observing = false
    for (const event of STATE_EVENTS) {
      nativeMediaBindings.removeEventListener(this.element, event, this.handleStateEvent, true)
    }
    for (const event of INTERACTION_EVENTS) {
      nativeMediaBindings.removeEventListener(
        this.element,
        event,
        this.handleInteractionEvent,
        true
      )
    }
    for (const event of DOCUMENT_STATE_EVENTS) {
      nativeMediaBindings.removeDocumentEventListener(
        this.element.ownerDocument,
        event,
        this.handleStateEvent,
        true
      )
    }
  }

  private queueNotification(reason: MediaControllerChangeReason): void {
    if (this.disposed || this.listeners.size === 0) return
    if (reason === 'interaction') this.pendingReason = reason
    this.pendingObservedAt = normalizeTimestamp(this.now())
    if (this.notificationQueued) return

    this.notificationQueued = true
    const generation = this.notificationGeneration
    this.schedule(() => {
      if (this.disposed || generation !== this.notificationGeneration) return
      this.notificationQueued = false
      const change: MediaControllerChange = {
        snapshot: this.getSnapshot(),
        reason: this.pendingReason,
        observedAt: this.pendingObservedAt
      }
      this.pendingReason = 'state'
      for (const listener of [...this.listeners]) {
        try {
          listener(change)
        } catch {
          // One subscriber must not break the controller lifecycle or other subscribers.
        }
      }
    })
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error(`Media controller ${String(this.mediaId)} is disposed`)
  }

  private assertUsable(capability: keyof MediaCapabilities, operation: string): void {
    this.assertNotDisposed()
    if (!this.capabilities[capability]) {
      throw new Error(`Generic media controller cannot ${operation}`)
    }
  }
}
