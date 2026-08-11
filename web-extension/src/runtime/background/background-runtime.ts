import type { LoggerPort } from '../../application/ports/logging'
import type { TabsPort } from '../../application/ports/browser'
import {
  crossTabPublishPayloadSchema,
  crossTabPublishResponseSchema,
  mediaCommandResultResponseSchema,
  mediaExecutePayloadSchema,
  mediaGetStatePayloadSchema,
  mediaPageStateSchema
} from '../../application/media'
import type { CrossTabMediaEventService } from '../../application/media'
import {
  progressDeletePayloadSchema,
  progressDeleteResponseSchema,
  progressPrunePayloadSchema,
  progressPruneResponseSchema,
  progressReadPayloadSchema,
  progressReadResponseSchema,
  progressSavePayloadSchema,
  progressSaveResponseSchema
} from '../../application/progress'
import type { ProgressService } from '../../application/progress'
import {
  cancellationResponseSchema,
  emptyPayloadSchema,
  protocolCancelPayloadSchema,
  settingsImportPayloadSchema,
  settingsMutationResponseSchema,
  settingsRestorePayloadSchema,
  settingsResetPayloadSchema,
  settingsSnapshotResponseSchema,
  settingsUpdatePayloadSchema,
  systemPingResponseSchema
} from '../../application/settings/contracts'
import type { DiagnosticsService } from '../../application/diagnostics/diagnostics-service'
import {
  siteContextResponseSchema,
  siteReconcilePayloadSchema,
  siteReconcileResponseSchema,
  siteTemporaryDisablePayloadSchema,
  siteTemporaryDisableResponseSchema
} from '../../application/site/contracts'
import type { SiteAccessService } from '../../application/site/site-access-service'
import type { SettingsService } from '../../application/settings/settings-service'
import type { SettingsError } from '../../application/settings/settings-port'
import type { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import {
  CURRENT_EXTENSION_PHASE,
  createRuntimeError,
  createRuntimeSuccess,
  parseRuntimeRequest,
  type EnvelopeContext,
  type ProtocolErrorCode,
  type RuntimeRequestEnvelope
} from '../../shared/protocol'
import { authorizeRuntimeSender, type RuntimeSenderMetadata } from './sender-policy'
import {
  createTabRequest,
  parseTabResponse,
  type TabRequestType,
  type TabTransportErrorCode
} from '../../shared/tab-protocol'

type BackgroundRuntimeOptions = {
  extensionId: string
  extensionVersion: string
  settings: SettingsService
  replayGuard: ReplayGuard
  logger: LoggerPort
  tabs: TabsPort
  siteAccess: SiteAccessService
  diagnostics: DiagnosticsService
  crossTab?: CrossTabMediaEventService
  progress?: ProgressService
}

type SafeParser<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false }
}

function mapSettingsError(error: SettingsError): ProtocolErrorCode {
  switch (error.code) {
    case 'FUTURE_SCHEMA':
      return 'FUTURE_SCHEMA'
    case 'IMPORT_INVALID':
      return 'IMPORT_INVALID'
    case 'STORAGE_CORRUPT':
    case 'BACKUP_CORRUPT':
      return 'STORAGE_CORRUPT'
    case 'MIGRATION_FAILED':
      return 'MIGRATION_FAILED'
    default:
      return 'INTERNAL_ERROR'
  }
}

function mapProgressError(error: { code: string }): ProtocolErrorCode {
  if (error.code.startsWith('INVALID_')) return 'INVALID_PAYLOAD'
  if (error.code === 'FUTURE_SCHEMA') return 'FUTURE_SCHEMA'
  if (error.code === 'STORAGE_CORRUPT' || error.code === 'BACKUP_CORRUPT') {
    return 'STORAGE_CORRUPT'
  }
  if (error.code === 'MIGRATION_FAILED') return 'MIGRATION_FAILED'
  return 'INTERNAL_ERROR'
}

function responseContext(authorized: {
  tabId?: number
  frameId?: number
  sessionId?: string
}): EnvelopeContext {
  const context: EnvelopeContext = {}
  if (authorized.tabId !== undefined) context.tabId = authorized.tabId
  if (authorized.frameId !== undefined) context.frameId = authorized.frameId
  if (authorized.sessionId !== undefined) context.sessionId = authorized.sessionId
  return context
}

function mapTabTransportError(code: TabTransportErrorCode): ProtocolErrorCode {
  switch (code) {
    case 'INVALID_PAYLOAD':
      return 'INVALID_PAYLOAD'
    case 'UNAUTHORIZED_SOURCE':
      return 'UNAUTHORIZED_SOURCE'
    case 'REPLAY_DETECTED':
      return 'REPLAY_DETECTED'
    case 'PAGE_RUNTIME_UNAVAILABLE':
      return 'TARGET_UNAVAILABLE'
    case 'INVALID_ENVELOPE':
    case 'INTERNAL_ERROR':
      return 'INTERNAL_ERROR'
  }
}

export class BackgroundRuntime {
  private readonly inFlight = new Map<string, AbortController>()

  constructor(private readonly options: BackgroundRuntimeOptions) {}

  async initialize(): Promise<void> {
    const initialized = await this.options.settings.getSnapshot()
    if (!initialized.ok) {
      this.options.logger.log({
        level: 'error',
        module: 'background-runtime',
        eventCode: 'SETTINGS_INITIALIZATION_FAILED',
        details: { code: initialized.error.code }
      })
    }
    try {
      await this.options.siteAccess.initialize()
    } catch (error) {
      this.options.logger.log({
        level: 'error',
        module: 'background-runtime',
        eventCode: 'CONTENT_SCRIPT_REGISTRATION_FAILED',
        details: { error }
      })
    }
  }

  async handle(rawMessage: unknown, sender: RuntimeSenderMetadata): Promise<unknown> {
    const request = parseRuntimeRequest(rawMessage)
    if (!request) {
      this.options.logger.log({
        level: 'warn',
        module: 'background-runtime',
        eventCode: 'MESSAGE_REJECTED_INVALID_ENVELOPE'
      })
      return null
    }

    const authorized = authorizeRuntimeSender(request, sender, this.options.extensionId)
    if (!authorized.ok) {
      this.options.logger.log({
        level: 'warn',
        module: 'background-runtime',
        eventCode: 'MESSAGE_REJECTED_UNAUTHORIZED',
        correlationId: request.requestId,
        details: { source: request.source, type: request.type }
      })
      return createRuntimeError(
        request,
        'UNAUTHORIZED_SOURCE',
        'protocol.error.unauthorized-source'
      )
    }

    const context = responseContext(authorized.value)
    if (!this.options.replayGuard.accept(authorized.value.scope, request.requestId)) {
      return createRuntimeError(
        request,
        'REPLAY_DETECTED',
        'protocol.error.replay-detected',
        false,
        context
      )
    }

    if (request.type === 'protocol.cancel') {
      return this.cancelRequest(request, authorized.value.scope, context)
    }

    const inFlightKey = `${authorized.value.scope}:${request.requestId}`
    const controller = new AbortController()
    this.inFlight.set(inFlightKey, controller)
    try {
      return await this.route(request, authorized.value.scope, context, controller.signal)
    } catch (error) {
      this.options.logger.log({
        level: 'error',
        module: 'background-runtime',
        eventCode: 'MESSAGE_HANDLER_FAILED',
        correlationId: request.requestId,
        details: { type: request.type, error }
      })
      return createRuntimeError(
        request,
        'INTERNAL_ERROR',
        'protocol.error.internal',
        false,
        context
      )
    } finally {
      this.inFlight.delete(inFlightKey)
    }
  }

  private async route(
    request: RuntimeRequestEnvelope,
    source: string,
    context: EnvelopeContext,
    signal: AbortSignal
  ): Promise<unknown> {
    if (signal.aborted) {
      return createRuntimeError(
        request,
        'REQUEST_CANCELLED',
        'protocol.error.request-cancelled',
        false,
        context
      )
    }

    switch (request.type) {
      case 'system.ping': {
        if (!emptyPayloadSchema.safeParse(request.payload).success) {
          return this.invalidPayload(request, context)
        }
        const response: {
          extensionVersion: string
          phase: typeof CURRENT_EXTENSION_PHASE
          protocol: 1
          settingsSchemaVersion: 2
          tabId?: number
          frameId?: number
        } = {
          extensionVersion: this.options.extensionVersion,
          phase: CURRENT_EXTENSION_PHASE,
          protocol: 1,
          settingsSchemaVersion: 2
        }
        if (context.tabId !== undefined) response.tabId = context.tabId
        if (context.frameId !== undefined) response.frameId = context.frameId
        return createRuntimeSuccess(request, systemPingResponseSchema.parse(response), context)
      }
      case 'settings.get': {
        if (!emptyPayloadSchema.safeParse(request.payload).success) {
          return this.invalidPayload(request, context)
        }
        const result = await this.options.settings.getSnapshot()
        return result.ok
          ? createRuntimeSuccess(
              request,
              settingsSnapshotResponseSchema.parse(result.value),
              context
            )
          : this.settingsFailure(request, result.error, context)
      }
      case 'settings.update': {
        const payload = settingsUpdatePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        const result = await this.options.settings.update(
          payload.data.patch,
          payload.data.expectedRevision,
          source
        )
        return result.ok
          ? createRuntimeSuccess(
              request,
              settingsMutationResponseSchema.parse(result.value),
              context
            )
          : this.settingsFailure(request, result.error, context)
      }
      case 'settings.export': {
        if (!emptyPayloadSchema.safeParse(request.payload).success) {
          return this.invalidPayload(request, context)
        }
        const result = await this.options.settings.export()
        return result.ok
          ? createRuntimeSuccess(request, { content: result.value }, context)
          : this.settingsFailure(request, result.error, context)
      }
      case 'settings.import': {
        const payload = settingsImportPayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        const result = await this.options.settings.import(
          payload.data.content,
          payload.data.expectedRevision,
          source
        )
        return result.ok
          ? createRuntimeSuccess(
              request,
              settingsMutationResponseSchema.parse(result.value),
              context
            )
          : this.settingsFailure(request, result.error, context)
      }
      case 'settings.restore-backup': {
        const payload = settingsRestorePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        const result = await this.options.settings.restoreBackup(payload.data.backupId, source)
        return result.ok
          ? createRuntimeSuccess(
              request,
              settingsMutationResponseSchema.parse(result.value),
              context
            )
          : this.settingsFailure(request, result.error, context)
      }
      case 'settings.reset': {
        const payload = settingsResetPayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        const result = await this.options.settings.reset(payload.data.scope, source)
        return result.ok
          ? createRuntimeSuccess(
              request,
              settingsMutationResponseSchema.parse(result.value),
              context
            )
          : this.settingsFailure(request, result.error, context)
      }
      case 'site.get-context': {
        if (!emptyPayloadSchema.safeParse(request.payload).success) {
          return this.invalidPayload(request, context)
        }
        const result = await this.options.siteAccess.getContext()
        return createRuntimeSuccess(request, siteContextResponseSchema.parse(result), context)
      }
      case 'site.set-temporary-disabled': {
        const payload = siteTemporaryDisablePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        const result = await this.options.siteAccess.setTemporaryDisabled(payload.data.disabled)
        return createRuntimeSuccess(
          request,
          siteTemporaryDisableResponseSchema.parse(result),
          context
        )
      }
      case 'site.reconcile': {
        const payload = siteReconcilePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        const result = await this.options.siteAccess.reconcile(payload.data.bootstrapCurrentTab)
        return createRuntimeSuccess(request, siteReconcileResponseSchema.parse(result), context)
      }
      case 'diagnostics.get': {
        if (!emptyPayloadSchema.safeParse(request.payload).success) {
          return this.invalidPayload(request, context)
        }
        const result = await this.options.diagnostics.get()
        return createRuntimeSuccess(request, result, context)
      }
      case 'media.get-state': {
        const payload = mediaGetStatePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        return this.forwardToActiveTab(
          request,
          'media.get-state',
          payload.data,
          mediaPageStateSchema,
          context,
          signal
        )
      }
      case 'media.execute': {
        const payload = mediaExecutePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        return this.forwardToActiveTab(
          request,
          'media.execute',
          payload.data,
          mediaCommandResultResponseSchema,
          context,
          signal
        )
      }
      case 'progress.read': {
        const payload = progressReadPayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        if (this.options.progress === undefined) {
          return createRuntimeError(
            request,
            'INTERNAL_ERROR',
            'progress.error.unavailable',
            true,
            context
          )
        }
        const result = await this.options.progress.read(payload.data, source)
        return result.ok
          ? createRuntimeSuccess(request, progressReadResponseSchema.parse(result.value), context)
          : createRuntimeError(
              request,
              mapProgressError(result.error),
              `progress.error.${result.error.code.toLowerCase()}`,
              false,
              context
            )
      }
      case 'progress.save': {
        const payload = progressSavePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        if (this.options.progress === undefined) {
          return createRuntimeError(
            request,
            'INTERNAL_ERROR',
            'progress.error.unavailable',
            true,
            context
          )
        }
        const result = await this.options.progress.save(payload.data, source)
        return result.ok
          ? createRuntimeSuccess(request, progressSaveResponseSchema.parse(result.value), context)
          : createRuntimeError(
              request,
              mapProgressError(result.error),
              `progress.error.${result.error.code.toLowerCase()}`,
              false,
              context
            )
      }
      case 'progress.delete': {
        const payload = progressDeletePayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        if (this.options.progress === undefined) {
          return createRuntimeError(
            request,
            'INTERNAL_ERROR',
            'progress.error.unavailable',
            true,
            context
          )
        }
        const result = await this.options.progress.delete(payload.data, source)
        return result.ok
          ? createRuntimeSuccess(request, progressDeleteResponseSchema.parse(result.value), context)
          : createRuntimeError(
              request,
              mapProgressError(result.error),
              `progress.error.${result.error.code.toLowerCase()}`,
              false,
              context
            )
      }
      case 'progress.prune': {
        if (!progressPrunePayloadSchema.safeParse(request.payload).success) {
          return this.invalidPayload(request, context)
        }
        if (this.options.progress === undefined) {
          return createRuntimeError(
            request,
            'INTERNAL_ERROR',
            'progress.error.unavailable',
            true,
            context
          )
        }
        const result = await this.options.progress.prune(source)
        return result.ok
          ? createRuntimeSuccess(request, progressPruneResponseSchema.parse(result.value), context)
          : createRuntimeError(
              request,
              mapProgressError(result.error),
              `progress.error.${result.error.code.toLowerCase()}`,
              false,
              context
            )
      }
      case 'media.cross-tab.publish': {
        const payload = crossTabPublishPayloadSchema.safeParse(request.payload)
        if (!payload.success) return this.invalidPayload(request, context)
        if (context.tabId === undefined || context.frameId === undefined) {
          return createRuntimeError(
            request,
            'UNAUTHORIZED_SOURCE',
            'protocol.error.unauthorized-source',
            false,
            context
          )
        }
        if (this.options.crossTab === undefined) {
          return createRuntimeError(
            request,
            'INTERNAL_ERROR',
            'media.error.cross-tab-unavailable',
            true,
            context
          )
        }
        const result = await this.options.crossTab.publish(payload.data, {
          tabId: context.tabId,
          frameId: context.frameId
        })
        return createRuntimeSuccess(request, crossTabPublishResponseSchema.parse(result), context)
      }
      case 'protocol.cancel':
        return createRuntimeSuccess(
          request,
          cancellationResponseSchema.parse({ cancelled: false }),
          context
        )
    }
  }

  private async forwardToActiveTab<T>(
    request: RuntimeRequestEnvelope,
    type: TabRequestType,
    payload: unknown,
    parser: SafeParser<T>,
    context: EnvelopeContext,
    signal: AbortSignal
  ): Promise<unknown> {
    let activeTab: Awaited<ReturnType<TabsPort['getActive']>>
    try {
      activeTab = await this.options.tabs.getActive()
    } catch {
      return createRuntimeError(
        request,
        'TARGET_UNAVAILABLE',
        'media.error.active-tab-unavailable',
        true,
        context
      )
    }
    if (!activeTab) {
      return createRuntimeError(
        request,
        'TARGET_UNAVAILABLE',
        'media.error.no-active-tab',
        false,
        context
      )
    }
    if (signal.aborted) {
      return createRuntimeError(
        request,
        'REQUEST_CANCELLED',
        'protocol.error.request-cancelled',
        false,
        context
      )
    }

    const tabRequest = createTabRequest(type, payload)
    let rawResponse: unknown
    try {
      rawResponse = await this.options.tabs.send(activeTab.id, tabRequest, 0)
    } catch {
      return createRuntimeError(
        request,
        'TARGET_UNAVAILABLE',
        'media.error.content-unavailable',
        true,
        context
      )
    }
    if (signal.aborted) {
      return createRuntimeError(
        request,
        'REQUEST_CANCELLED',
        'protocol.error.request-cancelled',
        false,
        context
      )
    }

    const tabResponse = parseTabResponse(rawResponse)
    if (
      !tabResponse ||
      tabResponse.requestId !== tabRequest.requestId ||
      tabResponse.payload.requestType !== tabRequest.type
    ) {
      return createRuntimeError(
        request,
        'INTERNAL_ERROR',
        'media.error.invalid-content-response',
        false,
        context
      )
    }
    if (tabResponse.type === 'protocol.error') {
      return createRuntimeError(
        request,
        mapTabTransportError(tabResponse.payload.error.code),
        tabResponse.payload.error.messageKey,
        tabResponse.payload.error.retryable,
        context
      )
    }

    const parsed = parser.safeParse(tabResponse.payload.data)
    return parsed.success
      ? createRuntimeSuccess(request, parsed.data, context)
      : createRuntimeError(
          request,
          'INTERNAL_ERROR',
          'media.error.invalid-content-payload',
          false,
          context
        )
  }

  private cancelRequest(
    request: RuntimeRequestEnvelope,
    scope: string,
    context: EnvelopeContext
  ): unknown {
    const payload = protocolCancelPayloadSchema.safeParse(request.payload)
    if (!payload.success) return this.invalidPayload(request, context)
    const controller = this.inFlight.get(`${scope}:${payload.data.targetRequestId}`)
    controller?.abort()
    return createRuntimeSuccess(
      request,
      cancellationResponseSchema.parse({ cancelled: Boolean(controller) }),
      context
    )
  }

  private invalidPayload(request: RuntimeRequestEnvelope, context: EnvelopeContext): unknown {
    return createRuntimeError(
      request,
      'INVALID_PAYLOAD',
      'protocol.error.invalid-payload',
      false,
      context
    )
  }

  private settingsFailure(
    request: RuntimeRequestEnvelope,
    error: SettingsError,
    context: EnvelopeContext
  ): unknown {
    return createRuntimeError(
      request,
      mapSettingsError(error),
      `settings.error.${error.code.toLowerCase()}`,
      false,
      context
    )
  }
}
