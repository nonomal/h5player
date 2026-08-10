import { afterEach, describe, expect, it, vi } from 'vitest'
import { GenericAdapter } from '../../src/adapters/generic'
import { isMediaSnapshot } from '../../src/domain/media'

const adapter = new GenericAdapter()

function context(mediaId = 'media-0-1') {
  return {
    mediaId,
    frameId: 0,
    now: () => 1_234
  }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('GenericAdapter', () => {
  it('supports native video and audio elements and rejects unrelated DOM', () => {
    expect(adapter.supports(document.createElement('video'))).toBe(true)
    expect(adapter.supports(document.createElement('audio'))).toBe(true)
    expect(adapter.supports(document.createElement('div'))).toBe(false)
    expect(adapter.supports({ localName: 'video' })).toBe(false)
  })

  it('returns normalized serializable snapshots and explicit capabilities', async () => {
    const video = document.createElement('video')
    video.setAttribute('width', '640')
    video.setAttribute('height', '360')
    document.body.append(video)
    const controller = adapter.createController(video, context())

    await controller.seekTo(12)
    await controller.setPlaybackRate(100)
    await controller.setVolume(5)
    await controller.setMuted(true)

    const snapshot = controller.getSnapshot()
    expect(snapshot).toMatchObject({
      id: 'media-0-1',
      frameId: 0,
      kind: 'video',
      state: 'paused',
      adapterId: 'generic',
      updatedAt: 1_234,
      metrics: {
        width: 640,
        height: 360,
        duration: null,
        currentTime: 12,
        volume: 1,
        playbackRate: 16,
        muted: true,
        visible: true
      }
    })
    expect(snapshot.capabilities).toMatchObject({
      playback: true,
      seek: true,
      playbackRate: true,
      volume: true,
      mute: true,
      capture: false,
      downloadExperimental: false
    })
    expect(isMediaSnapshot(snapshot)).toBe(true)
    expect(() => JSON.stringify(snapshot)).not.toThrow()
    controller.teardown()
  })

  it('uses captured native methods and accessors despite hostile own-property overrides', async () => {
    const video = document.createElement('video')
    video.setAttribute('width', '640')
    video.setAttribute('height', '360')
    document.body.append(video)
    const hostilePlay = vi.fn(() => Promise.reject(new Error('hostile play')))
    const hostilePause = vi.fn(() => {
      throw new Error('hostile pause')
    })
    const hostileVolumeSet = vi.fn(() => {
      throw new Error('hostile volume')
    })
    const hostileEventMethod = vi.fn(() => {
      throw new Error('hostile event method')
    })
    Object.defineProperties(video, {
      play: { configurable: true, value: hostilePlay },
      pause: { configurable: true, value: hostilePause },
      addEventListener: { configurable: true, value: hostileEventMethod },
      removeEventListener: { configurable: true, value: hostileEventMethod },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ width: 9_999, height: 9_999 })
      },
      volume: {
        configurable: true,
        get: () => 99,
        set: hostileVolumeSet
      },
      paused: { configurable: true, get: () => true }
    })
    const controller = adapter.createController(video, context())
    const unsubscribe = controller.subscribe(() => undefined)

    await expect(controller.play()).resolves.toBeUndefined()
    expect(controller.getSnapshot().state).toBe('active')
    expect(controller.getSnapshot().metrics.width).toBe(640)
    await expect(controller.setVolume(0.4)).resolves.toBeUndefined()
    expect(controller.getSnapshot().metrics.volume).toBe(0.4)
    await expect(controller.pause()).resolves.toBeUndefined()
    expect(controller.getSnapshot().state).toBe('paused')
    expect(hostilePlay).not.toHaveBeenCalled()
    expect(hostilePause).not.toHaveBeenCalled()
    expect(hostileVolumeSet).not.toHaveBeenCalled()
    expect(hostileEventMethod).not.toHaveBeenCalled()
    unsubscribe()
    controller.teardown()
  })

  it('batches controller notifications and cancels queued work during teardown', () => {
    const video = document.createElement('video')
    document.body.append(video)
    const scheduled: Array<() => void> = []
    const controller = adapter.createController(video, {
      ...context(),
      schedule: (callback) => scheduled.push(callback)
    })
    const changes: Array<{ reason: string }> = []
    controller.subscribe((change) => changes.push(change))

    video.dispatchEvent(new Event('volumechange'))
    video.dispatchEvent(new Event('pointerdown'))
    video.dispatchEvent(new Event('timeupdate'))
    expect(scheduled).toHaveLength(1)
    scheduled[0]?.()
    expect(changes).toEqual([expect.objectContaining({ reason: 'interaction' })])

    video.dispatchEvent(new Event('play'))
    expect(scheduled).toHaveLength(2)
    controller.teardown()
    scheduled[1]?.()
    expect(changes).toHaveLength(1)
  })
})
