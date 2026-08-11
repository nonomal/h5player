# 站点 Adapter 支持矩阵

> 文档 ID：QA-006  
> 状态：Approved for Phase 5 Preview  
> 负责人：Web Extension Compatibility  
> 最后更新：2026-08-11

## 1. 证据边界

本矩阵记录 Web Extension 的静态 adapter catalog 和固定脱敏 fixture。fixture 只证明 hostname/path 匹配、优先级、
声明式选择器、Generic 回退、版本/功能禁用和生命周期隔离；它不访问真实生产站点，因此不能被表述为真实站点 smoke
或账号/DRM/AB 实验环境的完整支持。

## 2. 当前矩阵

| Adapter       | Tier | 支持等级    | Owner                       | Version | Fixture              | 最近 fixture 验证 | 真实站点 smoke | 主要能力/限制                                                |
| ------------- | ---- | ----------- | --------------------------- | ------- | -------------------- | ----------------- | -------------- | ------------------------------------------------------------ |
| YouTube       | 1    | Preview     | Web Extension Compatibility | 1.0.0   | `youtube.html`       | 2026-08-11        | 未执行         | play/pause/fullscreen selector；未迁移广告跳过 Hook          |
| Bilibili      | 1    | Preview     | Web Extension Compatibility | 1.0.0   | `bilibili.html`      | 2026-08-11        | 未执行         | play/pause/native/web fullscreen；不注入弹幕或业务逻辑       |
| Tencent Video | 1    | Preview     | Web Extension Compatibility | 1.0.0   | `tencent-video.html` | 2026-08-11        | 未执行         | play/pause/native/web fullscreen；未迁移 sessionStorage 调速 |
| iQIYI         | 1    | Preview     | Web Extension Compatibility | 1.0.0   | `iqiyi.html`         | 2026-08-11        | 未执行         | native/web fullscreen；未迁移水印样式注入                    |
| Youku         | 1    | Preview     | Web Extension Compatibility | 1.0.0   | `youku.html`         | 2026-08-11        | 未执行         | native fullscreen；未迁移水印隐藏逻辑                        |
| Netflix       | 2    | Best effort | Web Extension Compatibility | 1.0.0   | `netflix.html`       | 2026-08-11        | 未执行         | fullscreen selector；调速仍使用 generic 能力与站点实际限制   |
| Ixigua        | 2    | Best effort | Web Extension Compatibility | 1.0.0   | `ixigua.html`        | 2026-08-11        | 未执行         | native/web fullscreen selector                               |
| AcFun         | 2    | Best effort | Web Extension Compatibility | 1.0.0   | `acfun.html`         | 2026-08-11        | 未执行         | native/web fullscreen selector；未迁移延迟命令 Hook          |
| Sohu Video    | 2    | Best effort | Web Extension Compatibility | 1.0.0   | `sohu-video.html`    | 2026-08-11        | 未执行         | native/web fullscreen selector                               |
| TED           | 2    | Best effort | Web Extension Compatibility | 1.0.0   | `ted.html`           | 2026-08-11        | 未执行         | native fullscreen selector                                   |

## 3. 自动化事实源

- Catalog：`web-extension/src/adapters/sites/catalog.ts`。
- 本地 kill switch：`web-extension/src/adapters/sites/rollback-policy.ts`，禁止远程填充。
- Fixture：`web-extension/tests/fixtures/sites/`。
- 契约测试：`tests/unit/adapter-registry.spec.ts`、`tests/compatibility/site-adapter-fixtures.spec.ts`。
- 冻结基线：`tests/baselines/site-adapters.json`，包含 owner/support level/lastVerified 与 fixture SHA-256。
- 报告：`pnpm test:compat:report`；catalog、support level、owner、fixture 或 hash 未显式同步会失败，lastVerified 超过
  183 天也会阻断。

## 4. 支持声明规则

- Tier 1 fixture 全绿只能写成“Preview adapter fixture verified”。
- 只有在冻结浏览器版本、OS、扩展 SHA、真实 URL 类别、时间和限制的 smoke 证据存在后，才能更新“真实站点 smoke”。
- 任何 adapter 健康度为 degraded/disabled 时，GenericAdapter 必须继续存在，且诊断不得包含完整 URL、title、媒体源或页面文本。
