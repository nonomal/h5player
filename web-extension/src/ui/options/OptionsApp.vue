<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { RuntimeApiPort } from '../../application/runtime/runtime-api-port'

const props = defineProps<{ api: RuntimeApiPort }>()
const enabled = ref(true)
const revision = ref<number | null>(null)
const status = ref<'loading' | 'ready' | 'saving' | 'error'>('loading')
const abortController = new AbortController()

onMounted(async () => {
  try {
    const snapshot = await props.api.getSettings({ signal: abortController.signal })
    enabled.value = snapshot.settings.data.global.enabled
    revision.value = snapshot.settings.revision
    status.value = 'ready'
  } catch {
    if (!abortController.signal.aborted) status.value = 'error'
  }
})

onBeforeUnmount(() => abortController.abort())

async function saveEnabled(): Promise<void> {
  if (revision.value === null) return
  status.value = 'saving'
  try {
    const result = await props.api.updateSettings(
      { global: { enabled: enabled.value } },
      revision.value,
      { signal: abortController.signal }
    )
    revision.value = result.settings.revision
    status.value = 'ready'
  } catch {
    if (!abortController.signal.aborted) status.value = 'error'
  }
}
</script>

<template>
  <main class="options-shell" aria-labelledby="title">
    <h1 id="title">H5Player 设置</h1>
    <label>
      <input
        v-model="enabled"
        type="checkbox"
        :disabled="status !== 'ready'"
        @change="saveEnabled"
      />
      在获得站点权限后启用扩展
    </label>
    <p role="status">
      {{
        status === 'loading'
          ? '正在读取配置…'
          : status === 'saving'
            ? '正在保存…'
            : status === 'error'
              ? '配置服务不可用'
              : `当前状态：${enabled ? '启用' : '停用'}`
      }}
    </p>
    <p v-if="revision !== null" class="revision">配置版本 {{ revision }}</p>
  </main>
</template>

<style scoped>
.options-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px;
  color: #172033;
  font:
    16px/1.5 system-ui,
    sans-serif;
}

.revision {
  color: #5b6475;
  font-size: 12px;
}
</style>
