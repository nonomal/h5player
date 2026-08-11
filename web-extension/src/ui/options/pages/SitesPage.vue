<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseButton from '../../components/BaseButton.vue'
import BaseToggle from '../../components/BaseToggle.vue'
import ConfirmDialog from '../../components/ConfirmDialog.vue'
import MetricTile from '../../components/MetricTile.vue'
import OptionsPageHeader from '../../components/OptionsPageHeader.vue'
import SettingsPanel from '../../components/SettingsPanel.vue'
import StatusBanner from '../../components/StatusBanner.vue'
import { useOptionsContext } from '../options-context'

const { application, snapshot, busy, t, run } = useOptionsContext()
const revokeDialogOpen = ref(false)
const pendingRemoval = ref<string | null>(null)

const grantedOrigins = computed(() => snapshot.value?.grantedOrigins ?? [])
const siteEntries = computed(() =>
  Object.entries(snapshot.value?.settings.settings.data.sites ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([origin, rule]) => {
      let hostname = origin
      try {
        hostname = new globalThis.URL(origin).hostname
      } catch {
        // Settings schema normally guarantees an origin; keep malformed legacy data displayable.
      }
      return {
        origin,
        rule,
        hostname,
        monogram: hostname.slice(0, 1).toUpperCase() || '?'
      }
    })
)
const allSitesGranted = computed(() =>
  grantedOrigins.value.some(
    (origin) => origin === '<all_urls>' || origin === '*://*/*' || origin === 'http://*/*'
  )
)

async function requestAllSites(): Promise<void> {
  await run(() => application.requestAllSites())
}

async function revokeAllSites(): Promise<void> {
  revokeDialogOpen.value = false
  await run(() => application.revokeAllSites())
}

async function setSiteEnabled(origin: string, enabled: boolean): Promise<void> {
  await run(() => application.setSiteEnabled(origin, enabled))
}

async function removeSite(): Promise<void> {
  const origin = pendingRemoval.value
  pendingRemoval.value = null
  if (origin) await run(() => application.removeSite(origin))
}
</script>

<template>
  <div class="options-page">
    <OptionsPageHeader
      index="03"
      :title="t('options.sitesTitle')"
      :description="t('options.sitesDescription')"
    >
      <template #actions>
        <BaseButton kind="primary" :disabled="busy || allSitesGranted" @click="requestAllSites">
          {{ t('options.allowAllSites') }}
        </BaseButton>
        <BaseButton
          kind="danger"
          :disabled="busy || grantedOrigins.length === 0"
          @click="revokeDialogOpen = true"
        >
          {{ t('options.revokeAllSites') }}
        </BaseButton>
      </template>
    </OptionsPageHeader>

    <StatusBanner
      class="page-notice"
      :tone="grantedOrigins.length > 0 ? 'success' : 'warning'"
      :title="
        grantedOrigins.length > 0 ? t('options.siteAccessReady') : t('status.permissionRequired')
      "
      :detail="allSitesGranted ? t('options.allSitesGranted') : t('options.scopedSitesGranted')"
    />

    <div class="metrics-row">
      <MetricTile
        accent
        :label="t('options.grantedOrigins')"
        :value="String(grantedOrigins.length)"
        :detail="allSitesGranted ? t('options.permissionAll') : t('options.permissionScoped')"
      />
      <MetricTile
        :label="t('options.siteRules')"
        :value="String(siteEntries.length)"
        :detail="t('options.rulesStoredLocally')"
      />
    </div>

    <div class="panel-stack">
      <SettingsPanel
        :title="t('options.permissionScope')"
        :description="t('options.permissionScopeDescription')"
      >
        <ul v-if="grantedOrigins.length > 0" class="origin-list">
          <li v-for="origin in grantedOrigins" :key="origin">
            <span class="origin-signal" aria-hidden="true" />
            <code>{{ origin }}</code>
          </li>
        </ul>
        <div v-else class="empty-state">
          <span aria-hidden="true">∅</span>
          <p>{{ t('options.noGrantedOrigins') }}</p>
        </div>
      </SettingsPanel>

      <SettingsPanel :title="t('options.siteRules')" :description="t('options.sitePrivacyHint')">
        <div v-if="siteEntries.length > 0" class="site-rule-list">
          <article v-for="entry in siteEntries" :key="entry.origin" class="site-rule">
            <div class="site-identity">
              <span class="site-monogram" aria-hidden="true">{{ entry.monogram }}</span>
              <div>
                <strong>{{ entry.hostname }}</strong>
                <code>{{ entry.origin }}</code>
              </div>
            </div>
            <div class="site-actions">
              <BaseToggle
                :model-value="entry.rule.enabled"
                :label="t('options.siteEnabled')"
                :disabled="busy"
                @update:model-value="setSiteEnabled(entry.origin, $event)"
              />
              <BaseButton
                kind="quiet"
                size="sm"
                :disabled="busy"
                @click="pendingRemoval = entry.origin"
              >
                {{ t('options.removeSite') }}
              </BaseButton>
            </div>
          </article>
        </div>
        <div v-else class="empty-state">
          <span aria-hidden="true">—</span>
          <p>{{ t('options.noSites') }}</p>
        </div>
      </SettingsPanel>
    </div>

    <ConfirmDialog
      :open="revokeDialogOpen"
      :title="t('options.revokeAllSitesTitle')"
      :description="t('options.revokeAllSitesDescription')"
      :confirm-label="t('options.revokeAllSites')"
      :cancel-label="t('common.cancel')"
      :busy="busy"
      danger
      @cancel="revokeDialogOpen = false"
      @confirm="revokeAllSites"
    />

    <ConfirmDialog
      :open="pendingRemoval !== null"
      :title="t('options.removeSiteTitle')"
      :description="t('options.removeSiteDescription')"
      :confirm-label="t('common.remove')"
      :cancel-label="t('common.cancel')"
      :busy="busy"
      danger
      @cancel="pendingRemoval = null"
      @confirm="removeSite"
    >
      {{ pendingRemoval }}
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.options-page {
  max-width: 1040px;
}

.page-notice,
.metrics-row {
  margin-bottom: var(--h5-space-5);
}

.metrics-row {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--h5-space-3);
}

.panel-stack {
  display: grid;
  gap: var(--h5-space-5);
}

.origin-list,
.site-rule-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.origin-list {
  display: grid;
  gap: var(--h5-space-2);
}

.origin-list li {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: var(--h5-space-3);
  padding: 0 var(--h5-space-3);
  border: 1px solid var(--h5-border-soft);
  border-radius: var(--h5-radius-sm);
  background: var(--h5-bg-elevated);
}

.origin-signal {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--h5-success);
  box-shadow: 0 0 0 4px rgb(155 213 143 / 0.1);
}

code {
  overflow-wrap: anywhere;
  color: var(--h5-text-muted);
  font-family: var(--h5-font-mono);
  font-size: 11px;
}

.site-rule + .site-rule {
  border-top: 1px solid var(--h5-border-soft);
}

.site-rule {
  display: flex;
  min-height: 82px;
  align-items: center;
  justify-content: space-between;
  gap: var(--h5-space-4);
  padding: var(--h5-space-3) 0;
}

.site-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--h5-space-3);
}

.site-identity > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.site-monogram {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--h5-border);
  border-radius: 50%;
  color: var(--h5-accent-strong);
  font-family: var(--h5-font-display);
}

.site-actions {
  display: flex;
  align-items: center;
  gap: var(--h5-space-4);
}

.empty-state {
  display: grid;
  min-height: 126px;
  place-items: center;
  align-content: center;
  gap: var(--h5-space-2);
  color: var(--h5-text-faint);
  text-align: center;
}

.empty-state span {
  color: var(--h5-accent);
  font-family: var(--h5-font-display);
  font-size: 32px;
}

.empty-state p {
  margin: 0;
}

@media (max-width: 680px) {
  .metrics-row {
    grid-template-columns: 1fr;
  }

  .site-rule,
  .site-actions {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
