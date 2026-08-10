import { describe, expect, it } from 'vitest'
import { SettingsService } from '../../src/application/settings/settings-service'
import {
  settingsExportResponseSchema,
  settingsSnapshotResponseSchema
} from '../../src/application/settings/contracts'
import { ReplayGuard } from '../../src/infrastructure/messaging/replay-guard'
import { SettingsRepository } from '../../src/infrastructure/storage/settings-repository'
import { BackgroundRuntime } from '../../src/runtime/background/background-runtime'
import {
  createRuntimeRequest,
  parseRuntimeResponse,
  type RuntimeRequestEnvelope
} from '../../src/shared/protocol'
import { FakeClock, FakeLogger, FakeStoragePort } from '../test-support/fakes'

function createRuntime() {
  const clock = new FakeClock()
  const logger = new FakeLogger()
  const repository = new SettingsRepository(new FakeStoragePort(), clock, logger)
  return {
    runtime: new BackgroundRuntime({
      extensionId: 'extension-id',
      extensionVersion: '0.1.0',
      settings: new SettingsService(repository),
      replayGuard: new ReplayGuard(clock),
      logger
    }),
    repository,
    logger
  }
}

const popupSender = {
  id: 'extension-id',
  url: 'chrome-extension://extension-id/popup.html'
}

async function handle(request: RuntimeRequestEnvelope) {
  const { runtime } = createRuntime()
  return parseRuntimeResponse(await runtime.handle(request, popupSender))
}

describe('background runtime contract boundary', () => {
  it('returns versioned ping and settings responses for authorized extension pages', async () => {
    const ping = await handle(createRuntimeRequest('popup', 'system.ping', {}))
    const settings = await handle(createRuntimeRequest('popup', 'settings.get', {}))

    expect(ping?.type).toBe('protocol.response')
    if (ping?.type === 'protocol.response') expect(ping.payload.data).toMatchObject({ phase: 1 })
    expect(settings?.type).toBe('protocol.response')
  })

  it('rejects forged sender identity and self-reported tab context', async () => {
    const { runtime } = createRuntime()
    const forged = createRuntimeRequest('popup', 'settings.get', {})
    const forgedResponse = parseRuntimeResponse(
      await runtime.handle(forged, { ...popupSender, id: 'attacker' })
    )
    const tabClaim = createRuntimeRequest('popup', 'settings.get', {}, { tabId: 99 })
    const tabResponse = parseRuntimeResponse(await runtime.handle(tabClaim, popupSender))

    expect(forgedResponse?.type).toBe('protocol.error')
    expect(tabResponse?.type).toBe('protocol.error')
    if (forgedResponse?.type === 'protocol.error') {
      expect(forgedResponse.payload.error.code).toBe('UNAUTHORIZED_SOURCE')
    }
  })

  it('rejects invalid payloads, unknown messages and request replay safely', async () => {
    const { runtime } = createRuntime()
    const request = createRuntimeRequest('popup', 'settings.update', { patch: { script: true } })
    const invalid = parseRuntimeResponse(await runtime.handle(request, popupSender))
    const replay = parseRuntimeResponse(await runtime.handle(request, popupSender))
    const unknown = await runtime.handle(
      { ...createRuntimeRequest('popup', 'settings.get', {}), type: 'unknown.type' },
      popupSender
    )

    expect(invalid?.type).toBe('protocol.error')
    if (invalid?.type === 'protocol.error') {
      expect(invalid.payload.error.code).toBe('INVALID_PAYLOAD')
    }
    expect(replay?.type).toBe('protocol.error')
    if (replay?.type === 'protocol.error') {
      expect(replay.payload.error.code).toBe('REPLAY_DETECTED')
    }
    expect(unknown).toBeNull()
  })

  it('does not let content sessions mutate extension settings', async () => {
    const { runtime } = createRuntime()
    const request = createRuntimeRequest(
      'content',
      'settings.update',
      { patch: { global: { enabled: false } } },
      { sessionId: 'session-identifier-1' }
    )
    const response = parseRuntimeResponse(
      await runtime.handle(request, {
        id: 'extension-id',
        tabId: 1,
        frameId: 0,
        url: 'https://example.com/watch'
      })
    )
    expect(response?.type).toBe('protocol.error')
    if (response?.type === 'protocol.error') {
      expect(response.payload.error.code).toBe('UNAUTHORIZED_SOURCE')
    }
  })

  it('serializes two options writers through the authoritative repository', async () => {
    const { runtime, repository } = createRuntime()
    const sender = {
      id: 'extension-id',
      url: 'moz-extension://extension-id/options.html'
    }
    const first = createRuntimeRequest('options', 'settings.update', {
      patch: { global: { enabled: false } },
      expectedRevision: 0
    })
    const second = createRuntimeRequest('options', 'settings.update', {
      patch: { global: { media: { defaultPlaybackRate: 2 } } },
      expectedRevision: 0
    })

    await Promise.all([runtime.handle(first, sender), runtime.handle(second, sender)])
    const final = await repository.get()
    expect(final.ok && final.value.data.global.enabled).toBe(false)
    expect(final.ok && final.value.data.global.media.defaultPlaybackRate).toBe(2)
  })

  it('routes export, import, backup restore and cancellation for options only', async () => {
    const { runtime } = createRuntime()
    const sender = {
      id: 'extension-id',
      url: 'chrome-extension://extension-id/options.html',
      tabId: 7,
      frameId: 0
    }

    const exportedResponse = parseRuntimeResponse(
      await runtime.handle(createRuntimeRequest('options', 'settings.export', {}), sender)
    )
    if (exportedResponse?.type !== 'protocol.response') throw new Error('export failed')
    const exported = settingsExportResponseSchema.parse(exportedResponse.payload.data)
    const importDocument = JSON.parse(exported.content) as {
      data: { global: { enabled: boolean } }
    }
    importDocument.data.global.enabled = false

    const importedResponse = parseRuntimeResponse(
      await runtime.handle(
        createRuntimeRequest('options', 'settings.import', {
          content: JSON.stringify(importDocument)
        }),
        sender
      )
    )
    expect(importedResponse?.type).toBe('protocol.response')

    const snapshotResponse = parseRuntimeResponse(
      await runtime.handle(createRuntimeRequest('options', 'settings.get', {}), sender)
    )
    if (snapshotResponse?.type !== 'protocol.response') throw new Error('snapshot failed')
    const snapshot = settingsSnapshotResponseSchema.parse(snapshotResponse.payload.data)
    if (!snapshot.latestBackup) throw new Error('backup missing')

    const restored = parseRuntimeResponse(
      await runtime.handle(
        createRuntimeRequest('options', 'settings.restore-backup', {
          backupId: snapshot.latestBackup.backupId
        }),
        sender
      )
    )
    expect(restored?.type).toBe('protocol.response')

    const cancelled = parseRuntimeResponse(
      await runtime.handle(
        createRuntimeRequest('options', 'protocol.cancel', {
          targetRequestId: 'missing-request-id-1234'
        }),
        sender
      )
    )
    expect(cancelled?.type).toBe('protocol.response')
  })

  it('reports initialization and import failures without exposing raw data', async () => {
    const clock = new FakeClock()
    const logger = new FakeLogger()
    const storage = new FakeStoragePort()
    storage.failReads = true
    const repository = new SettingsRepository(storage, clock, logger)
    const runtime = new BackgroundRuntime({
      extensionId: 'extension-id',
      extensionVersion: '0.1.0',
      settings: new SettingsService(repository),
      replayGuard: new ReplayGuard(clock),
      logger
    })
    await runtime.initialize()
    expect(
      logger.records.some((record) => record.eventCode === 'SETTINGS_INITIALIZATION_FAILED')
    ).toBe(true)

    storage.failReads = false
    const response = parseRuntimeResponse(
      await runtime.handle(
        createRuntimeRequest('options', 'settings.import', { content: '{broken' }),
        { id: 'extension-id', url: 'chrome-extension://extension-id/options.html' }
      )
    )
    expect(response?.type).toBe('protocol.error')
    if (response?.type === 'protocol.error') {
      expect(response.payload.error.code).toBe('IMPORT_INVALID')
      expect(JSON.stringify(response)).not.toContain('{broken')
    }
  })

  it('authorizes a content ping from the sender tab/frame but not an extension-page path mismatch', async () => {
    const { runtime } = createRuntime()
    const content = createRuntimeRequest(
      'content',
      'system.ping',
      {},
      {
        sessionId: 'session-identifier-1'
      }
    )
    const contentResponse = parseRuntimeResponse(
      await runtime.handle(content, {
        id: 'extension-id',
        tabId: 4,
        frameId: 2,
        url: 'https://example.com/watch'
      })
    )
    expect(contentResponse).toMatchObject({ tabId: 4, frameId: 2 })

    const mismatch = parseRuntimeResponse(
      await runtime.handle(createRuntimeRequest('popup', 'system.ping', {}), {
        id: 'extension-id',
        url: 'chrome-extension://extension-id/options.html'
      })
    )
    expect(mismatch?.type).toBe('protocol.error')
  })
})
