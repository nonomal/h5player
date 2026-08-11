import { systemPingResponseSchema } from '../../application/settings/contracts'
import { settingsSnapshotResponseSchema } from '../../application/settings/contracts'
import { HotkeyController } from '../../application/hotkeys'
import {
  mediaExecutePayloadSchema,
  mediaGetStatePayloadSchema,
  mediaPageStateSchema,
  mediaCommandResultResponseSchema
} from '../../application/media'
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
}

export type ContentMessageSender = {
  readonly id?: string
}

export type ContentRuntimeHandle = {
  readonly handleTabMessage: (rawMessage: unknown, sender: ContentMessageSender) => Promise<unknown>
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
  const hotkeySource = new DomHotkeyEventSource(options.window, options.document)
  const hotkeys = new HotkeyController(
    hotkeySource,
    {
      getState: () => bridge.getMediaState(),
      execute: (command) => bridge.executeMediaCommand(command)
    },
    {
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
  )
  let settingsTeardown: Teardown | null = null

  const refreshSettings = async (): Promise<void> => {
    try {
      const snapshot = await runtime.request('settings.get', {}, settingsSnapshotResponseSchema)
      const currentSettings = resolveSettings(
        snapshot.settings.data,
        options.window.location.origin
      )
      siteEnabled = currentSettings.enabled
      hotkeys.update({
        ...currentSettings,
        enabled: currentSettings.enabled && !temporaryDisabled
      })
      if (currentSettings.enabled && !temporaryDisabled && mediaReady) hotkeys.start()
      else hotkeys.stop()
    } catch {
      siteEnabled = false
      hotkeys.stop()
    }
  }

  await refreshSettings()
  settingsTeardown =
    options.subscribeSettings?.(() => {
      void refreshSettings()
    }) ?? null

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
      if (request.type === 'site.get-state') {
        const ready = mediaReady && siteEnabled && !temporaryDisabled
        const state = ready ? await bridge.getMediaState() : null
        const response = siteRuntimeStateResponseSchema.parse({
          ready,
          temporaryDisabled,
          mediaCount: state?.media.length ?? 0,
          activeMedia: state?.activeMediaId !== null && state?.activeMediaId !== undefined
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
        return createTabSuccess(
          request,
          siteTemporaryDisableResponseSchema.parse({ disabled: temporaryDisabled })
        )
      }
      if (request.type === 'site.permission-revoked') {
        temporaryDisabled = true
        hotkeys.stop()
        mediaReady = false
        bridge.stop()
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
        mediaCommandResultResponseSchema.parse(
          await bridge.executeMediaCommand(payload.data.command)
        )
      )
    } catch (error) {
      return bridgeFailure(request, error)
    }
  }

  return {
    handleTabMessage,
    teardown: () => {
      settingsTeardown?.()
      settingsTeardown = null
      hotkeys.stop()
      bridge.stop()
    }
  }
}
