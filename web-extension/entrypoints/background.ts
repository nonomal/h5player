import { browser } from 'wxt/browser'
import { parsePhase0Message, type Phase0Pong } from '../src/shared/protocol'

const EXTENSION_VERSION = '0.1.0'

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void browser.storage.local.set({
      'h5player.extension.version': EXTENSION_VERSION,
      'h5player.extension.phase': 0
    })
  })

  browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse): boolean => {
    const message = parsePhase0Message(rawMessage)
    if (!message || message.type !== 'phase0.ping') return false

    const response: Phase0Pong = {
      type: 'phase0.pong',
      requestId: message.requestId,
      extensionVersion: EXTENSION_VERSION
    }
    sendResponse(response)
    return true
  })
})
