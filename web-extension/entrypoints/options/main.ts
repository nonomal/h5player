import { createApp } from 'vue'
import { WxtRuntimeTransport } from '../../src/infrastructure/browser/wxt-browser-ports'
import { RuntimeApiClient } from '../../src/infrastructure/messaging/runtime-api-client'
import { RuntimeRequestClient } from '../../src/infrastructure/messaging/request-client'
import { systemScheduler } from '../../src/infrastructure/time/system-time'
import OptionsApp from '../../src/ui/options/OptionsApp.vue'

const api = new RuntimeApiClient(
  new RuntimeRequestClient('options', new WxtRuntimeTransport(), systemScheduler)
)

createApp(OptionsApp, { api }).mount('#app')
