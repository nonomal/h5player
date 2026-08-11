import { describe, expect, it, vi } from 'vitest'
import {
  HotkeyController,
  type HotkeyEventSourcePort,
  type HotkeyRuntimeEvent
} from '../../src/application/hotkeys'
import type { MediaPageState } from '../../src/application/media'
import { createDefaultSettings } from '../../src/domain/settings'

class FakeHotkeySource implements HotkeyEventSourcePort {
  private listener: ((event: HotkeyRuntimeEvent) => void) | null = null

  subscribe(listener: (event: HotkeyRuntimeEvent) => void): () => void {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  emit(event: HotkeyRuntimeEvent): void {
    this.listener?.(event)
  }
}

const state: MediaPageState = {
  frameId: 0,
  revision: 1,
  activeMediaId: 'media-0-1',
  observedAt: 1,
  media: [
    {
      id: 'media-0-1',
      frameId: 0,
      kind: 'video',
      state: 'paused',
      metrics: {
        width: 640,
        height: 360,
        duration: 100,
        currentTime: 20,
        volume: 0.5,
        playbackRate: 1,
        muted: false,
        visible: true
      },
      capabilities: {
        playback: true,
        seek: true,
        playbackRate: true,
        volume: true,
        mute: true,
        fullscreen: false,
        pictureInPicture: false,
        capture: false,
        downloadExperimental: false
      },
      adapterId: 'generic',
      updatedAt: 1
    }
  ]
}

function createEvent(code: string, editableTarget = false): HotkeyRuntimeEvent {
  return {
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    editableTarget,
    playerFocused: true,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  }
}

describe('HotkeyController', () => {
  it('dispatches typed commands, consumes only matched events, and stops cleanly', async () => {
    const source = new FakeHotkeySource()
    const execute = vi.fn().mockResolvedValue({ result: { ok: false }, state })
    const settings = createDefaultSettings().global
    const controller = new HotkeyController(
      source,
      { getState: vi.fn().mockResolvedValue(state), execute },
      settings
    )
    const stop = controller.start()

    const editable = createEvent('Space', true)
    source.emit(editable)
    expect(editable.preventDefault).not.toHaveBeenCalled()

    const matched = createEvent('Space')
    source.emit(matched)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
    expect(matched.preventDefault).toHaveBeenCalledOnce()
    expect(matched.stopPropagation).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith({ type: 'media.play', mediaId: 'media-0-1' })

    stop()
    source.emit(createEvent('ArrowRight'))
    await Promise.resolve()
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('serializes rapid repeatable commands and reports asynchronous failures', async () => {
    const source = new FakeHotkeySource()
    let activeExecutions = 0
    let maxExecutions = 0
    const execute = vi.fn().mockImplementation(async () => {
      activeExecutions += 1
      maxExecutions = Math.max(maxExecutions, activeExecutions)
      await Promise.resolve()
      activeExecutions -= 1
      return { result: { ok: false }, state }
    })
    const onError = vi.fn()
    const controller = new HotkeyController(
      source,
      { getState: vi.fn().mockResolvedValue(state), execute },
      createDefaultSettings().global,
      onError
    )
    controller.start()

    source.emit(createEvent('ArrowRight'))
    source.emit(createEvent('ArrowRight'))
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2))
    expect(maxExecutions).toBe(1)
    expect(onError).not.toHaveBeenCalled()

    execute.mockRejectedValueOnce(new Error('media failed'))
    source.emit(createEvent('ArrowLeft'))
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
  })
})
