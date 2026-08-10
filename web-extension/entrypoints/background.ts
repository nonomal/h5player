import { browser } from 'wxt/browser'
import { SettingsService } from '../src/application/settings/settings-service'
import { WxtStoragePort, WxtTabsPort } from '../src/infrastructure/browser/wxt-browser-ports'
import { StructuredLogger } from '../src/infrastructure/logging/structured-logger'
import { ReplayGuard } from '../src/infrastructure/messaging/replay-guard'
import { SettingsRepository } from '../src/infrastructure/storage/settings-repository'
import { systemClock } from '../src/infrastructure/time/system-time'
import { BackgroundRuntime } from '../src/runtime/background/background-runtime'
import type { RuntimeSenderMetadata } from '../src/runtime/background/sender-policy'

function senderMetadata(
  sender: Parameters<Parameters<typeof browser.runtime.onMessage.addListener>[0]>[1]
): RuntimeSenderMetadata {
  const metadata: RuntimeSenderMetadata = {}
  if (sender.id) metadata.id = sender.id
  if (sender.url) metadata.url = sender.url
  if (sender.tab?.id !== undefined) metadata.tabId = sender.tab.id
  if (sender.frameId !== undefined) metadata.frameId = sender.frameId
  return metadata
}

export default defineBackground(() => {
  const logger = new StructuredLogger('background', systemClock)
  const repository = new SettingsRepository(new WxtStoragePort(), systemClock, logger)
  const runtime = new BackgroundRuntime({
    extensionId: browser.runtime.id,
    extensionVersion: browser.runtime.getManifest().version,
    settings: new SettingsService(repository),
    replayGuard: new ReplayGuard(systemClock),
    logger,
    tabs: new WxtTabsPort()
  })

  void runtime.initialize()

  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.set({
      'h5player.extension.version': browser.runtime.getManifest().version,
      'h5player.extension.phase': 1,
      'h5player.extension.protocol': 1,
      'h5player.extension.settings-schema': 1
    })
  })

  browser.runtime.onMessage.addListener((rawMessage, sender, sendResponse): boolean => {
    void runtime.handle(rawMessage, senderMetadata(sender)).then(sendResponse)
    return true
  })
})
