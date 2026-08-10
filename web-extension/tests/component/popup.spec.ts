import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import type { MediaPageState } from '../../src/application/media'
import type { RuntimeApiPort } from '../../src/application/runtime/runtime-api-port'
import PopupApp from '../../src/ui/popup/PopupApp.vue'
import { createSettingsEnvelope } from '../test-support/settings-fixtures'

const mediaState: MediaPageState = {
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
        duration: 120,
        currentTime: 10,
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

function createApi(): RuntimeApiPort {
  return {
    ping: vi.fn().mockResolvedValue({
      extensionVersion: '0.1.0',
      phase: 2,
      protocol: 1,
      settingsSchemaVersion: 1
    }),
    getMediaState: vi.fn().mockResolvedValue(mediaState),
    executeMediaCommand: vi.fn().mockResolvedValue({
      result: {
        ok: true,
        value: {
          commandType: 'media.play',
          mediaId: 'media-0-1',
          changed: true,
          snapshot: { ...mediaState.media[0], state: 'active' }
        }
      },
      state: {
        ...mediaState,
        revision: 2,
        media: [{ ...mediaState.media[0], state: 'active' }]
      }
    }),
    getSettings: vi.fn().mockResolvedValue({
      settings: createSettingsEnvelope(3),
      latestBackup: null
    }),
    updateSettings: vi.fn(),
    exportSettings: vi.fn(),
    importSettings: vi.fn(),
    restoreBackup: vi.fn()
  }
}

describe('PopupApp', () => {
  it('renders platform and active media state from the application port', async () => {
    render(PopupApp, { props: { api: createApi() } })

    expect(screen.getByRole('heading', { name: 'H5Player Web Extension' })).toBeTruthy()
    expect(await screen.findByText(/平台内核已连接/)).toBeTruthy()
    expect((await screen.findByTestId('active-media')).textContent).toContain('视频 · 已暂停')
    expect(screen.getByText('配置版本 3')).toBeTruthy()
  })

  it('dispatches media commands through RuntimeApiPort', async () => {
    const api = createApi()
    const executeMediaCommand = vi.spyOn(api, 'executeMediaCommand')
    render(PopupApp, { props: { api } })

    await fireEvent.click(await screen.findByRole('button', { name: '播放' }))
    expect(executeMediaCommand).toHaveBeenCalledTimes(1)
    expect(executeMediaCommand.mock.calls[0]?.[0]).toEqual({
      type: 'media.play',
      mediaId: 'media-0-1'
    })
    expect(executeMediaCommand.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })
})
