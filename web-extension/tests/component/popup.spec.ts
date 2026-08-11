import axe from 'axe-core'
import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import type { MediaPageState } from '../../src/application/media'
import type { RuntimeApiPort } from '../../src/application/runtime/runtime-api-port'
import { PopupApplication } from '../../src/application/ui'
import PopupApp from '../../src/ui/popup/PopupApp.vue'
import { FakeActiveTabPort } from '../test-support/fakes'
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

function createApi(permission: 'granted' | 'missing' = 'granted'): RuntimeApiPort {
  const settings = createSettingsEnvelope(3)
  let currentPermission = permission
  return {
    ping: vi.fn().mockResolvedValue({
      extensionVersion: '0.1.0',
      phase: 5,
      protocol: 1,
      settingsSchemaVersion: 2
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
    getSettings: vi.fn().mockResolvedValue({ settings, latestBackup: null }),
    updateSettings: vi.fn().mockResolvedValue({
      settings,
      changedPaths: ['global.enabled'],
      rebased: false
    }),
    exportSettings: vi.fn().mockResolvedValue('{}'),
    importSettings: vi.fn().mockResolvedValue({
      settings,
      changedPaths: ['global'],
      rebased: false
    }),
    restoreBackup: vi.fn().mockResolvedValue({
      settings,
      changedPaths: ['global'],
      rebased: false
    }),
    resetSettings: vi.fn().mockResolvedValue({
      settings,
      changedPaths: ['global'],
      rebased: false
    }),
    getSiteContext: vi.fn().mockImplementation(() =>
      Promise.resolve({
        tab: { id: 1, origin: 'https://example.com', hostname: 'example.com', protocol: 'https:' },
        permission: currentPermission,
        enabled: true,
        temporaryDisabled: false,
        mediaCount: currentPermission === 'granted' ? 1 : 0,
        activeMedia: currentPermission === 'granted',
        runtime: currentPermission === 'granted' ? 'ready' : 'unavailable',
        reason: currentPermission === 'granted' ? 'none' : 'permission-required'
      })
    ),
    setTemporarySiteDisabled: vi.fn().mockResolvedValue({ disabled: true }),
    reconcileSiteAccess: vi.fn().mockImplementation(() => {
      currentPermission = 'granted'
      return Promise.resolve({ registeredOrigins: 1, bootstrapped: true })
    }),
    getDiagnostics: vi.fn().mockRejectedValue(new Error('unused'))
  }
}

function renderPopup(api = createApi(), activeTab = new FakeActiveTabPort()) {
  const application = new PopupApplication(api, activeTab)
  return { api, activeTab, application, ...render(PopupApp, { props: { application } }) }
}

describe('PopupApp', () => {
  it('renders platform and active media state from the application facade', async () => {
    renderPopup()

    expect(screen.getByRole('heading', { name: 'H5Player 控制台' })).toBeTruthy()
    expect(await screen.findByText('媒体控制已就绪')).toBeTruthy()
    expect((await screen.findByTestId('active-media')).textContent).toContain('视频 · 已暂停')
    expect(screen.getByText('配置修订 3')).toBeTruthy()
  })

  it('dispatches media commands through PopupApplication', async () => {
    const api = createApi()
    const executeMediaCommand = vi.spyOn(api, 'executeMediaCommand')
    renderPopup(api)

    await fireEvent.click(await screen.findByRole('button', { name: '播放' }))
    expect(executeMediaCommand).toHaveBeenCalledTimes(1)
    expect(executeMediaCommand.mock.calls[0]?.[0]).toEqual({
      type: 'media.play',
      mediaId: 'media-0-1'
    })
    expect(executeMediaCommand.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('requests current-origin permission only after the user activates the onboarding button', async () => {
    const api = createApi('missing')
    const activeTab = new FakeActiveTabPort()
    const request = vi.spyOn(activeTab, 'requestOrigins')
    const reconcile = vi.spyOn(api, 'reconcileSiteAccess')
    renderPopup(api, activeTab)

    await fireEvent.click(await screen.findByRole('button', { name: '允许当前站点' }))
    expect(request).toHaveBeenCalledWith(['https://example.com/*'])
    expect(reconcile).toHaveBeenCalledWith(true, expect.any(Object))
    expect(await screen.findByText('媒体控制已就绪')).toBeTruthy()
  })

  it('has no automated accessibility violations in the ready state', async () => {
    const { container } = renderPopup()
    await screen.findByText('媒体控制已就绪')
    const result = await axe.run(container)
    expect(result.violations).toEqual([])
  })
})
