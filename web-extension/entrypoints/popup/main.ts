import { createApp } from 'vue'
import { WxtRuntimeTransport } from '../../src/infrastructure/browser/wxt-browser-ports'
import { RuntimeApiClient } from '../../src/infrastructure/messaging/runtime-api-client'
import { RuntimeRequestClient } from '../../src/infrastructure/messaging/request-client'
import { systemScheduler } from '../../src/infrastructure/time/system-time'
import PopupApp from '../../src/ui/popup/PopupApp.vue'

const api = new RuntimeApiClient(
  new RuntimeRequestClient('popup', new WxtRuntimeTransport(), systemScheduler)
)

createApp(PopupApp, { api }).mount('#app')
