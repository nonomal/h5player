import type { SiteAdapterDefinition } from '../../domain/adapter'

export const SITE_ADAPTER_DEFINITIONS = Object.freeze([
  {
    id: 'youtube',
    version: '1.0.0',
    priority: 100,
    owner: 'Web Extension Compatibility',
    tier: 1,
    supportLevel: 'preview',
    fixture: 'youtube.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'youtube.com' }, { hostname: 'www.youtube.com' }],
    features: ['playback', 'fullscreen-native'],
    selectors: {
      play: ['.ytp-play-button'],
      pause: ['.ytp-play-button'],
      fullscreenNative: ['.ytp-fullscreen-button']
    }
  },
  {
    id: 'bilibili',
    version: '1.0.0',
    priority: 100,
    owner: 'Web Extension Compatibility',
    tier: 1,
    supportLevel: 'preview',
    fixture: 'bilibili.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'bilibili.com' }, { hostname: 'www.bilibili.com' }],
    features: ['playback', 'fullscreen-native', 'fullscreen-web'],
    selectors: {
      play: ['.bpx-player-ctrl-play', '.bilibili-player-video-btn-start'],
      pause: ['.bpx-player-ctrl-play', '.bilibili-player-video-btn-start'],
      fullscreenNative: ['.bpx-player-ctrl-full', '.bilibili-player-video-btn-fullscreen'],
      fullscreenWeb: ['.bpx-player-ctrl-web-enter', '.bpx-player-ctrl-web-leave']
    }
  },
  {
    id: 'tencent-video',
    version: '1.0.0',
    priority: 100,
    owner: 'Web Extension Compatibility',
    tier: 1,
    supportLevel: 'preview',
    fixture: 'tencent-video.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'v.qq.com' }, { hostname: 'sports.qq.com' }],
    features: ['playback', 'fullscreen-native', 'fullscreen-web'],
    selectors: {
      play: ['.container_inner .txp-shadow-mod'],
      pause: ['.container_inner .txp-shadow-mod'],
      fullscreenNative: ['txpdiv[data-report="window-fullscreen"]'],
      fullscreenWeb: ['txpdiv[data-report="browser-fullscreen"]']
    }
  },
  {
    id: 'iqiyi',
    version: '1.0.0',
    priority: 100,
    owner: 'Web Extension Compatibility',
    tier: 1,
    supportLevel: 'preview',
    fixture: 'iqiyi.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'iqiyi.com' }, { hostname: 'www.iqiyi.com' }],
    features: ['fullscreen-native', 'fullscreen-web'],
    selectors: {
      fullscreenNative: ['.iqp-btn-fullscreen'],
      fullscreenWeb: ['.iqp-btn-webscreen']
    }
  },
  {
    id: 'youku',
    version: '1.0.0',
    priority: 100,
    owner: 'Web Extension Compatibility',
    tier: 1,
    supportLevel: 'preview',
    fixture: 'youku.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'youku.com' }, { hostname: 'v.youku.com' }],
    features: ['fullscreen-native'],
    selectors: {
      fullscreenNative: ['.control-fullscreen-icon']
    }
  },
  {
    id: 'netflix',
    version: '1.0.0',
    priority: 80,
    owner: 'Web Extension Compatibility',
    tier: 2,
    supportLevel: 'best-effort',
    fixture: 'netflix.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'netflix.com' }, { hostname: 'www.netflix.com' }],
    features: ['fullscreen-native'],
    selectors: { fullscreenNative: ['button.button-nfplayerFullscreen'] }
  },
  {
    id: 'ixigua',
    version: '1.0.0',
    priority: 80,
    owner: 'Web Extension Compatibility',
    tier: 2,
    supportLevel: 'best-effort',
    fixture: 'ixigua.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'ixigua.com' }, { hostname: 'www.ixigua.com' }],
    features: ['fullscreen-native', 'fullscreen-web'],
    selectors: {
      fullscreenNative: ['xg-fullscreen.xgplayer-fullscreen'],
      fullscreenWeb: ['xg-cssfullscreen.xgplayer-cssfullscreen']
    }
  },
  {
    id: 'acfun',
    version: '1.0.0',
    priority: 80,
    owner: 'Web Extension Compatibility',
    tier: 2,
    supportLevel: 'best-effort',
    fixture: 'acfun.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'acfun.cn' }, { hostname: 'www.acfun.cn' }],
    features: ['fullscreen-native', 'fullscreen-web'],
    selectors: {
      fullscreenNative: ['[data-bind-key="screenTip"]'],
      fullscreenWeb: ['[data-bind-key="webTip"]']
    }
  },
  {
    id: 'sohu-video',
    version: '1.0.0',
    priority: 80,
    owner: 'Web Extension Compatibility',
    tier: 2,
    supportLevel: 'best-effort',
    fixture: 'sohu-video.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'tv.sohu.com' }],
    features: ['fullscreen-native', 'fullscreen-web'],
    selectors: {
      fullscreenNative: ['button[data-title="网页全屏"]'],
      fullscreenWeb: ['button[data-title="全屏"]']
    }
  },
  {
    id: 'ted',
    version: '1.0.0',
    priority: 80,
    owner: 'Web Extension Compatibility',
    tier: 2,
    supportLevel: 'best-effort',
    fixture: 'ted.html',
    lastVerified: '2026-08-11',
    matches: [{ hostname: 'ted.com' }, { hostname: 'www.ted.com' }],
    features: ['fullscreen-native'],
    selectors: { fullscreenNative: ['button.Fullscreen'] }
  }
] as const satisfies readonly SiteAdapterDefinition[])
