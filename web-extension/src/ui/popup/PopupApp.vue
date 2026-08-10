<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RuntimeApiPort } from '../../application/runtime/runtime-api-port'
import type { MediaPageState } from '../../application/media'
import type { MediaCommand } from '../../domain/command'

const props = defineProps<{ api: RuntimeApiPort }>()
const runtimeStatus = ref<'checking' | 'ready' | 'unavailable'>('checking')
const pageStatus = ref<'checking' | 'ready' | 'no-media' | 'unavailable'>('checking')
const commandStatus = ref<'idle' | 'running' | 'error'>('idle')
const commandError = ref<string | null>(null)
const extensionVersion = ref('0.1.0')
const settingsRevision = ref<number | null>(null)
const mediaState = ref<MediaPageState | null>(null)
const abortController = new AbortController()

const activeMedia = computed(() => {
  const state = mediaState.value
  if (!state?.activeMediaId) return null
  return state.media.find((media) => media.id === state.activeMediaId) ?? null
})

function applyMediaState(state: MediaPageState): void {
  mediaState.value = state
  pageStatus.value = state.activeMediaId === null ? 'no-media' : 'ready'
}

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
    if (!abortController.signal.aborted) {
      runtimeStatus.value = 'unavailable'
      pageStatus.value = 'unavailable'
    }
    return
  }

  try {
    applyMediaState(await props.api.getMediaState({ signal: abortController.signal }))
  } catch {
    if (!abortController.signal.aborted) pageStatus.value = 'unavailable'
  }
})

onBeforeUnmount(() => abortController.abort())

async function execute(command: MediaCommand): Promise<void> {
  commandStatus.value = 'running'
  commandError.value = null
  try {
    const response = await props.api.executeMediaCommand(command, {
      signal: abortController.signal
    })
    applyMediaState(response.state)
    if (!response.result.ok) {
      commandStatus.value = 'error'
      commandError.value = response.result.error.code
      return
    }
    commandStatus.value = 'idle'
  } catch {
    if (!abortController.signal.aborted) {
      commandStatus.value = 'error'
      commandError.value = 'TARGET_UNAVAILABLE'
      pageStatus.value = 'unavailable'
    }
  }
}
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

    <section class="media-panel" aria-labelledby="media-title">
      <h2 id="media-title">当前页面</h2>
      <p v-if="pageStatus === 'checking'">正在读取媒体状态…</p>
      <p v-else-if="pageStatus === 'unavailable'" role="status">当前页面未连接扩展</p>
      <p v-else-if="pageStatus === 'no-media'" role="status">当前页面没有可控制媒体</p>
      <template v-else-if="activeMedia">
        <p data-testid="active-media">
          {{ activeMedia.kind === 'audio' ? '音频' : '视频' }} ·
          {{ activeMedia.state === 'active' ? '播放中' : '已暂停' }}
        </p>
        <p class="metrics">
          速度 {{ activeMedia.metrics.playbackRate.toFixed(2) }}× · 音量
          {{ Math.round(activeMedia.metrics.volume * 100) }}%
          {{ activeMedia.metrics.muted ? ' · 已静音' : '' }}
        </p>
        <div class="controls" aria-label="媒体控制">
          <button
            type="button"
            :disabled="commandStatus === 'running'"
            @click="
              execute({
                type: activeMedia.state === 'active' ? 'media.pause' : 'media.play',
                mediaId: activeMedia.id
              })
            "
          >
            {{ activeMedia.state === 'active' ? '暂停' : '播放' }}
          </button>
          <button
            type="button"
            :disabled="commandStatus === 'running' || !activeMedia.capabilities.seek"
            @click="execute({ type: 'media.seek', mediaId: activeMedia.id, deltaSeconds: -10 })"
          >
            后退 10 秒
          </button>
          <button
            type="button"
            :disabled="commandStatus === 'running' || !activeMedia.capabilities.seek"
            @click="execute({ type: 'media.seek', mediaId: activeMedia.id, deltaSeconds: 10 })"
          >
            前进 10 秒
          </button>
          <button
            type="button"
            :disabled="commandStatus === 'running' || !activeMedia.capabilities.playbackRate"
            @click="execute({ type: 'media.adjust-rate', mediaId: activeMedia.id, delta: -0.1 })"
          >
            减速
          </button>
          <button
            type="button"
            :disabled="commandStatus === 'running' || !activeMedia.capabilities.playbackRate"
            @click="execute({ type: 'media.adjust-rate', mediaId: activeMedia.id, delta: 0.1 })"
          >
            加速
          </button>
          <button
            type="button"
            :disabled="commandStatus === 'running' || !activeMedia.capabilities.volume"
            @click="execute({ type: 'media.adjust-volume', mediaId: activeMedia.id, delta: -0.05 })"
          >
            降低音量
          </button>
          <button
            type="button"
            :disabled="commandStatus === 'running' || !activeMedia.capabilities.volume"
            @click="execute({ type: 'media.adjust-volume', mediaId: activeMedia.id, delta: 0.05 })"
          >
            提高音量
          </button>
          <button
            type="button"
            :disabled="commandStatus === 'running' || !activeMedia.capabilities.mute"
            @click="execute({ type: 'media.toggle-mute', mediaId: activeMedia.id })"
          >
            {{ activeMedia.metrics.muted ? '取消静音' : '静音' }}
          </button>
        </div>
        <p v-if="commandStatus === 'running'" role="status">正在执行命令…</p>
        <p v-else-if="commandStatus === 'error'" role="alert">命令失败：{{ commandError }}</p>
      </template>
    </section>

    <p v-if="settingsRevision !== null" class="revision">配置版本 {{ settingsRevision }}</p>
    <p class="version">扩展版本 {{ extensionVersion }}</p>
  </main>
</template>

<style scoped>
.popup-shell {
  min-width: 320px;
  max-width: 380px;
  padding: 16px;
  color: #172033;
  font:
    14px/1.5 system-ui,
    sans-serif;
}

h1,
h2 {
  margin: 0 0 8px;
}

h1 {
  font-size: 16px;
}

h2 {
  font-size: 14px;
}

.media-panel {
  margin: 12px 0;
  padding: 12px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
}

.metrics,
.revision,
.version {
  color: #5b6475;
  font-size: 12px;
}

.controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

button {
  min-height: 32px;
}
</style>
