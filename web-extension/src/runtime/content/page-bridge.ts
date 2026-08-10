import type { SchedulerPort, Teardown } from '../../application/ports/browser'
import type { ReplayGuard } from '../../infrastructure/messaging/replay-guard'
import { createBridgeMessage } from '../../shared/protocol'
import { validateBridgeEvent, type BridgeSession } from './bridge-validation'

type PageBridgeOptions = {
  window: Window
  session: BridgeSession
  replayGuard: ReplayGuard
  scheduler: SchedulerPort
  injectPageMain: () => Promise<void>
  timeoutMs?: number
}

export class PageBridge {
  private ready = false
  private stopped = false
  private resolveReady: ((value: boolean) => void) | null = null
  private timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null

  constructor(private readonly options: PageBridgeOptions) {}

  async start(): Promise<boolean> {
    if (this.stopped) return false
    this.options.window.addEventListener('message', this.onMessage)

    const readyPromise = new Promise<boolean>((resolve) => {
      this.resolveReady = resolve
      this.timeoutHandle = this.options.scheduler.setTimeout(
        () => this.finish(false),
        this.options.timeoutMs ?? 3_000
      )
    })

    try {
      await this.options.injectPageMain()
      this.post('bridge.init')
      return await readyPromise
    } catch {
      this.finish(false)
      return false
    }
  }

  ping(): void {
    if (this.ready && !this.stopped) this.post('bridge.ping')
  }

  stop(): void {
    if (this.stopped) return
    if (this.ready) this.post('bridge.dispose')
    this.stopped = true
    this.ready = false
    this.options.window.removeEventListener('message', this.onMessage)
    this.finish(false)
  }

  teardown(): Teardown {
    return () => this.stop()
  }

  private readonly onMessage = (event: MessageEvent<unknown>): void => {
    const message = validateBridgeEvent(
      event,
      this.options.window,
      this.options.session,
      'page-main'
    )
    if (!message) return
    const scope = `page-main:${this.options.session.sessionId}`
    if (!this.options.replayGuard.accept(scope, message.requestId)) return

    if (message.type === 'bridge.ready') {
      this.ready = true
      this.finish(true)
    }
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
