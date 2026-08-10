import type {
  BrowserStoragePort,
  ClockPort,
  RuntimeTransportPort,
  StorageChange,
  TabsPort,
  Teardown
} from '../../src/application/ports/browser'
import type { LoggerPort, LogRecord } from '../../src/application/ports/logging'

export class FakeClock implements ClockPort {
  constructor(private current = 1_700_000_000_000) {}

  now(): number {
    return this.current
  }

  advance(milliseconds: number): void {
    this.current += milliseconds
  }
}

export class FakeLogger implements LoggerPort {
  readonly records: Array<Omit<LogRecord, 'timestamp' | 'context'>> = []

  log(record: Omit<LogRecord, 'timestamp' | 'context'>): void {
    this.records.push(record)
  }
}

export class FakeStoragePort implements BrowserStoragePort {
  private readonly values = new Map<string, unknown>()
  private readonly listeners = new Set<(change: StorageChange) => void>()
  failReads = false
  failWrites = false
  writeDelayMs = 0

  constructor(initial: Readonly<Record<string, unknown>> = {}) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value)
  }

  get(key: string): Promise<unknown> {
    if (this.failReads) return Promise.reject(new Error('read failed'))
    return Promise.resolve(this.values.get(key))
  }

  async set(values: Readonly<Record<string, unknown>>): Promise<void> {
    if (this.failWrites) throw new Error('write failed')
    if (this.writeDelayMs > 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, this.writeDelayMs))
    }
    for (const [key, value] of Object.entries(values)) {
      const oldValue = this.values.get(key)
      this.values.set(key, value)
      for (const listener of this.listeners) listener({ key, oldValue, newValue: value })
    }
  }

  remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      const oldValue = this.values.get(key)
      this.values.delete(key)
      for (const listener of this.listeners) {
        listener({ key, oldValue, newValue: undefined })
      }
    }
    return Promise.resolve()
  }

  subscribe(listener: (change: StorageChange) => void): Teardown {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(this.values)
  }
}

export class FakeTransport implements RuntimeTransportPort {
  readonly sent: unknown[] = []
  reconnectCount = 0

  constructor(private readonly handler: (message: unknown) => Promise<unknown>) {}

  send(message: unknown): Promise<unknown> {
    this.sent.push(message)
    return this.handler(message)
  }

  reconnect(): Promise<void> {
    this.reconnectCount += 1
    return Promise.resolve()
  }
}

export class FakeTabsPort implements TabsPort {
  activeTab: { id: number; url?: string } | null = { id: 1, url: 'https://example.com/' }
  readonly sent: Array<{ tabId: number; message: unknown; frameId?: number }> = []
  handler: (message: unknown, tabId: number, frameId?: number) => Promise<unknown> = () =>
    Promise.resolve(null)

  getActive(): Promise<{ id: number; url?: string } | null> {
    return Promise.resolve(this.activeTab)
  }

  send(tabId: number, message: unknown, frameId?: number): Promise<unknown> {
    const sent: { tabId: number; message: unknown; frameId?: number } = { tabId, message }
    if (frameId !== undefined) sent.frameId = frameId
    this.sent.push(sent)
    return this.handler(message, tabId, frameId)
  }
}
