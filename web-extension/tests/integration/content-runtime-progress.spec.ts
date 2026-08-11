import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaCommandResultResponse, MediaPageState } from '../../src/application/media'
import type { MediaCommand } from '../../src/domain/command'
import { createMediaCapabilities, type MediaSnapshot } from '../../src/domain/media'
import { createProgressIdentity } from '../../src/domain/progress'
import { createDefaultSettings } from '../../src/domain/settings'
import { startContentRuntime } from '../../src/runtime/content/content-runtime'
import { PageBridgeError } from '../../src/runtime/content/page-bridge'
import { createRuntimeSuccess, parseRuntimeRequest } from '../../src/shared/protocol'
import { createTabRequest } from '../../src/shared/tab-protocol'
import { FakeTransport } from '../test-support/fakes'
import { createSettingsEnvelope } from '../test-support/settings-fixtures'

const bridgeFakes = vi.hoisted(() => ({
  configure: vi.fn((frameId: number) => {
    void frameId
    return Promise.resolve(true)
  }),
  execute: vi.fn<(command: MediaCommand) => Promise<MediaCommandResultResponse>>(),
  getState: vi.fn<() => Promise<MediaPageState>>(),
  ping: vi.fn(),
  start: vi.fn(() => Promise.resolve(true)),
  stateListener: null as ((summary: unknown) => void) | null,
  stop: vi.fn(),
  unsubscribe: vi.fn()
}))

vi.mock('../../src/runtime/content/page-bridge', () => {
  class PageBridgeError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message)
      this.name = 'PageBridgeError'
    }
  }

  return {
    PageBridgeError,
    PageBridge: class {
      start() {
        return bridgeFakes.start()
      }

      configure(frameId: number) {
        return bridgeFakes.configure(frameId)
      }

      ping() {
        bridgeFakes.ping()
      }

      getMediaState() {
        return bridgeFakes.getState()
      }

      executeMediaCommand(command: MediaCommand) {
        return bridgeFakes.execute(command)
      }

      subscribeMediaStateChanged(listener: (summary: unknown) => void) {
        bridgeFakes.stateListener = listener
        return bridgeFakes.unsubscribe
      }

      stop() {
        bridgeFakes.stop()
      }
    }
  }
})

function mediaSnapshot(
  currentTime: number,
  duration: number,
  state: MediaSnapshot['state'] = 'paused',
  updatedAt = 10_000
): MediaSnapshot {
  return {
    id: 'media-0-1',
    frameId: 0,
    kind: 'video',
    state,
    metrics: {
      width: 640,
      height: 360,
      duration,
      currentTime,
      volume: 1,
      playbackRate: 1,
      muted: false,
      visible: true
    },
    capabilities: createMediaCapabilities({
      playback: true,
      seek: true,
      playbackRate: true,
      volume: true,
      mute: true
    }),
    adapterId: 'generic',
    updatedAt
  }
}

function pageState(media: MediaSnapshot): MediaPageState {
  return {
    frameId: 0,
    revision: 1,
    activeMediaId: media.id,
    media: [media],
    observedAt: media.updatedAt
  }
}

function commandResponse(command: MediaCommand, media: MediaSnapshot): MediaCommandResultResponse {
  return {
    result: {
      ok: true,
      value: {
        commandType: command.type,
        mediaId: media.id,
        changed: true,
        snapshot: media
      }
    },
    state: pageState(media)
  }
}

function runtimeHarness(
  media: MediaSnapshot,
  options: Readonly<{
    restoreProgress: boolean
    restoredPosition?: number | null
    enabled?: boolean
    retainProgressDays?: number
    failRequestTypes?: readonly string[]
    progressSaved?: boolean
  }> = { restoreProgress: true }
) {
  const settings = createDefaultSettings()
  settings.global.enabled = options.enabled ?? true
  settings.global.media.restoreProgress = options.restoreProgress
  settings.global.diagnostics.retainProgressDays = options.retainProgressDays ?? 30
  const envelope = createSettingsEnvelope()
  envelope.data = settings
  const identity = createProgressIdentity({ pageUrl: window.location.href })
  if (!identity.ok) throw new Error(identity.error.code)
  const requestTypes: string[] = []
  const requestPayloads: unknown[] = []
  const transport = new FakeTransport((raw) => {
    const request = parseRuntimeRequest(raw)
    if (!request) return Promise.reject(new Error('invalid runtime request'))
    requestTypes.push(request.type)
    requestPayloads.push(request.payload)
    const context = request.sessionId ? { sessionId: request.sessionId } : {}
    const respond = (data: unknown) => Promise.resolve(createRuntimeSuccess(request, data, context))

    if (options.failRequestTypes?.includes(request.type)) {
      return Promise.reject(new Error(`failed request ${request.type}`))
    }

    switch (request.type) {
      case 'system.ping':
        return respond({
          extensionVersion: '0.1.0',
          phase: 5,
          protocol: 1,
          settingsSchemaVersion: 2,
          frameId: 0
        })
      case 'settings.get':
        return respond({ settings: envelope, latestBackup: null })
      case 'progress.read': {
        const position = options.restoredPosition ?? null
        return respond({
          record:
            position === null
              ? null
              : {
                  site: identity.value.site,
                  mediaKey: identity.value.mediaKey,
                  positionSeconds: position,
                  durationSeconds: media.metrics.duration,
                  updatedAt: 1_000,
                  expiresAt: 2_000_000_000_000
                },
          privacyBlocked: false,
          revision: 1,
          prunedCount: 0
        })
      }
      case 'progress.save':
        return respond({
          saved: options.progressSaved ?? true,
          privacyBlocked: false,
          record: {
            site: identity.value.site,
            mediaKey: identity.value.mediaKey,
            positionSeconds: media.metrics.currentTime,
            durationSeconds: media.metrics.duration,
            updatedAt: media.updatedAt,
            expiresAt: 2_000_000_000_000
          },
          revision: 2,
          prunedCount: 0,
          evictedCount: 0
        })
      case 'progress.delete':
        return respond({ deleted: true, revision: 2, prunedCount: 0 })
      case 'media.cross-tab.publish': {
        const payload = request.payload as {
          kind: 'playback-started' | 'playback-paused' | 'progress-saved'
          mediaKey: string
          observedAt: number
        }
        return respond({
          event: {
            eventId: 'event-identifier-0001',
            ...payload,
            sourceTabId: 1,
            sourceFrameId: 0
          },
          attemptedTabs: 0,
          deliveredTabs: 0
        })
      }
      default:
        return Promise.reject(new Error(`unexpected request ${request.type}`))
    }
  })

  bridgeFakes.getState.mockResolvedValue(pageState(media))
  bridgeFakes.execute.mockImplementation((command) =>
    Promise.resolve(commandResponse(command, media))
  )
  return { envelope, requestPayloads, requestTypes, transport }
}

beforeEach(() => {
  vi.clearAllMocks()
  bridgeFakes.start.mockResolvedValue(true)
  bridgeFakes.configure.mockResolvedValue(true)
  bridgeFakes.ping.mockImplementation(() => undefined)
  bridgeFakes.stop.mockImplementation(() => undefined)
  bridgeFakes.unsubscribe.mockImplementation(() => undefined)
  bridgeFakes.stateListener = null
  window.history.replaceState({}, '', '/watch')
})

afterEach(() => {
  delete document.documentElement.dataset['h5playerWebextContent']
  delete document.documentElement.dataset['h5playerWebextBridge']
  delete document.documentElement.dataset['h5playerWebextBackground']
  delete document.documentElement.dataset['h5playerWebextMedia']
})

describe('content runtime progress and advisory orchestration', () => {
  it('returns a safe unavailable handle when the document has no root element', async () => {
    const runtime = await startContentRuntime({
      window,
      document: { documentElement: null } as unknown as Document,
      extensionId: 'extension-id',
      transport: new FakeTransport(() => Promise.reject(new Error('transport must not run'))),
      injectPageMain: () => Promise.resolve()
    })

    await expect(runtime.handleTabMessage({}, { id: 'extension-id' })).resolves.toBeNull()
    await expect(runtime.getMediaState()).rejects.toMatchObject({
      code: 'PAGE_RUNTIME_UNAVAILABLE'
    })
    await expect(
      runtime.executeMediaCommand({ type: 'media.play', mediaId: 'media-0-1' })
    ).rejects.toMatchObject({ code: 'PAGE_RUNTIME_UNAVAILABLE' })
    expect(runtime.teardown()).toBeUndefined()
  })

  it('keeps page control isolated when background ping is unavailable', async () => {
    const media = mediaSnapshot(0, 120)
    const harness = runtimeHarness(media, {
      restoreProgress: false,
      failRequestTypes: ['system.ping']
    })
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    expect(document.documentElement.dataset['h5playerWebextBackground']).toBe('failed')
    expect(document.documentElement.dataset['h5playerWebextBridge']).toBe('ready')
    expect(document.documentElement.dataset['h5playerWebextMedia']).toBe('ready')
    expect(harness.transport.reconnectCount).toBe(1)
    runtime.teardown()
  })

  it('reports an unavailable runtime when page bridge startup does not complete', async () => {
    const media = mediaSnapshot(0, 120)
    const harness = runtimeHarness(media, { restoreProgress: false })
    bridgeFakes.start.mockResolvedValueOnce(false)
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    expect(document.documentElement.dataset['h5playerWebextBridge']).toBe('failed')
    expect(document.documentElement.dataset['h5playerWebextMedia']).toBe('failed')
    expect(bridgeFakes.configure).not.toHaveBeenCalled()
    expect(bridgeFakes.stateListener).toBeNull()
    await expect(runtime.getMediaState()).rejects.toMatchObject({
      code: 'PAGE_RUNTIME_UNAVAILABLE'
    })

    const response = await runtime.handleTabMessage(createTabRequest('site.get-state', {}), {
      id: 'extension-id'
    })
    expect(response).toMatchObject({
      type: 'protocol.response',
      payload: { data: { ready: false, mediaCount: 0, activeMedia: false } }
    })
    runtime.teardown()
  })

  it('contains bridge configuration failures without exposing a partial runtime', async () => {
    const media = mediaSnapshot(0, 120)
    const harness = runtimeHarness(media, { restoreProgress: false })
    bridgeFakes.configure.mockRejectedValueOnce(new Error('configuration failed'))
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    expect(document.documentElement.dataset['h5playerWebextBridge']).toBe('ready')
    expect(document.documentElement.dataset['h5playerWebextMedia']).toBe('failed')
    expect(bridgeFakes.ping).not.toHaveBeenCalled()
    await expect(
      runtime.executeMediaCommand({ type: 'media.play', mediaId: media.id })
    ).rejects.toMatchObject({ code: 'PAGE_RUNTIME_UNAVAILABLE' })
    runtime.teardown()
  })

  it('fails closed when settings cannot be loaded', async () => {
    const media = mediaSnapshot(0, 120)
    const harness = runtimeHarness(media, {
      restoreProgress: false,
      failRequestTypes: ['settings.get']
    })
    const onRuntimeStateChanged = vi.fn()
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve(),
      onRuntimeStateChanged
    })

    expect(harness.transport.reconnectCount).toBe(1)
    expect(onRuntimeStateChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: false, siteEnabled: false, mediaState: null })
    )
    await expect(runtime.getMediaState()).rejects.toMatchObject({
      code: 'PAGE_RUNTIME_UNAVAILABLE'
    })
    runtime.teardown()
  })

  it('restores a stored position through a bounded relative seek', async () => {
    const media = mediaSnapshot(0, 120)
    const harness = runtimeHarness(media, { restoreProgress: true, restoredPosition: 42 })
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(bridgeFakes.execute).toHaveBeenCalledWith({
        type: 'media.seek',
        mediaId: media.id,
        deltaSeconds: 42
      })
    })
    expect(harness.requestTypes).toContain('progress.read')
    expect(harness.requestTypes).not.toContain('progress.save')
    runtime.teardown()
  })

  it('deletes completed short-media progress before applying the three-second save floor', async () => {
    const media = mediaSnapshot(1, 4)
    const harness = runtimeHarness(media, { restoreProgress: true, restoredPosition: null })
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    await vi.waitFor(() => expect(harness.requestTypes).toContain('progress.delete'))
    expect(harness.requestTypes).not.toContain('progress.save')
    runtime.teardown()
  })

  it('publishes local playback events and accepts typed advisory events from background', async () => {
    const media = mediaSnapshot(10, 120, 'active')
    const harness = runtimeHarness(media, { restoreProgress: false })
    const onCrossTabEvent = vi.fn()
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve(),
      onCrossTabEvent
    })

    await runtime.executeMediaCommand({ type: 'media.play', mediaId: media.id })
    await vi.waitFor(() => expect(harness.requestTypes).toContain('media.cross-tab.publish'))
    expect(
      harness.requestPayloads.find(
        (payload) =>
          typeof payload === 'object' &&
          payload !== null &&
          (payload as { kind?: unknown }).kind === 'playback-started'
      )
    ).toBeDefined()

    const response = await runtime.handleTabMessage(
      createTabRequest('media.cross-tab.event', {
        event: {
          eventId: 'incoming-event-0001',
          kind: 'playback-paused',
          mediaKey: 'page:fnv1a64:01234567',
          sourceTabId: 2,
          sourceFrameId: 0,
          observedAt: 9_000
        }
      }),
      { id: 'extension-id' }
    )
    expect(response).toMatchObject({ type: 'protocol.response' })
    expect(onCrossTabEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'playback-paused', sourceTabId: 2 })
    )
    runtime.teardown()
  })

  it('authenticates, validates, and replay-protects tab messages', async () => {
    const media = mediaSnapshot(10, 120, 'active')
    const harness = runtimeHarness(media, { restoreProgress: false })
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    await expect(
      runtime.handleTabMessage({ unexpected: true }, { id: 'extension-id' })
    ).resolves.toBeNull()

    const unauthorizedRequest = createTabRequest('site.get-state', {})
    await expect(
      runtime.handleTabMessage(unauthorizedRequest, { id: 'other-extension' })
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'UNAUTHORIZED_SOURCE', retryable: false } }
    })

    const replayedRequest = createTabRequest('site.get-state', {})
    await expect(
      runtime.handleTabMessage(replayedRequest, { id: 'extension-id' })
    ).resolves.toMatchObject({
      type: 'protocol.response'
    })
    await expect(
      runtime.handleTabMessage(replayedRequest, { id: 'extension-id' })
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'REPLAY_DETECTED' } }
    })

    await expect(
      runtime.handleTabMessage(createTabRequest('media.cross-tab.event', { event: null }), {
        id: 'extension-id'
      })
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'INVALID_PAYLOAD' } }
    })
    runtime.teardown()
  })

  it('applies temporary disable and permission revocation as immediate runtime boundaries', async () => {
    const media = mediaSnapshot(10, 120, 'active')
    const harness = runtimeHarness(media, { restoreProgress: false })
    const onRuntimeStateChanged = vi.fn()
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve(),
      onRuntimeStateChanged
    })

    await expect(
      runtime.handleTabMessage(
        createTabRequest('site.set-temporary-disabled', { disabled: 'yes' }),
        { id: 'extension-id' }
      )
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'INVALID_PAYLOAD' } }
    })

    await expect(
      runtime.handleTabMessage(
        createTabRequest('site.set-temporary-disabled', { disabled: true }),
        { id: 'extension-id' }
      )
    ).resolves.toMatchObject({
      type: 'protocol.response',
      payload: { data: { disabled: true } }
    })
    await expect(runtime.getMediaState()).rejects.toMatchObject({
      code: 'PAGE_RUNTIME_UNAVAILABLE'
    })
    await expect(
      runtime.handleTabMessage(createTabRequest('media.get-state', {}), {
        id: 'extension-id'
      })
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'PAGE_RUNTIME_UNAVAILABLE', retryable: true } }
    })

    await expect(
      runtime.handleTabMessage(
        createTabRequest('site.set-temporary-disabled', { disabled: false }),
        { id: 'extension-id' }
      )
    ).resolves.toMatchObject({
      type: 'protocol.response',
      payload: { data: { disabled: false } }
    })
    await expect(runtime.getMediaState()).resolves.toEqual(pageState(media))

    await expect(
      runtime.handleTabMessage(createTabRequest('site.permission-revoked', {}), {
        id: 'extension-id'
      })
    ).resolves.toMatchObject({
      type: 'protocol.response',
      payload: { data: { disabled: true } }
    })
    expect(bridgeFakes.unsubscribe).toHaveBeenCalled()
    expect(bridgeFakes.stop).toHaveBeenCalled()
    expect(onRuntimeStateChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ ready: false, mediaReady: false, temporaryDisabled: true })
    )
    await expect(
      runtime.executeMediaCommand({ type: 'media.play', mediaId: media.id })
    ).rejects.toMatchObject({ code: 'PAGE_RUNTIME_UNAVAILABLE' })
    runtime.teardown()
  })

  it('serves typed media requests and maps page bridge failures to bounded protocol errors', async () => {
    const media = mediaSnapshot(10, 120, 'active')
    const harness = runtimeHarness(media, { restoreProgress: false })
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    await expect(
      runtime.handleTabMessage(createTabRequest('media.get-state', { extra: true }), {
        id: 'extension-id'
      })
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'INVALID_PAYLOAD' } }
    })
    await expect(
      runtime.handleTabMessage(createTabRequest('media.get-state', {}), {
        id: 'extension-id'
      })
    ).resolves.toMatchObject({
      type: 'protocol.response',
      payload: { data: { activeMediaId: media.id } }
    })
    await expect(
      runtime.handleTabMessage(createTabRequest('media.execute', {}), {
        id: 'extension-id'
      })
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'INVALID_PAYLOAD' } }
    })
    await expect(
      runtime.handleTabMessage(
        createTabRequest('media.execute', {
          command: { type: 'media.play', mediaId: media.id }
        }),
        { id: 'extension-id' }
      )
    ).resolves.toMatchObject({
      type: 'protocol.response',
      payload: { data: { result: { ok: true } } }
    })

    bridgeFakes.getState.mockRejectedValueOnce(
      new PageBridgeError('REQUEST_TIMEOUT', 'bridge timed out')
    )
    await expect(
      runtime.handleTabMessage(createTabRequest('media.get-state', {}), {
        id: 'extension-id'
      })
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'PAGE_RUNTIME_UNAVAILABLE', retryable: true } }
    })

    bridgeFakes.execute.mockRejectedValueOnce(
      new PageBridgeError('INVALID_RESPONSE', 'invalid bridge response')
    )
    await expect(
      runtime.handleTabMessage(
        createTabRequest('media.execute', {
          command: { type: 'media.pause', mediaId: media.id }
        }),
        { id: 'extension-id' }
      )
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'INTERNAL_ERROR', retryable: false } }
    })

    bridgeFakes.execute.mockRejectedValueOnce(new Error('unexpected page failure'))
    await expect(
      runtime.handleTabMessage(
        createTabRequest('media.execute', {
          command: { type: 'media.pause', mediaId: media.id }
        }),
        { id: 'extension-id' }
      )
    ).resolves.toMatchObject({
      type: 'protocol.error',
      payload: { error: { code: 'INTERNAL_ERROR', retryable: false } }
    })
    runtime.teardown()
  })

  it('refreshes settings subscriptions and clears disabled-site media state', async () => {
    const media = mediaSnapshot(10, 120, 'active')
    const harness = runtimeHarness(media, { restoreProgress: false })
    const settingsListeners: Array<() => void> = []
    const settingsTeardown = vi.fn()
    const onRuntimeStateChanged = vi.fn()
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve(),
      subscribeSettings: (listener) => {
        settingsListeners.push(listener)
        return settingsTeardown
      },
      onRuntimeStateChanged
    })

    await vi.waitFor(() =>
      expect(onRuntimeStateChanged).toHaveBeenCalledWith(
        expect.objectContaining({ siteEnabled: true, mediaState: pageState(media) })
      )
    )
    harness.envelope.data.global.enabled = false
    settingsListeners[0]?.()
    await vi.waitFor(() =>
      expect(onRuntimeStateChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ ready: false, siteEnabled: false, mediaState: null })
      )
    )
    await expect(runtime.getMediaState()).rejects.toMatchObject({
      code: 'PAGE_RUNTIME_UNAVAILABLE'
    })

    runtime.teardown()
    expect(settingsTeardown).toHaveBeenCalledOnce()
  })

  it('saves pause progress immediately and throttles repeated advisory refreshes', async () => {
    const active = mediaSnapshot(12, 120, 'active', 10_000)
    const paused = mediaSnapshot(13, 120, 'paused', 11_000)
    const repeatedPause = mediaSnapshot(14, 120, 'paused', 12_000)
    const harness = runtimeHarness(active, { restoreProgress: true, restoredPosition: null })
    const onMediaStateChanged = vi.fn()
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve(),
      onMediaStateChanged
    })

    await vi.waitFor(() =>
      expect(
        harness.requestTypes.filter((requestType) => requestType === 'progress.save')
      ).toHaveLength(1)
    )
    await vi.waitFor(() =>
      expect(onMediaStateChanged).toHaveBeenCalledWith(pageState(active), expect.anything())
    )
    bridgeFakes.getState.mockResolvedValue(pageState(paused))
    bridgeFakes.stateListener?.({})
    await vi.waitFor(() =>
      expect(
        harness.requestTypes.filter((requestType) => requestType === 'progress.save')
      ).toHaveLength(2)
    )

    bridgeFakes.getState.mockResolvedValue(pageState(repeatedPause))
    bridgeFakes.stateListener?.({})
    await vi.waitFor(() =>
      expect(onMediaStateChanged).toHaveBeenCalledWith(pageState(repeatedPause), expect.anything())
    )
    expect(
      harness.requestTypes.filter((requestType) => requestType === 'progress.save')
    ).toHaveLength(2)
    runtime.teardown()
  })

  it('publishes pause progress, applies seek and rate save policy, and preserves failed commands', async () => {
    const media = mediaSnapshot(20, 120, 'paused', 20_000)
    const harness = runtimeHarness(media, { restoreProgress: true, restoredPosition: null })
    const runtime = await startContentRuntime({
      window,
      document,
      extensionId: 'extension-id',
      transport: harness.transport,
      injectPageMain: () => Promise.resolve()
    })

    await runtime.executeMediaCommand({ type: 'media.pause', mediaId: media.id })
    await runtime.executeMediaCommand({
      type: 'media.seek',
      mediaId: media.id,
      deltaSeconds: 5
    })
    await runtime.executeMediaCommand({ type: 'media.set-rate', mediaId: media.id, value: 1.5 })

    bridgeFakes.execute.mockResolvedValueOnce({
      result: {
        ok: false,
        error: {
          code: 'CAPABILITY_UNAVAILABLE',
          messageKey: 'command.error.capabilityUnavailable'
        }
      },
      state: pageState(media)
    })
    await expect(
      runtime.executeMediaCommand({ type: 'media.toggle-picture-in-picture', mediaId: media.id })
    ).resolves.toMatchObject({ result: { ok: false } })

    expect(
      harness.requestPayloads.some(
        (payload) =>
          typeof payload === 'object' &&
          payload !== null &&
          (payload as { kind?: unknown }).kind === 'playback-paused'
      )
    ).toBe(true)
    expect(harness.requestTypes).toContain('progress.save')
    runtime.teardown()
  })
})
