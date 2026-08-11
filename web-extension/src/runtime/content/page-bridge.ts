import type { SchedulerPort, Teardown } from '../../application/ports/browser'
import type {
  MediaCommandResultResponse,
  MediaPageState,
  MediaPageStateSummary
} from '../../application/media'
import type { MediaCommand } from '../../domain/command'
import type { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import {
  createPageMediaRequest,
  type PageMediaMessage,
  type PageMediaMessageType
} from '../../infrastructure/messaging/page-media-protocol'
import { createBridgeMessage } from '../../shared/protocol'
import {
  validateBridgeEvent,
  validatePageMediaEvent,
  type BridgeSession
} from './bridge-validation'

type PageBridgeOptions = {
  window: Window
  session: BridgeSession
  replayGuard: ReplayGuard
  scheduler: SchedulerPort
  injectPageMain: () => Promise<void>
  timeoutMs?: number
}

type PendingRequest = {
  readonly requestType: 'media.context' | 'media.get-state' | 'media.execute'
  readonly expectedType: PageMediaMessageType
  readonly resolve: (message: PageMediaMessage) => void
  readonly reject: (error: PageBridgeError) => void
  readonly timeoutHandle: ReturnType<typeof globalThis.setTimeout>
}

export class PageBridgeError extends Error {
  constructor(
    readonly code:
      | 'BRIDGE_UNAVAILABLE'
      | 'REQUEST_TIMEOUT'
      | 'INVALID_RESPONSE'
      | 'PAGE_RUNTIME_UNAVAILABLE'
      | 'INTERNAL_ERROR',
    message: string
  ) {
    super(message)
    this.name = 'PageBridgeError'
  }
}

export class PageBridge {
  private ready = false
  private configured = false
  private stopped = false
  private resolveReady: ((value: boolean) => void) | null = null
  private timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null
  private startPromise: Promise<boolean> | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private readonly stateListeners = new Set<(summary: MediaPageStateSummary) => void>()

  constructor(private readonly options: PageBridgeOptions) {}

  async start(): Promise<boolean> {
    if (this.stopped) return false
    if (this.ready) return true
    if (this.startPromise) return this.startPromise
    this.options.window.addEventListener('message', this.onMessage)

    this.startPromise = new Promise<boolean>((resolve) => {
      this.resolveReady = resolve
      this.timeoutHandle = this.options.scheduler.setTimeout(
        () => this.finish(false),
        this.options.timeoutMs ?? 3_000
      )
    })

    try {
      await this.options.injectPageMain()
      this.post('bridge.init')
      return await this.startPromise
    } catch {
      this.finish(false)
      return false
    }
  }

  async configure(frameId: number): Promise<boolean> {
    if (!this.ready || this.stopped) return false
    if (this.configured) return true
    const request = createPageMediaRequest(
      'media.context',
      this.options.session.sessionId,
      this.options.session.nonce,
      { frameId }
    )
    const response = await this.sendMediaRequest(request, 'media.context-ready')
    this.configured = response.type === 'media.context-ready'
    return this.configured
  }

  async getMediaState(): Promise<MediaPageState> {
    this.assertConfigured()
    const request = createPageMediaRequest(
      'media.get-state',
      this.options.session.sessionId,
      this.options.session.nonce,
      {}
    )
    const response = await this.sendMediaRequest(request, 'media.state')
    if (response.type !== 'media.state') {
      throw new PageBridgeError('INVALID_RESPONSE', 'Unexpected media state response')
    }
    return response.payload.state
  }

  async executeMediaCommand(command: MediaCommand): Promise<MediaCommandResultResponse> {
    this.assertConfigured()
    const request = createPageMediaRequest(
      'media.execute',
      this.options.session.sessionId,
      this.options.session.nonce,
      { command }
    )
    const response = await this.sendMediaRequest(request, 'media.command-result')
    if (response.type !== 'media.command-result') {
      throw new PageBridgeError('INVALID_RESPONSE', 'Unexpected media command response')
    }
    return response.payload
  }

  subscribeMediaStateChanged(listener: (summary: MediaPageStateSummary) => void): Teardown {
    if (this.stopped) return () => undefined
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  ping(): void {
    if (this.ready && !this.stopped) this.post('bridge.ping')
  }

  stop(): void {
    if (this.stopped) return
    if (this.ready) this.post('bridge.dispose')
    this.stopped = true
    this.ready = false
    this.configured = false
    this.options.window.removeEventListener('message', this.onMessage)
    for (const [requestId, request] of this.pending) {
      this.options.scheduler.clearTimeout(request.timeoutHandle)
      request.reject(new PageBridgeError('BRIDGE_UNAVAILABLE', 'Page bridge stopped'))
      this.pending.delete(requestId)
    }
    this.stateListeners.clear()
    this.finish(false)
  }

  teardown(): Teardown {
    return () => this.stop()
  }

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    const lifecycleMessage = validateBridgeEvent(
      event,
      this.options.window,
      this.options.session,
      'page-main'
    )
    const scope = `page-main:${this.options.session.sessionId}`
    if (lifecycleMessage) {
      if (!this.options.replayGuard.accept(scope, lifecycleMessage.requestId)) return
      if (lifecycleMessage.type !== 'bridge.ready') return
      this.ready = true
      this.finish(true)
      return
    }

    const mediaMessage = validatePageMediaEvent(
      event,
      this.options.window,
      this.options.session,
      'page-main'
    )
    if (!mediaMessage || !this.options.replayGuard.accept(scope, mediaMessage.requestId)) return
    if (mediaMessage.type === 'media.state-changed') {
      for (const listener of [...this.stateListeners]) {
        try {
          listener(mediaMessage.payload.summary)
        } catch {
          // One content observer must not break bridge request routing.
        }
      }
      return
    }
    const pending = this.pending.get(mediaMessage.requestId)
    if (!pending) return

    if (mediaMessage.type === 'media.error') {
      if (mediaMessage.payload.requestType !== pending.requestType) return
      this.finishPending(mediaMessage.requestId)
      pending.reject(
        new PageBridgeError(
          mediaMessage.payload.code === 'RUNTIME_UNAVAILABLE'
            ? 'PAGE_RUNTIME_UNAVAILABLE'
            : 'INTERNAL_ERROR',
          mediaMessage.payload.messageKey
        )
      )
      return
    }

    if (mediaMessage.type !== pending.expectedType) return
    this.finishPending(mediaMessage.requestId)
    pending.resolve(mediaMessage)
  }

  private post(type: 'bridge.init' | 'bridge.ping' | 'bridge.dispose'): void {
    this.options.window.postMessage(
      createBridgeMessage(
        type,
        'content',
        this.options.session.sessionId,
        this.options.session.nonce
      ),
      this.options.session.origin
    )
  }

  private sendMediaRequest(
    message: Extract<PageMediaMessage, { source: 'content' }>,
    expectedType: PageMediaMessageType
  ): Promise<PageMediaMessage> {
    if (!this.ready || this.stopped) {
      return Promise.reject(new PageBridgeError('BRIDGE_UNAVAILABLE', 'Page bridge is unavailable'))
    }

    return new Promise<PageMediaMessage>((resolve, reject) => {
      const timeoutHandle = this.options.scheduler.setTimeout(() => {
        const pending = this.pending.get(message.requestId)
        if (!pending) return
        this.pending.delete(message.requestId)
        reject(new PageBridgeError('REQUEST_TIMEOUT', 'Page bridge request timed out'))
      }, this.options.timeoutMs ?? 3_000)

      this.pending.set(message.requestId, {
        requestType: message.type,
        expectedType,
        resolve,
        reject,
        timeoutHandle
      })

      try {
        this.options.window.postMessage(message, this.options.session.origin)
      } catch {
        this.finishPending(message.requestId)
        reject(new PageBridgeError('BRIDGE_UNAVAILABLE', 'Page bridge postMessage failed'))
      }
    })
  }

  private finishPending(requestId: string): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.options.scheduler.clearTimeout(pending.timeoutHandle)
    this.pending.delete(requestId)
  }

  private assertConfigured(): void {
    if (!this.ready || !this.configured || this.stopped) {
      throw new PageBridgeError('PAGE_RUNTIME_UNAVAILABLE', 'Page media runtime is unavailable')
    }
  }

  private finish(value: boolean): void {
    if (this.timeoutHandle) {
      this.options.scheduler.clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
    const resolve = this.resolveReady
    this.resolveReady = null
    resolve?.(value)
  }
}
