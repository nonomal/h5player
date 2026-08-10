import { browser } from 'wxt/browser'
import type {
  BrowserStoragePort,
  PermissionRequest,
  PermissionsPort,
  RuntimeTransportPort,
  TabsPort
} from '../../application/ports/browser'

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export class WxtStoragePort implements BrowserStoragePort {
  async get(key: string): Promise<unknown> {
    const stored: unknown = await browser.storage.local.get(key)
    return toRecord(stored)?.[key]
  }

  async set(values: Readonly<Record<string, unknown>>): Promise<void> {
    await browser.storage.local.set({ ...values })
  }

  async remove(keys: readonly string[]): Promise<void> {
    await browser.storage.local.remove([...keys])
  }

  subscribe(listener: Parameters<BrowserStoragePort['subscribe']>[0]): () => void {
    const onChanged = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      area: string
    ) => {
      if (area !== 'local') return
      for (const [key, change] of Object.entries(changes)) {
        listener({ key, oldValue: change.oldValue, newValue: change.newValue })
      }
    }
    browser.storage.onChanged.addListener(onChanged)
    return () => browser.storage.onChanged.removeListener(onChanged)
  }
}

export class WxtRuntimeTransport implements RuntimeTransportPort {
  send(message: unknown): Promise<unknown> {
    return browser.runtime.sendMessage(message)
  }

  async reconnect(): Promise<void> {
    await browser.runtime.getPlatformInfo()
  }
}

export class WxtTabsPort implements TabsPort {
  async getActive(): Promise<{ id: number; url?: string } | null> {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab || tab.id === undefined) return null
    return tab.url ? { id: tab.id, url: tab.url } : { id: tab.id }
  }

  send(tabId: number, message: unknown, frameId?: number): Promise<unknown> {
    return frameId === undefined
      ? browser.tabs.sendMessage(tabId, message)
      : browser.tabs.sendMessage(tabId, message, { frameId })
  }
}

function toBrowserPermissions(request: PermissionRequest): {
  permissions?: readonly string[]
  origins?: readonly string[]
} {
  const converted: { permissions?: readonly string[]; origins?: readonly string[] } = {}
  if (request.permissions) converted.permissions = [...request.permissions]
  if (request.origins) converted.origins = [...request.origins]
  return converted
}

export class WxtPermissionsPort implements PermissionsPort {
  contains(request: PermissionRequest): Promise<boolean> {
    return browser.permissions.contains(
      toBrowserPermissions(request) as Parameters<typeof browser.permissions.contains>[0]
    )
  }

  request(request: PermissionRequest): Promise<boolean> {
    return browser.permissions.request(
      toBrowserPermissions(request) as Parameters<typeof browser.permissions.request>[0]
    )
  }

  remove(request: PermissionRequest): Promise<boolean> {
    return browser.permissions.remove(
      toBrowserPermissions(request) as Parameters<typeof browser.permissions.remove>[0]
    )
  }
}
