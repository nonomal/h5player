<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { browser } from 'wxt/browser'
import { createSessionId } from '../../shared/ids'
import { phase0PongSchema } from '../../shared/protocol'

const runtimeStatus = ref<'checking' | 'ready' | 'unavailable'>('checking')
const extensionVersion = ref('0.1.0')

onMounted(() => {
  if (!browser?.runtime) {
    runtimeStatus.value = 'unavailable'
    return
  }

  void browser.runtime
    .sendMessage({ type: 'phase0.ping', requestId: createSessionId() })
    .then((response) => {
      const parsed = phase0PongSchema.safeParse(response)
      if (!parsed.success) {
        runtimeStatus.value = 'unavailable'
        return
      }
      extensionVersion.value = parsed.data.extensionVersion
      runtimeStatus.value = 'ready'
    })
    .catch(() => {
      runtimeStatus.value = 'unavailable'
    })
})
</script>

<template>
  <main class="popup-shell" aria-labelledby="title">
    <h1 id="title">H5Player Web Extension</h1>
    <p data-testid="phase-status">
      状态：{{
        runtimeStatus === 'ready'
          ? '基础运行时已连接'
          : runtimeStatus === 'checking'
            ? '连接中…'
            : '不可用'
      }}
    </p>
    <p class="version">版本 {{ extensionVersion }}</p>
  </main>
</template>

<style scoped>
.popup-shell {
  min-width: 280px;
  padding: 16px;
  color: #172033;
  font:
    14px/1.5 system-ui,
    sans-serif;
}

h1 {
  margin: 0 0 8px;
  font-size: 16px;
}

.version {
  color: #5b6475;
  font-size: 12px;
}
</style>
