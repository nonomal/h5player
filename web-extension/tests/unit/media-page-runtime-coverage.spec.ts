import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { genericAdapter } from '../../src/adapters/generic'
import type { MediaDiscoveryUpdate } from '../../src/infrastructure/dom'
import { MediaPageRuntime } from '../../src/runtime/page-main/media-page-runtime'

const fakes = vi.hoisted(() => {
  let initialUpdate: unknown
  let discoveryListener: ((update: unknown) => void) | null = null
  let shadowCallback: ((root: ShadowRoot) => void) | null = null
  const unsubscribe = vi.fn()
  const teardownHook = vi.fn()
  const discovery = {
    refresh: vi.fn(),
    teardown: vi.fn(),
    subscribe: vi.fn((listener: (update: unknown) => void) => {
      discoveryListener = listener
      listener(initialUpdate)
      return unsubscribe
    })
  }
  const createDiscovery = vi.fn(() => discovery)
  const commandExecute = vi.fn<(command: unknown) => Promise<unknown>>()
  const createRegistry = vi.fn(() => ({ execute: commandExecute }))
  const installHook = vi.fn((_window: Window, callback: (root: ShadowRoot) => void) => {
    shadowCallback = callback
    return teardownHook
  })

  return {
    commandExecute,
    createDiscovery,
    createRegistry,
    discovery,
    getDiscoveryListener: () => discoveryListener,
    getShadowCallback: () => shadowCallback,
    installHook,
    teardownHook,
    unsubscribe,
    setInitialUpdate(update: unknown) {
      initialUpdate = update
    }
  }
})

vi.mock('../../src/infrastructure/dom', () => ({
  createDomMediaDiscoveryService: fakes.createDiscovery
}))

vi.mock('../../src/application/commands', () => ({
  createMediaCommandRegistry: fakes.createRegistry
}))

vi.mock('../../src/runtime/page-main/shadow-root-hook', () => ({
  installOpenShadowRootHook: fakes.installHook
}))

const capabilities = Object.freeze({
  playback: true,
  seek: true,
  playbackRate: true,
  volume: true,
  mute: true,
  fullscreen: false,
  pictureInPicture: false,
  capture: false,
  downloadExperimental: false
})

function mediaSnapshot(id = 'media-0-1') {
  return Object.freeze({
    id,
    frameId: 7,
    kind: 'video' as const,
    state: 'paused' as const,
    metrics: Object.freeze({
      width: 640,
      height: 360,
      duration: 120,
      currentTime: 10,
      volume: 1,
      playbackRate: 1,
      muted: false,
      visible: true
    }),
    capabilities,
    adapterId: 'generic',
    updatedAt: 50
  })
}

function discoveryUpdate(withMedia = true): MediaDiscoveryUpdate {
  const snapshot = mediaSnapshot()
  return {
    revision: 3,
    current: withMedia ? [snapshot] : [],
    active: withMedia ? snapshot : null,
    added: [],
    updated: [],
    removed: []
  }
}

const validCommandFailure = Object.freeze({
  ok: false as const,
  error: Object.freeze({
    code: 'MEDIA_NOT_FOUND' as const,
    messageKey: 'command.error.mediaNotFound' as const
  })
})

const runtimes: MediaPageRuntime[] = []

function createRuntime(now: () => number = () => 100): MediaPageRuntime {
  const runtime = new MediaPageRuntime(window, document, 7, now)
  runtimes.push(runtime)
  return runtime
}

beforeEach(() => {
  vi.clearAllMocks()
  fakes.setInitialUpdate(discoveryUpdate())
  fakes.commandExecute.mockResolvedValue(validCommandFailure)
})

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.teardown()
  document.body.replaceChildren()
})

describe('MediaPageRuntime lifecycle coverage', () => {
  it('publishes normalized state and refreshes for shadow and page-context events', () => {
    const now = () => -25
    const runtime = createRuntime(now)

    expect(fakes.createDiscovery).toHaveBeenCalledWith({
      root: document,
      adapter: genericAdapter,
      frameId: 7,
      now
    })
    expect(runtime.getState()).toEqual({
      frameId: 7,
      revision: 3,
      activeMediaId: 'media-0-1',
      media: [mediaSnapshot()],
      observedAt: 0
    })

    const shadow = document.createElement('div').attachShadow({ mode: 'open' })
    fakes.getShadowCallback()?.(shadow)
    window.dispatchEvent(new Event('pageshow'))
    window.dispatchEvent(new Event('popstate'))
    window.dispatchEvent(new Event('hashchange'))
    runtime.refresh()

    expect(fakes.discovery.refresh).toHaveBeenCalledTimes(5)
    fakes.getDiscoveryListener()?.(discoveryUpdate(false))
    expect(runtime.getState()).toMatchObject({ activeMediaId: null, media: [] })
  })

  it('executes commands, refreshes snapshots, and contains invalid command results', async () => {
    const runtime = createRuntime()
    const command = { type: 'media.play' as const, mediaId: 'media-0-1' }

    await expect(runtime.execute(command)).resolves.toMatchObject({
      result: validCommandFailure,
      state: { activeMediaId: 'media-0-1' }
    })
    expect(fakes.discovery.refresh).toHaveBeenCalledTimes(1)

    fakes.commandExecute.mockResolvedValueOnce({ invalid: true })
    await expect(runtime.execute(command)).rejects.toThrow()
    expect(fakes.discovery.refresh).toHaveBeenCalledTimes(2)

    fakes.commandExecute.mockRejectedValueOnce(new Error('registry unavailable'))
    await expect(runtime.execute(command)).rejects.toThrow('registry unavailable')
    expect(fakes.discovery.refresh).toHaveBeenCalledTimes(2)
  })

  it('tears down exactly once and rejects use after disposal', async () => {
    const runtime = createRuntime()
    runtime.teardown()
    runtime.teardown()

    expect(fakes.teardownHook).toHaveBeenCalledTimes(1)
    expect(fakes.unsubscribe).toHaveBeenCalledTimes(1)
    expect(fakes.discovery.teardown).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('pageshow'))
    runtime.refresh()
    expect(fakes.discovery.refresh).not.toHaveBeenCalled()
    expect(() => runtime.getState()).toThrow('Media page runtime is disposed')
    await expect(runtime.execute({ type: 'media.pause', mediaId: 'media-0-1' })).rejects.toThrow(
      'Media page runtime is disposed'
    )
  })

  it('rejects an invalid frame state at the serialization boundary', () => {
    const runtime = new MediaPageRuntime(window, document, -1, () => 1)
    runtimes.push(runtime)
    expect(() => runtime.getState()).toThrow()
  })
})
