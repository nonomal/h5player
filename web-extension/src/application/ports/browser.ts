export type Teardown = () => void

export type StorageChange = {
  key: string
  oldValue: unknown
  newValue: unknown
}

export interface BrowserStoragePort {
  get(key: string): Promise<unknown>
  set(values: Readonly<Record<string, unknown>>): Promise<void>
  remove(keys: readonly string[]): Promise<void>
  subscribe(listener: (change: StorageChange) => void): Teardown
}

export interface RuntimeTransportPort {
  send(message: unknown): Promise<unknown>
  reconnect?(): Promise<void>
}

export type TabSummary = {
  id: number
  url?: string
}

export interface TabsPort {
  getActive(): Promise<TabSummary | null>
  send(tabId: number, message: unknown, frameId?: number): Promise<unknown>
}

export type PermissionRequest = {
  permissions?: readonly string[]
  origins?: readonly string[]
}

export interface PermissionsPort {
  contains(request: PermissionRequest): Promise<boolean>
  request(request: PermissionRequest): Promise<boolean>
  remove(request: PermissionRequest): Promise<boolean>
}

export interface ClockPort {
  now(): number
}

export type TimeoutHandle = ReturnType<typeof globalThis.setTimeout>

export interface SchedulerPort {
  setTimeout(callback: () => void, delayMs: number): TimeoutHandle
  clearTimeout(handle: TimeoutHandle): void
}
