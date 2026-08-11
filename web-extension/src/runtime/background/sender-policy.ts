import type { RuntimeRequestEnvelope } from '../../shared/protocol'
import { failure, success, type Result } from '../../shared/result'

export type RuntimeSenderMetadata = {
  id?: string
  url?: string
  tabId?: number
  frameId?: number
}

export type AuthorizedSender = {
  scope: string
  tabId?: number
  frameId?: number
  sessionId?: string
}

const allowedRequestTypes = {
  content: new Set(['protocol.cancel', 'system.ping', 'settings.get']),
  popup: new Set([
    'protocol.cancel',
    'system.ping',
    'settings.get',
    'settings.update',
    'settings.reset',
    'site.get-context',
    'site.set-temporary-disabled',
    'site.reconcile',
    'diagnostics.get',
    'media.get-state',
    'media.execute'
  ]),
  options: new Set([
    'protocol.cancel',
    'system.ping',
    'settings.get',
    'settings.update',
    'settings.export',
    'settings.import',
    'settings.restore-backup',
    'settings.reset',
    'site.get-context',
    'site.set-temporary-disabled',
    'site.reconcile',
    'diagnostics.get'
  ])
} as const

function extensionPageMatches(source: 'popup' | 'options', urlValue: string | undefined): boolean {
  if (!urlValue) return false
  try {
    const url = new URL(urlValue)
    return (
      (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') &&
      url.pathname === `/${source}.html`
    )
  } catch {
    return false
  }
}

export function authorizeRuntimeSender(
  request: RuntimeRequestEnvelope,
  sender: RuntimeSenderMetadata,
  extensionId: string
): Result<AuthorizedSender, 'UNAUTHORIZED_SOURCE'> {
  if (sender.id !== extensionId || !allowedRequestTypes[request.source].has(request.type)) {
    return failure('UNAUTHORIZED_SOURCE')
  }

  if (request.tabId !== undefined && request.tabId !== sender.tabId) {
    return failure('UNAUTHORIZED_SOURCE')
  }
  if (request.frameId !== undefined && request.frameId !== sender.frameId) {
    return failure('UNAUTHORIZED_SOURCE')
  }
  if (request.nonce !== undefined) return failure('UNAUTHORIZED_SOURCE')

  if (request.source === 'content') {
    if (
      sender.tabId === undefined ||
      sender.frameId === undefined ||
      request.sessionId === undefined
    ) {
      return failure('UNAUTHORIZED_SOURCE')
    }
    return success({
      scope: `content:${sender.tabId}:${sender.frameId}:${request.sessionId}`,
      tabId: sender.tabId,
      frameId: sender.frameId,
      sessionId: request.sessionId
    })
  }

  if (
    request.tabId !== undefined ||
    request.frameId !== undefined ||
    request.sessionId !== undefined ||
    !extensionPageMatches(request.source, sender.url)
  ) {
    return failure('UNAUTHORIZED_SOURCE')
  }
  return success({
    scope: `${request.source}:${sender.url ?? ''}:${sender.tabId ?? 'extension'}:${sender.frameId ?? 0}`
  })
}
