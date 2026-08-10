import type { LoggerPort } from '../../application/ports/logging'
import {
  cancellationResponseSchema,
  emptyPayloadSchema,
  protocolCancelPayloadSchema,
  settingsImportPayloadSchema,
  settingsMutationResponseSchema,
  settingsRestorePayloadSchema,
  settingsSnapshotResponseSchema,
  settingsUpdatePayloadSchema,
  systemPingResponseSchema
} from '../../application/settings/contracts'
import type { SettingsService } from '../../application/settings/settings-service'
import type { SettingsError } from '../../application/settings/settings-port'
import type { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import {
  createRuntimeError,
  createRuntimeSuccess,
  parseRuntimeRequest,
  type EnvelopeContext,
  type ProtocolErrorCode,
  type RuntimeRequestEnvelope
} from '../../shared/protocol'
import { authorizeRuntimeSender, type RuntimeSenderMetadata } from './sender-policy'

type BackgroundRuntimeOptions = {
  extensionId: string
  extensionVersion: string
  settings: SettingsService
  replayGuard: ReplayGuard
  logger: LoggerPort
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
        return createRuntimeSuccess(
          request,
          systemPingResponseSchema.parse({
            extensionVersion: this.options.extensionVersion,
            phase: 1,
            protocol: 1,
            settingsSchemaVersion: 1
          }),
          context
        )
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
      case 'protocol.cancel':
        return createRuntimeSuccess(
          request,
          cancellationResponseSchema.parse({ cancelled: false }),
          context
        )
    }
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
