import type { ContentScriptRegistrationPort, PermissionsPort, TabsPort } from '../ports/browser'
import type { SettingsService } from '../settings/settings-service'
import { resolveSettings, toHostPermissionPattern } from '../../domain/settings'
import { createTabRequest, parseTabResponse, type TabRequestType } from '../../shared/tab-protocol'
import {
  siteRuntimeStateResponseSchema,
  siteTemporaryDisableResponseSchema,
  type SiteContextResponse,
  type SiteReconcileResponse,
  type SiteRuntimeStateResponse,
  type SiteTemporaryDisableResponse
} from './contracts'

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function supportedGrantedOrigins(origins: readonly string[]): readonly string[] {
  return origins.filter(
    (origin) =>
      origin === '<all_urls>' || origin.startsWith('http://') || origin.startsWith('https://')
  )
}

export class SiteAccessService {
  private reconciliationQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly settings: SettingsService,
    private readonly tabs: TabsPort,
    private readonly permissions: PermissionsPort,
    private readonly registration: ContentScriptRegistrationPort
  ) {}

  async initialize(): Promise<void> {
    await this.reconcile(false)
  }

  reconcile(bootstrapCurrentTab: boolean): Promise<SiteReconcileResponse> {
    const operation = this.reconciliationQueue.then(
      () => this.performReconcile(bootstrapCurrentTab),
      () => this.performReconcile(bootstrapCurrentTab)
    )
    this.reconciliationQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  private async performReconcile(bootstrapCurrentTab: boolean): Promise<SiteReconcileResponse> {
    const granted = supportedGrantedOrigins((await this.permissions.getAll()).origins)
    await this.registration.reconcile(granted)

    let bootstrapped = false
    const active = await this.tabs.getActive()
    if (active?.url && isWebUrl(active.url)) {
      const pattern = toHostPermissionPattern(active.url)
      const allowed = pattern.ok && (await this.permissions.contains({ origins: [pattern.value] }))
      if (allowed) {
        if (bootstrapCurrentTab) {
          await this.registration.bootstrap(active.id)
          bootstrapped = true
        }
      } else {
        await this.registration.teardown(active.id)
      }
    }

    return { registeredOrigins: granted.length, bootstrapped }
  }

  async getContext(): Promise<SiteContextResponse> {
    const snapshot = await this.settings.getSnapshot()
    if (!snapshot.ok) throw new Error(snapshot.error.code)
    const active = await this.tabs.getActive()
    if (!active) {
      return {
        tab: null,
        permission: 'unknown',
        enabled: snapshot.value.settings.data.global.enabled,
        temporaryDisabled: false,
        mediaCount: 0,
        activeMedia: false,
        runtime: 'unknown',
        reason: 'no-active-tab'
      }
    }

    if (!active.url) {
      return {
        tab: { id: active.id },
        permission: 'unknown',
        enabled: snapshot.value.settings.data.global.enabled,
        temporaryDisabled: false,
        mediaCount: 0,
        activeMedia: false,
        runtime: 'unknown',
        reason: 'permission-required'
      }
    }

    if (!isWebUrl(active.url)) {
      return {
        tab: { id: active.id, protocol: new URL(active.url).protocol },
        permission: 'restricted',
        enabled: false,
        temporaryDisabled: false,
        mediaCount: 0,
        activeMedia: false,
        runtime: 'unavailable',
        reason: 'restricted-page'
      }
    }

    const url = new URL(active.url)
    const origin = url.origin.toLowerCase()
    const effective = resolveSettings(snapshot.value.settings.data, origin)
    const permissionPattern = toHostPermissionPattern(origin)
    const granted =
      permissionPattern.ok &&
      (await this.permissions.contains({ origins: [permissionPattern.value] }))

    const tab = {
      id: active.id,
      origin,
      hostname: url.hostname.toLowerCase(),
      protocol: url.protocol
    }

    if (!granted) {
      return {
        tab,
        permission: 'missing',
        enabled: effective.enabled,
        temporaryDisabled: false,
        mediaCount: 0,
        activeMedia: false,
        runtime: 'unavailable',
        reason: 'permission-required'
      }
    }
    if (!snapshot.value.settings.data.global.enabled) {
      return {
        tab,
        permission: 'granted',
        enabled: false,
        temporaryDisabled: false,
        mediaCount: 0,
        activeMedia: false,
        runtime: 'disabled',
        reason: 'extension-disabled'
      }
    }
    if (!effective.enabled) {
      return {
        tab,
        permission: 'granted',
        enabled: false,
        temporaryDisabled: false,
        mediaCount: 0,
        activeMedia: false,
        runtime: 'disabled',
        reason: 'site-disabled'
      }
    }

    const runtimeState = await this.readRuntimeState(active.id)
    if (!runtimeState) {
      return {
        tab,
        permission: 'granted',
        enabled: true,
        temporaryDisabled: false,
        mediaCount: 0,
        activeMedia: false,
        runtime: 'unavailable',
        reason: 'initialization-failed'
      }
    }
    if (runtimeState.temporaryDisabled) {
      return {
        tab,
        permission: 'granted',
        enabled: true,
        temporaryDisabled: true,
        mediaCount: runtimeState.mediaCount,
        activeMedia: runtimeState.activeMedia,
        adapters: runtimeState.adapters,
        runtime: 'disabled',
        reason: 'temporarily-disabled'
      }
    }
    return {
      tab,
      permission: 'granted',
      enabled: true,
      temporaryDisabled: false,
      mediaCount: runtimeState.mediaCount,
      activeMedia: runtimeState.activeMedia,
      adapters: runtimeState.adapters,
      runtime: runtimeState.ready ? 'ready' : 'unavailable',
      reason: runtimeState.ready
        ? runtimeState.mediaCount === 0
          ? 'no-media'
          : 'none'
        : 'initialization-failed'
    }
  }

  async setTemporaryDisabled(disabled: boolean): Promise<SiteTemporaryDisableResponse> {
    const active = await this.tabs.getActive()
    if (!active) throw new Error('No active tab')
    const response = await this.sendToTab(
      active.id,
      'site.set-temporary-disabled',
      { disabled },
      siteTemporaryDisableResponseSchema
    )
    if (!response) throw new Error('Site runtime unavailable')
    return response
  }

  private readRuntimeState(tabId: number): Promise<SiteRuntimeStateResponse | null> {
    return this.sendToTab(tabId, 'site.get-state', {}, siteRuntimeStateResponseSchema)
  }

  private async sendToTab<T>(
    tabId: number,
    type: TabRequestType,
    payload: unknown,
    parser: { safeParse(value: unknown): { success: true; data: T } | { success: false } }
  ): Promise<T | null> {
    const request = createTabRequest(type, payload)
    let raw: unknown
    try {
      raw = await this.tabs.send(tabId, request, 0)
    } catch {
      return null
    }
    const response = parseTabResponse(raw)
    if (
      !response ||
      response.requestId !== request.requestId ||
      response.payload.requestType !== request.type ||
      response.type === 'protocol.error'
    ) {
      return null
    }
    const parsed = parser.safeParse(response.payload.data)
    return parsed.success ? parsed.data : null
  }
}
