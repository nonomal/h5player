/* eslint-disable @typescript-eslint/unbound-method -- Native DOM intrinsics are intentionally captured and invoked with explicit receivers. */

type NativeGetter<T> = (target: HTMLMediaElement) => T
type NativeSetter<T> = (target: HTMLMediaElement, value: T) => void

interface NativeAccessor<T> {
  readonly get: NativeGetter<T> | null
  readonly set: NativeSetter<T> | null
}

function asError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? value : new Error(fallbackMessage)
}

function findDescriptor(
  prototype: object | null,
  property: PropertyKey
): PropertyDescriptor | null {
  let current: object | null = prototype
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, property)
    if (descriptor !== undefined) return descriptor
    current = Object.getPrototypeOf(current) as object | null
  }
  return null
}

function captureAccessor<T>(prototype: object | null, property: PropertyKey): NativeAccessor<T> {
  const descriptor = findDescriptor(prototype, property)
  const getter = descriptor?.get as ((this: HTMLMediaElement) => T) | undefined
  const setter = descriptor?.set as ((this: HTMLMediaElement, value: T) => void) | undefined
  return {
    get: getter === undefined ? null : (target) => getter.call(target),
    set: setter === undefined ? null : (target, value) => setter.call(target, value)
  }
}

const mediaPrototype = typeof HTMLMediaElement === 'undefined' ? null : HTMLMediaElement.prototype
const videoPrototype = typeof HTMLVideoElement === 'undefined' ? null : HTMLVideoElement.prototype
const elementPrototype = typeof Element === 'undefined' ? null : Element.prototype
const nodePrototype = typeof Node === 'undefined' ? null : Node.prototype
const htmlElementPrototype = typeof HTMLElement === 'undefined' ? null : HTMLElement.prototype

const playMethod = mediaPrototype?.play ?? null
const pauseMethod = mediaPrototype?.pause ?? null
const addEventListenerMethod =
  typeof EventTarget === 'undefined' ? null : EventTarget.prototype.addEventListener
const removeEventListenerMethod =
  typeof EventTarget === 'undefined' ? null : EventTarget.prototype.removeEventListener
const getBoundingClientRectMethod = elementPrototype?.getBoundingClientRect ?? null
const getAttributeMethod = elementPrototype?.getAttribute ?? null
const requestFullscreenMethod = elementPrototype?.requestFullscreen ?? null
const requestPictureInPictureMethod = videoPrototype?.requestPictureInPicture ?? null
const getRootNodeMethod = nodePrototype?.getRootNode ?? null
const getComputedStyleMethod =
  typeof Window === 'undefined' ? null : Window.prototype.getComputedStyle
const parentElementGetter = findDescriptor(nodePrototype, 'parentElement')?.get as
  ((this: Node) => HTMLElement | null) | undefined

const currentTimeAccessor = captureAccessor<number>(mediaPrototype, 'currentTime')
const durationAccessor = captureAccessor<number>(mediaPrototype, 'duration')
const volumeAccessor = captureAccessor<number>(mediaPrototype, 'volume')
const playbackRateAccessor = captureAccessor<number>(mediaPrototype, 'playbackRate')
const mutedAccessor = captureAccessor<boolean>(mediaPrototype, 'muted')
const pausedAccessor = captureAccessor<boolean>(mediaPrototype, 'paused')
const errorAccessor = captureAccessor<MediaError | null>(mediaPrototype, 'error')
const videoWidthAccessor = captureAccessor<number>(videoPrototype, 'videoWidth')
const videoHeightAccessor = captureAccessor<number>(videoPrototype, 'videoHeight')
const displayWidthAccessor = captureAccessor<number>(videoPrototype, 'width')
const displayHeightAccessor = captureAccessor<number>(videoPrototype, 'height')
const clientWidthAccessor = captureAccessor<number>(elementPrototype, 'clientWidth')
const clientHeightAccessor = captureAccessor<number>(elementPrototype, 'clientHeight')
const hiddenAccessor = captureAccessor<boolean>(htmlElementPrototype, 'hidden')
const isConnectedAccessor = captureAccessor<boolean>(nodePrototype, 'isConnected')
const localNameAccessor = captureAccessor<string>(elementPrototype, 'localName')

function readOr<T>(accessor: NativeAccessor<T>, target: HTMLMediaElement, fallback: T): T {
  if (accessor.get === null) return fallback
  try {
    return accessor.get(target)
  } catch {
    return fallback
  }
}

function nativeParentElement(element: Element): HTMLElement | null {
  if (parentElementGetter === undefined) return element.parentElement
  try {
    return parentElementGetter.call(element)
  } catch {
    return null
  }
}

function nativeRootNode(element: Element): Node | null {
  if (getRootNodeMethod === null) return null
  try {
    return getRootNodeMethod.call(element)
  } catch {
    return null
  }
}

export const nativeMediaBindings = Object.freeze({
  hasPlayback: playMethod !== null && pauseMethod !== null,
  hasSeek: currentTimeAccessor.set !== null,
  hasPlaybackRate: playbackRateAccessor.set !== null,
  hasVolume: volumeAccessor.set !== null,
  hasMute: mutedAccessor.set !== null,
  hasFullscreen: requestFullscreenMethod !== null,
  hasPictureInPicture: requestPictureInPictureMethod !== null,

  isMediaElement(target: unknown): target is HTMLMediaElement {
    if (typeof target !== 'object' || target === null || localNameAccessor.get === null)
      return false
    try {
      const media = target as HTMLMediaElement
      const localName = localNameAccessor.get(media)
      if (localName !== 'video' && localName !== 'audio') return false
      pausedAccessor.get?.(media)
      return true
    } catch {
      return false
    }
  },

  isVideo(element: HTMLMediaElement): element is HTMLVideoElement {
    return readOr(localNameAccessor, element, '') === 'video'
  },

  play(element: HTMLMediaElement): Promise<void> {
    if (playMethod === null) return Promise.reject(new Error('Native media play is unavailable'))
    try {
      return Promise.resolve(playMethod.call(element))
    } catch (error) {
      return Promise.reject(asError(error, 'Native media play failed'))
    }
  },

  pause(element: HTMLMediaElement): void {
    if (pauseMethod === null) throw new Error('Native media pause is unavailable')
    pauseMethod.call(element)
  },

  readCurrentTime: (element: HTMLMediaElement) => readOr(currentTimeAccessor, element, 0),
  readDuration: (element: HTMLMediaElement) => readOr(durationAccessor, element, Number.NaN),
  readVolume: (element: HTMLMediaElement) => readOr(volumeAccessor, element, 1),
  readPlaybackRate: (element: HTMLMediaElement) => readOr(playbackRateAccessor, element, 1),
  readMuted: (element: HTMLMediaElement) => readOr(mutedAccessor, element, false),
  readPaused: (element: HTMLMediaElement) => readOr(pausedAccessor, element, true),
  readError: (element: HTMLMediaElement) => readOr(errorAccessor, element, null),
  readVideoWidth: (element: HTMLMediaElement) => readOr(videoWidthAccessor, element, 0),
  readVideoHeight: (element: HTMLMediaElement) => readOr(videoHeightAccessor, element, 0),
  readDisplayWidth: (element: HTMLMediaElement) => readOr(displayWidthAccessor, element, 0),
  readDisplayHeight: (element: HTMLMediaElement) => readOr(displayHeightAccessor, element, 0),
  readClientWidth: (element: HTMLMediaElement) => readOr(clientWidthAccessor, element, 0),
  readClientHeight: (element: HTMLMediaElement) => readOr(clientHeightAccessor, element, 0),
  readHidden: (element: HTMLMediaElement) => readOr(hiddenAccessor, element, false),
  readIsConnected: (element: HTMLMediaElement) => readOr(isConnectedAccessor, element, false),

  writeCurrentTime(element: HTMLMediaElement, value: number): void {
    if (currentTimeAccessor.set === null) throw new Error('Native media seeking is unavailable')
    currentTimeAccessor.set(element, value)
  },

  writePlaybackRate(element: HTMLMediaElement, value: number): void {
    if (playbackRateAccessor.set === null) {
      throw new Error('Native media playback rate is unavailable')
    }
    playbackRateAccessor.set(element, value)
  },

  writeVolume(element: HTMLMediaElement, value: number): void {
    if (volumeAccessor.set === null) throw new Error('Native media volume is unavailable')
    volumeAccessor.set(element, value)
  },

  writeMuted(element: HTMLMediaElement, value: boolean): void {
    if (mutedAccessor.set === null) throw new Error('Native media mute is unavailable')
    mutedAccessor.set(element, value)
  },

  getBoundingClientRect(element: HTMLMediaElement): DOMRect | null {
    if (getBoundingClientRectMethod === null) return null
    try {
      return getBoundingClientRectMethod.call(element)
    } catch {
      return null
    }
  },

  isRendered(element: HTMLMediaElement): boolean {
    const view = element.ownerDocument.defaultView
    if (view === null || getComputedStyleMethod === null) return true
    const visited = new Set<Element>()
    let current: Element | null = element
    while (current !== null && !visited.has(current)) {
      visited.add(current)
      try {
        const style = getComputedStyleMethod.call(view, current)
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.visibility === 'collapse' ||
          (style.opacity.trim() !== '' && Number(style.opacity) === 0)
        ) {
          return false
        }
      } catch {
        return true
      }

      const parent = nativeParentElement(current)
      if (parent !== null) {
        current = parent
        continue
      }
      const root = nativeRootNode(current)
      current =
        root !== null && root.nodeType === 11 && 'host' in root ? (root as ShadowRoot).host : null
    }
    return true
  },

  getNumericAttribute(element: HTMLMediaElement, name: string): number {
    if (getAttributeMethod === null) return 0
    try {
      const value = getAttributeMethod.call(element, name)
      if (value === null || value.trim() === '') return 0
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    } catch {
      return 0
    }
  },

  addEventListener(
    element: HTMLMediaElement,
    type: string,
    listener: EventListener,
    capture = false
  ): void {
    if (addEventListenerMethod === null) return
    addEventListenerMethod.call(element, type, listener, capture)
  },

  removeEventListener(
    element: HTMLMediaElement,
    type: string,
    listener: EventListener,
    capture = false
  ): void {
    if (removeEventListenerMethod === null) return
    removeEventListenerMethod.call(element, type, listener, capture)
  }
})
