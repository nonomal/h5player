<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { RuntimeApiPort } from '../../application/runtime/runtime-api-port'

const props = defineProps<{ api: RuntimeApiPort }>()
const runtimeStatus = ref<'checking' | 'ready' | 'unavailable'>('checking')
const extensionVersion = ref('0.1.0')
const settingsRevision = ref<number | null>(null)
const abortController = new AbortController()

onMounted(async () => {
  try {
    const [ping, settings] = await Promise.all([
      props.api.ping({ signal: abortController.signal }),
      props.api.getSettings({ signal: abortController.signal })
    ])
    extensionVersion.value = ping.extensionVersion
    settingsRevision.value = settings.settings.revision
    runtimeStatus.value = 'ready'
  } catch {
    if (!abortController.signal.aborted) runtimeStatus.value = 'unavailable'
  }
})

onBeforeUnmount(() => abortController.abort())
</script>

<template>
  <main class="popup-shell" aria-labelledby="title">
    <h1 id="title">H5Player Web Extension</h1>
    <p data-testid="phase-status">
      状态：{{
        runtimeStatus === 'ready'
          ? '平台内核已连接'
          : runtimeStatus === 'checking'
            ? '连接中…'
            : '不可用'
      }}
    </p>
    <p v-if="settingsRevision !== null" class="revision">配置版本 {{ settingsRevision }}</p>
    <p class="version">扩展版本 {{ extensionVersion }}</p>
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

.revision,
.version {
  color: #5b6475;
  font-size: 12px;
}
</style>
