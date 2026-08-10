import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'
import { startPageMainRuntime } from '../src/runtime/page-main/page-main-runtime'

export default defineUnlistedScript(() => {
  startPageMainRuntime(window, document)
})
