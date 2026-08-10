import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'

export default defineUnlistedScript(() => {
  const root = document.documentElement
  if (!root) return

  root.dataset['h5playerWebextMain'] = 'ready'
  window.postMessage(
    {
      type: 'phase0.content-ready',
      sessionId: root.dataset['h5playerWebextSession'] ?? ''
    },
    window.location.origin
  )
})
