import { systemPingResponseSchema } from '../../application/settings/contracts'
import { settingsSnapshotResponseSchema } from '../../application/settings/contracts'
import { HotkeyController } from '../../application/hotkeys'
import {
  crossTabMediaEventSchema,
  crossTabEventPayloadSchema,
  crossTabPublishResponseSchema,
  mediaExecutePayloadSchema,
  mediaGetStatePayloadSchema,
  mediaPageStateSchema,
  mediaCommandResultResponseSchema
} from '../../application/media'
import type { CrossTabMediaEvent } from '../../application/media'
import type { MediaCommandResultResponse } from '../../application/media'
import {
  progressDeleteResponseSchema,
  progressReadResponseSchema,
  progressSaveResponseSchema
} from '../../application/progress'
import { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import { RuntimeRequestClient } from '../../infrastructure/messaging/request-client'
import { systemClock, systemScheduler } from '../../infrastructure/time/system-time'
import { createSessionId, createSessionNonce } from '../../shared/ids'
import {
  createTabError,
  createTabSuccess,
  parseTabRequest,
  type TabRequestEnvelope
} from '../../shared/tab-protocol'
import { PageBridge, PageBridgeError } from './page-bridge'
import { DomHotkeyEventSource } from '../../infrastructure/dom'
import { resolveSettings } from '../../domain/settings'
import type { GlobalSettings } from '../../domain/settings'
import { createProgressIdentity } from '../../domain/progress'
import type { MediaPageState } from '../../application/media'
import type { MediaCommand } from '../../domain/command'
import type { Teardown } from '../../application/ports/browser'
import {
  siteRuntimeStateResponseSchema,
  siteTemporaryDisablePayloadSchema,
  siteTemporaryDisableResponseSchema
} from '../../application/site/contracts'

type ContentRuntimeOptions = {
  window: Window
  document: Document
  extensionId: string
  transport: ConstructorParameters<typeof RuntimeRequestClient>[1]
  injectPageMain: () => Promise<void>
  subscribeSettings?: (listener: () => void) => Teardown
  onMediaStateChanged?: (state: MediaPageState, settings: GlobalSettings) => void
  onRuntimeStateChanged?: (state: ContentRuntimeSnapshot) => void
  onCrossTabEvent?: (event: CrossTabMediaEvent) => void
}

export type ContentMessageSender = {
  readonly id?: string
}

export type ContentRuntimeSnapshot = Readonly<{
  readonly ready: boolean
  readonly mediaReady: boolean
  readonly siteEnabled: boolean
  readonly temporaryDisabled: boolean
  readonly settings: GlobalSettings
  readonly mediaState: MediaPageState | null
}>

export type ContentRuntimeHandle = {
  readonly handleTabMessage: (rawMessage: unknown, sender: ContentMessageSender) => Promise<unknown>
  readonly getMediaState: () => Promise<MediaPageState>
  readonly executeMediaCommand: (command: MediaCommand) => Promise<MediaCommandResultResponse>
  readonly teardown: () => void
}

function bridgeFailure(request: TabRequestEnvelope, error: unknown): unknown {
  if (error instanceof PageBridgeError) {
    const unavailable =
      error.code === 'BRIDGE_UNAVAILABLE' ||
      error.code === 'PAGE_RUNTIME_UNAVAILABLE' ||
      error.code === 'REQUEST_TIMEOUT'
    return createTabError(
      request,
      unavailable ? 'PAGE_RUNTIME_UNAVAILABLE' : 'INTERNAL_ERROR',
      unavailable ? 'media.error.runtime-unavailable' : 'media.error.internal',
      unavailable
    )
  }
  return createTabError(request, 'INTERNAL_ERROR', 'media.error.internal')
}

export async function startContentRuntime(
  options: ContentRuntimeOptions
): Promise<ContentRuntimeHandle> {
  const root = options.document.documentElement
  if (!root) {
    return {
      handleTabMessage: () => Promise.resolve(null),
      getMediaState: () =>
        Promise.reject(
          new PageBridgeError('PAGE_RUNTIME_UNAVAILABLE', 'Content runtime unavailable')
        ),
      executeMediaCommand: () =>
        Promise.reject(
          new PageBridgeError('PAGE_RUNTIME_UNAVAILABLE', 'Content runtime unavailable')
        ),
      teardown: () => undefined
    }
  }

  const sessionId = createSessionId()
  const nonce = createSessionNonce()
  const runtime = new RuntimeRequestClient('content', options.transport, systemScheduler, {
    sessionId
  })
  let frameId = 0

  root.dataset['h5playerWebextContent'] = 'ready'
  try {
    const ping = await runtime.request('system.ping', {}, systemPingResponseSchema)
    frameId = ping.frameId ?? 0
    root.dataset['h5playerWebextBackground'] = 'ready'
  } catch {
    root.dataset['h5playerWebextBackground'] = 'failed'
  }

  const bridge = new PageBridge({
    window: options.window,
    session: { sessionId, nonce, origin: options.window.location.origin },
    replayGuard: new ReplayGuard(systemClock),
    scheduler: systemScheduler,
    injectPageMain: options.injectPageMain
  })

  const bridgeReady = await bridge.start()
  root.dataset['h5playerWebextBridge'] = bridgeReady ? 'ready' : 'failed'
  let mediaReady = false
  if (bridgeReady) {
    try {
      mediaReady = await bridge.configure(frameId)
      bridge.ping()
    } catch {
      mediaReady = false
    }
  }
  root.dataset['h5playerWebextMedia'] = mediaReady ? 'ready' : 'failed'

  const tabReplayGuard = new ReplayGuard(systemClock)
  let temporaryDisabled = false
  let siteEnabled = false
  let latestMediaState: MediaPageState | null = null
  let effectiveSettings: GlobalSettings = {
    enabled: false,
    ui: { overlayEnabled: false, theme: 'system', locale: 'zh-CN' },
    hotkeys: { enabled: false, scope: 'page', bindings: {} },
    media: { defaultPlaybackRate: 1, defaultVolume: 1, restoreProgress: false },
    policies: {
      protectPlaybackRate: false,
      protectCurrentTime: false,
      protectVolume: false,
      allowExperimental: false
    },
    diagnostics: { localLogLevel: 'error', retainProgressDays: 0 }
  }
  const restoredProgressKeys = new Set<string>()
  const progressSaveAt = new Map<string, number>()
  let progressRefreshQueued = false
  let lastObservedMediaState: MediaPageState | null = null
  let stateSubscription: Teardown | null = null
  const hotkeySource = new DomHotkeyEventSource(options.window, options.document)
  const hotkeys = new HotkeyController(
    hotkeySource,
    {
      getState: () => bridge.getMediaState(),
      execute: (command) => executeMediaCommand(command)
    },
    {
      ...effectiveSettings
    }
  )
  let settingsTeardown: Teardown | null = null

  function notifyRuntimeState(): void {
    options.onRuntimeStateChanged?.({
      ready: mediaReady && siteEnabled && !temporaryDisabled,
      mediaReady,
      siteEnabled,
      temporaryDisabled,
      settings: effectiveSettings,
      mediaState: latestMediaState
    })
  }

  function progressInput(): {
    readonly pageUrl: string
    readonly mediaKey: string
  } | null {
    const pageUrl = options.window.location.href
    const identity = createProgressIdentity({
      pageUrl
    })
    if (!identity.ok) return null
    return {
      pageUrl,
      mediaKey: identity.value.mediaKey
    }
  }

  async function publishCrossTab(
    kind: 'playback-started' | 'playback-paused' | 'progress-saved',
    snapshot: MediaPageState['media'][number]
  ): Promise<void> {
    const identity = progressInput()
    if (!identity) return
    try {
      await runtime.request(
        'media.cross-tab.publish',
        {
          kind,
          mediaKey: identity.mediaKey,
          observedAt: Math.max(0, snapshot.updatedAt)
        },
        crossTabPublishResponseSchema
      )
    } catch {
      // Cross-tab delivery is advisory; local media control remains authoritative.
    }
  }

  async function restoreProgress(state: MediaPageState): Promise<void> {
    if (
      !effectiveSettings.media.restoreProgress ||
      effectiveSettings.diagnostics.retainProgressDays <= 0
    ) {
      return
    }
    const active = state.media.find((snapshot) => snapshot.id === state.activeMediaId)
    if (!active || active.metrics.currentTime > 3) return
    const identity = progressInput()
    if (!identity || restoredProgressKeys.has(identity.mediaKey)) return
    restoredProgressKeys.add(identity.mediaKey)
    try {
      const result = await runtime.request(
        'progress.read',
        { pageUrl: identity.pageUrl },
        progressReadResponseSchema
      )
      if (result.privacyBlocked || result.record === null) return
      const position = result.record.positionSeconds
      const duration = active.metrics.duration
      if (position <= 3 || (duration !== null && position >= duration - 5)) return
      await bridge.executeMediaCommand({
        type: 'media.seek',
        mediaId: active.id,
        deltaSeconds: position - active.metrics.currentTime
      })
    } catch {
      // Progress restoration must never block media startup.
    }
  }

  async function saveProgress(
    snapshot: MediaPageState['media'][number],
    force = false
  ): Promise<void> {
    if (
      !effectiveSettings.media.restoreProgress ||
      effectiveSettings.diagnostics.retainProgressDays <= 0
    ) {
      return
    }
    const identity = progressInput()
    if (!identity) return
    const duration = snapshot.metrics.duration
    if (duration !== null && snapshot.metrics.currentTime >= duration - 5) {
      try {
        await runtime.request(
          'progress.delete',
          { pageUrl: identity.pageUrl },
          progressDeleteResponseSchema
        )
      } catch {
        // Progress is best-effort and must not change command success semantics.
      }
      return
    }
    if (snapshot.metrics.currentTime <= 3) return
    const now = Math.max(0, snapshot.updatedAt)
    const lastSaved = progressSaveAt.get(identity.mediaKey) ?? 0
    if (!force && now - lastSaved < 5_000) return
    progressSaveAt.set(identity.mediaKey, now)
    try {
      const result = await runtime.request(
        'progress.save',
        {
          pageUrl: identity.pageUrl,
          positionSeconds: snapshot.metrics.currentTime,
          durationSeconds: duration
        },
        progressSaveResponseSchema
      )
      if (result.saved) await publishCrossTab('progress-saved', snapshot)
    } catch {
      // Progress is best-effort and must not change command success semantics.
    }
  }

  async function refreshMediaStateFromPage(): Promise<void> {
    if (!mediaReady || temporaryDisabled || !siteEnabled) return
    if (progressRefreshQueued) return
    progressRefreshQueued = true
    try {
      const state = await bridge.getMediaState()
      latestMediaState = state
      await restoreProgress(state)
      const active = state.media.find((snapshot) => snapshot.id === state.activeMediaId)
      const previousActive = lastObservedMediaState?.media.find(
        (snapshot) => snapshot.id === active?.id
      )
      if (active && (active.state === 'active' || active.state === 'paused')) {
        const justPaused = active.state === 'paused' && previousActive?.state !== 'paused'
        await saveProgress(active, justPaused)
      }
      lastObservedMediaState = state
      options.onMediaStateChanged?.(state, effectiveSettings)
      notifyRuntimeState()
    } catch {
      // State notifications can arrive while a page runtime is restarting.
    } finally {
      progressRefreshQueued = false
    }
  }

  async function executeMediaCommand(command: MediaCommand) {
    const response = await bridge.executeMediaCommand(command)
    if (response.result.ok) {
      const snapshot = response.result.value.snapshot
      if (command.type === 'media.play') await publishCrossTab('playback-started', snapshot)
      if (command.type === 'media.pause') {
        await publishCrossTab('playback-paused', snapshot)
        await saveProgress(snapshot, true)
      }
      if (command.type === 'media.seek' || command.type === 'media.set-rate') {
        await saveProgress(snapshot)
      }
    }
    latestMediaState = response.state
    lastObservedMediaState = response.state
    options.onMediaStateChanged?.(response.state, effectiveSettings)
    notifyRuntimeState()
    return response
  }

  const refreshSettings = async (): Promise<void> => {
    try {
      const snapshot = await runtime.request('settings.get', {}, settingsSnapshotResponseSchema)
      const currentSettings = resolveSettings(
        snapshot.settings.data,
        options.window.location.origin
      )
      effectiveSettings = currentSettings
      siteEnabled = currentSettings.enabled
      hotkeys.update({
        ...currentSettings,
        enabled: currentSettings.enabled && !temporaryDisabled
      })
      if (currentSettings.enabled && !temporaryDisabled && mediaReady) hotkeys.start()
      else hotkeys.stop()
      latestMediaState = currentSettings.enabled ? latestMediaState : null
      if (!currentSettings.enabled) lastObservedMediaState = null
      notifyRuntimeState()
      if (mediaReady) void refreshMediaStateFromPage()
    } catch {
      siteEnabled = false
      latestMediaState = null
      lastObservedMediaState = null
      hotkeys.stop()
      notifyRuntimeState()
    }
  }

  await refreshSettings()
  settingsTeardown =
    options.subscribeSettings?.(() => {
      void refreshSettings()
    }) ?? null
  if (mediaReady) {
    stateSubscription = bridge.subscribeMediaStateChanged(() => {
      void refreshMediaStateFromPage()
    })
    void refreshMediaStateFromPage()
  }

  const handleTabMessage = async (
    rawMessage: unknown,
    sender: ContentMessageSender
  ): Promise<unknown> => {
    const request = parseTabRequest(rawMessage)
    if (!request) return null
    if (sender.id !== options.extensionId) {
      return createTabError(request, 'UNAUTHORIZED_SOURCE', 'protocol.error.unauthorized-source')
    }
    if (!tabReplayGuard.accept(`background:${sessionId}`, request.requestId)) {
      return createTabError(request, 'REPLAY_DETECTED', 'protocol.error.replay-detected')
    }
    try {
      if (request.type === 'media.cross-tab.event') {
        const payload = crossTabEventPayloadSchema.safeParse(request.payload)
        if (!payload.success) {
          return createTabError(request, 'INVALID_PAYLOAD', 'protocol.error.invalid-payload')
        }
        const event = crossTabMediaEventSchema.parse(payload.data.event)
        options.onCrossTabEvent?.(event)
        return createTabSuccess(request, { accepted: true })
      }
      if (request.type === 'site.get-state') {
        const ready = mediaReady && siteEnabled && !temporaryDisabled
        const state = ready ? await bridge.getMediaState() : null
        const response = siteRuntimeStateResponseSchema.parse({
          ready,
          temporaryDisabled,
          mediaCount: state?.media.length ?? 0,
          activeMedia: state?.activeMediaId !== null && state?.activeMediaId !== undefined,
          adapters: state?.adapters ?? []
        })
        return createTabSuccess(request, response)
      }
      if (request.type === 'site.set-temporary-disabled') {
        const payload = siteTemporaryDisablePayloadSchema.safeParse(request.payload)
        if (!payload.success) {
          return createTabError(request, 'INVALID_PAYLOAD', 'protocol.error.invalid-payload')
        }
        temporaryDisabled = payload.data.disabled
        if (temporaryDisabled) hotkeys.stop()
        else await refreshSettings()
        notifyRuntimeState()
        return createTabSuccess(
          request,
          siteTemporaryDisableResponseSchema.parse({ disabled: temporaryDisabled })
        )
      }
      if (request.type === 'site.permission-revoked') {
        temporaryDisabled = true
        hotkeys.stop()
        mediaReady = false
        stateSubscription?.()
        stateSubscription = null
        bridge.stop()
        latestMediaState = null
        lastObservedMediaState = null
        notifyRuntimeState()
        return createTabSuccess(request, { disabled: true })
      }
      if (!mediaReady || !siteEnabled || temporaryDisabled) {
        return createTabError(
          request,
          'PAGE_RUNTIME_UNAVAILABLE',
          'media.error.runtime-unavailable',
          true
        )
      }
      if (request.type === 'media.get-state') {
        if (!mediaGetStatePayloadSchema.safeParse(request.payload).success) {
          return createTabError(request, 'INVALID_PAYLOAD', 'protocol.error.invalid-payload')
        }
        return createTabSuccess(request, mediaPageStateSchema.parse(await bridge.getMediaState()))
      }

      const payload = mediaExecutePayloadSchema.safeParse(request.payload)
      if (!payload.success) {
        return createTabError(request, 'INVALID_PAYLOAD', 'protocol.error.invalid-payload')
      }
      return createTabSuccess(
        request,
        mediaCommandResultResponseSchema.parse(await executeMediaCommand(payload.data.command))
      )
    } catch (error) {
      return bridgeFailure(request, error)
    }
  }

  return {
    handleTabMessage,
    getMediaState: async () => {
      if (!mediaReady || !siteEnabled || temporaryDisabled) {
        throw new PageBridgeError('PAGE_RUNTIME_UNAVAILABLE', 'Content runtime unavailable')
      }
      return bridge.getMediaState()
    },
    executeMediaCommand: async (command) => {
      if (!mediaReady || !siteEnabled || temporaryDisabled) {
        throw new PageBridgeError('PAGE_RUNTIME_UNAVAILABLE', 'Content runtime unavailable')
      }
      return executeMediaCommand(command)
    },
    teardown: () => {
      settingsTeardown?.()
      settingsTeardown = null
      stateSubscription?.()
      stateSubscription = null
      hotkeys.stop()
      bridge.stop()
    }
  }
}
