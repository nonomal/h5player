import { describe, expect, it } from 'vitest'
import { SettingsService } from '../../src/application/settings/settings-service'
import { SiteAccessService } from '../../src/application/site'
import { SettingsRepository } from '../../src/infrastructure/storage/settings-repository'
import { createTabSuccess, parseTabRequest } from '../../src/shared/tab-protocol'
import {
  FakeClock,
  FakeContentScriptRegistrationPort,
  FakeLogger,
  FakePermissionsPort,
  FakeStoragePort,
  FakeTabsPort
} from '../test-support/fakes'

function createService() {
  const clock = new FakeClock()
  const repository = new SettingsRepository(new FakeStoragePort(), clock, new FakeLogger())
  const settings = new SettingsService(repository)
  const tabs = new FakeTabsPort()
  const permissions = new FakePermissionsPort()
  const registration = new FakeContentScriptRegistrationPort()
  const service = new SiteAccessService(settings, tabs, permissions, registration)
  return { repository, settings, tabs, permissions, registration, service }
}

describe('SiteAccessService', () => {
  it('reconciles only granted web origins, bootstraps allowed tabs, and tears down revoked tabs', async () => {
    const { tabs, permissions, registration, service } = createService()
    permissions.origins.add('https://example.com/*')
    permissions.origins.add('file:///*')

    await expect(service.reconcile(true)).resolves.toEqual({
      registeredOrigins: 1,
      bootstrapped: true
    })
    expect(registration.reconciled).toEqual([['https://example.com/*']])
    expect(registration.bootstrapped).toEqual([1])

    permissions.origins.clear()
    await expect(service.reconcile(false)).resolves.toEqual({
      registeredOrigins: 0,
      bootstrapped: false
    })
    expect(registration.tornDown).toEqual([1])

    tabs.activeTab = { id: 2, url: 'chrome://extensions' }
    await service.reconcile(true)
    expect(registration.bootstrapped).toEqual([1])
  })

  it('serializes permission-event and explicit reconciliation work', async () => {
    const { registration, service } = createService()
    let activeReconciliations = 0
    let maximumConcurrentReconciliations = 0
    registration.reconcile = async (origins) => {
      registration.reconciled.push([...origins])
      activeReconciliations += 1
      maximumConcurrentReconciliations = Math.max(
        maximumConcurrentReconciliations,
        activeReconciliations
      )
      await Promise.resolve()
      activeReconciliations -= 1
    }

    await Promise.all([service.reconcile(false), service.reconcile(false)])

    expect(maximumConcurrentReconciliations).toBe(1)
    expect(registration.reconciled).toHaveLength(2)
  })

  it('distinguishes no tab, restricted pages, missing permission, and initialization failure', async () => {
    const { tabs, permissions, service } = createService()

    tabs.activeTab = null
    await expect(service.getContext()).resolves.toMatchObject({
      permission: 'unknown',
      reason: 'no-active-tab'
    })

    tabs.activeTab = { id: 1, url: 'chrome://settings' }
    await expect(service.getContext()).resolves.toMatchObject({
      permission: 'restricted',
      reason: 'restricted-page'
    })

    tabs.activeTab = { id: 1, url: 'https://example.com/watch' }
    await expect(service.getContext()).resolves.toMatchObject({
      permission: 'missing',
      reason: 'permission-required'
    })

    permissions.origins.add('https://example.com/*')
    tabs.handler = () => Promise.reject(new Error('content missing'))
    await expect(service.getContext()).resolves.toMatchObject({
      permission: 'granted',
      runtime: 'unavailable',
      reason: 'initialization-failed'
    })
  })

  it('reports ready, no-media, temporary, site-disabled, and global-disabled states precisely', async () => {
    const { repository, tabs, permissions, service } = createService()
    permissions.origins.add('https://example.com/*')
    let runtimeState = {
      ready: true,
      temporaryDisabled: false,
      mediaCount: 1,
      activeMedia: true
    }
    tabs.handler = (raw) => {
      const request = parseTabRequest(raw)
      if (!request) return Promise.reject(new Error('invalid request'))
      return Promise.resolve(createTabSuccess(request, runtimeState))
    }

    await expect(service.getContext()).resolves.toMatchObject({
      runtime: 'ready',
      reason: 'none',
      mediaCount: 1
    })
    runtimeState = { ...runtimeState, mediaCount: 0, activeMedia: false }
    await expect(service.getContext()).resolves.toMatchObject({ reason: 'no-media' })
    runtimeState = { ...runtimeState, temporaryDisabled: true }
    await expect(service.getContext()).resolves.toMatchObject({
      runtime: 'disabled',
      reason: 'temporarily-disabled'
    })

    await repository.update(
      { sites: { 'https://example.com': { enabled: false } } },
      undefined,
      'test'
    )
    await expect(service.getContext()).resolves.toMatchObject({ reason: 'site-disabled' })

    await repository.update({ global: { enabled: false } }, undefined, 'test')
    await expect(service.getContext()).resolves.toMatchObject({ reason: 'extension-disabled' })
  })

  it('forwards temporary disable through the typed tab protocol', async () => {
    const { tabs, service } = createService()
    tabs.handler = (raw) => {
      const request = parseTabRequest(raw)
      if (!request) return Promise.reject(new Error('invalid request'))
      return Promise.resolve(createTabSuccess(request, { disabled: true }))
    }
    await expect(service.setTemporaryDisabled(true)).resolves.toEqual({ disabled: true })
    expect(parseTabRequest(tabs.sent[0]?.message)?.type).toBe('site.set-temporary-disabled')
  })
})
