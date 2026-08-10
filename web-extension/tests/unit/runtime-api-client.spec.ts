import { describe, expect, it } from 'vitest'
import { createSettingsEnvelope } from '../test-support/settings-fixtures'
import { FakeTransport } from '../test-support/fakes'
import { RuntimeApiClient } from '../../src/infrastructure/messaging/runtime-api-client'
import { RuntimeRequestClient } from '../../src/infrastructure/messaging/request-client'
import { systemScheduler } from '../../src/infrastructure/time/system-time'
import { createRuntimeSuccess, parseRuntimeRequest } from '../../src/shared/protocol'

describe('runtime API client', () => {
  it('maps every settings operation to a typed runtime request', async () => {
    const envelope = createSettingsEnvelope(4)
    const transport = new FakeTransport((raw) => {
      const request = parseRuntimeRequest(raw)
      if (!request) return Promise.reject(new Error('invalid request'))
      switch (request.type) {
        case 'system.ping':
          return Promise.resolve(
            createRuntimeSuccess(request, {
              extensionVersion: '0.1.0',
              phase: 2,
              protocol: 1,
              settingsSchemaVersion: 1
            })
          )
        case 'settings.get':
          return Promise.resolve(
            createRuntimeSuccess(request, { settings: envelope, latestBackup: null })
          )
        case 'settings.export':
          return Promise.resolve(createRuntimeSuccess(request, { content: '{"safe":true}' }))
        default:
          return Promise.resolve(
            createRuntimeSuccess(request, {
              settings: envelope,
              changedPaths: ['global.enabled'],
              rebased: false
            })
          )
      }
    })
    const api = new RuntimeApiClient(
      new RuntimeRequestClient('options', transport, systemScheduler)
    )

    await expect(api.ping()).resolves.toMatchObject({ phase: 2 })
    await expect(api.getSettings()).resolves.toMatchObject({ settings: { revision: 4 } })
    await expect(api.updateSettings({ global: { enabled: false } }, 4)).resolves.toMatchObject({
      changedPaths: ['global.enabled']
    })
    await expect(api.exportSettings()).resolves.toBe('{"safe":true}')
    await expect(api.importSettings('{"safe":true}', 4)).resolves.toMatchObject({
      settings: { revision: 4 }
    })
    await expect(api.restoreBackup('backup-id')).resolves.toMatchObject({ rebased: false })

    const types = transport.sent.map(parseRuntimeRequest).map((request) => request?.type)
    expect(types).toEqual([
      'system.ping',
      'settings.get',
      'settings.update',
      'settings.export',
      'settings.import',
      'settings.restore-backup'
    ])
  })
})
