import { mergeSettings } from './merge'
import type { GlobalSettings, SettingsData, SettingsPatch, SiteOverride } from './schema'
import { normalizeSiteOrigin } from './site-identity'

function applySiteOverride(settings: GlobalSettings, override: SiteOverride): GlobalSettings {
  return {
    ...settings,
    enabled: override.enabled,
    ui: {
      ...settings.ui,
      overlayEnabled: override.ui?.overlayEnabled ?? settings.ui.overlayEnabled
    },
    media: {
      defaultPlaybackRate:
        override.media?.defaultPlaybackRate ?? settings.media.defaultPlaybackRate,
      defaultVolume: override.media?.defaultVolume ?? settings.media.defaultVolume,
      restoreProgress: override.media?.restoreProgress ?? settings.media.restoreProgress
    },
    policies: {
      protectPlaybackRate:
        override.policies?.protectPlaybackRate ?? settings.policies.protectPlaybackRate,
      protectCurrentTime:
        override.policies?.protectCurrentTime ?? settings.policies.protectCurrentTime,
      protectVolume: override.policies?.protectVolume ?? settings.policies.protectVolume,
      allowExperimental: override.policies?.allowExperimental ?? settings.policies.allowExperimental
    },
    hotkeys: { ...settings.hotkeys, bindings: { ...settings.hotkeys.bindings } },
    diagnostics: { ...settings.diagnostics }
  }
}

export function resolveSettings(
  settings: SettingsData,
  siteOrigin?: string,
  sessionOverride?: SettingsPatch
): GlobalSettings {
  let resolved: GlobalSettings = {
    ...settings.global,
    ui: { ...settings.global.ui },
    hotkeys: { ...settings.global.hotkeys, bindings: { ...settings.global.hotkeys.bindings } },
    media: { ...settings.global.media },
    policies: { ...settings.global.policies },
    diagnostics: { ...settings.global.diagnostics }
  }

  if (siteOrigin) {
    const normalized = normalizeSiteOrigin(siteOrigin)
    if (normalized.ok) {
      const siteOverride = settings.sites[normalized.value]
      if (siteOverride) resolved = applySiteOverride(resolved, siteOverride)
    }
  }

  if (!sessionOverride?.global) return resolved

  const sessionData: SettingsData = {
    global: resolved,
    sites: {},
    progress: {}
  }
  return mergeSettings(sessionData, { global: sessionOverride.global }).data.global
}
