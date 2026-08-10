<script setup lang="ts">
import { ref } from 'vue'

const enabled = ref(true)
</script>

<template>
  <main class="options-shell" aria-labelledby="title">
    <h1 id="title">H5Player 设置</h1>
    <label>
      <input v-model="enabled" type="checkbox" />
      在获得站点权限后启用扩展
    </label>
    <p role="status">当前状态：{{ enabled ? '启用' : '停用' }}</p>
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
</style>
