import { startPageMainRuntime } from '../src/runtime/page-main/page-main-runtime'

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    startPageMainRuntime(window, document)
  }
})
