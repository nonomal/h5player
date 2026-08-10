# Legacy 功能对照与迁移矩阵

> 文档 ID：REQ-003  
> 状态：Approved as Planning Baseline  
> 负责人：Product Owner / Quality Owner  
> 最后更新：2026-08-10  
> 维护规则：每个里程碑更新状态、测试和差异说明。

状态：`Baseline` 已盘点；`Planned` 已排期；`Building` 开发中；`Verified` 已验证；`Deferred` 明确延期；`Rejected` 不迁移。

## 1. 核心功能矩阵

| ID | Legacy 能力/证据 | Web Extension 目标模块 | 优先级 | 阶段 | 验证 | 初始状态 | 差异说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| FR-BOOT-001 | `src/h5player/index.js:3-35` 启动重试 | runtime/content + page-main | P0 | Phase 2 | integration + e2e | Baseline | 改为幂等会话，不复制 200 次轮询 |
| FR-BOOT-002 | `src/h5player/h5player.js:163-190` 媒体发现 | domain/media + infrastructure/dom | P0 | Phase 2 | unit + fixture + e2e | Baseline | 生命周期显式清理 |
| FR-BOOT-003 | `src/h5player/h5player.js:2767-2782` Shadow DOM | dom observer | P0 | Phase 2 | fixture + e2e | Baseline | 不依赖全局 `_shadowDomList_` |
| FR-SESSION-001 | `src/h5player/h5player.js:138-155` 当前播放器 | media selection service | P0 | Phase 2 | unit + e2e | Baseline | 使用评分规则，不取列表最后一个 |
| FR-CORE-001 | `src/h5player/configManager.js:23-79` 快捷命令配置 | command registry | P0 | Phase 2 | unit + e2e + differential | Baseline | 保留用户语义，不保留对象直调 |
| FR-CORE-002 | `src/h5player/h5player.js` 音量控制 | command handlers | P0 | Phase 2 | unit + e2e | Baseline | 统一范围与错误 |
| FR-CORE-003 | `src/h5player/configManager.js` enhance 开关 | media policy | P0 | Phase 3 | unit + adversarial fixture | Baseline | 逐能力启用 Hook |
| FR-HOTKEY-001 | `src/h5player/configManager.js:23-100+` 默认快捷键 | hotkey registry | P0 | Phase 3 | unit + component + e2e | Baseline | 默认集经冲突审查后冻结 |
| FR-HOTKEY-002 | `src/libs/utils/hotkeysRunner.js` | hotkey interpreter | P0 | Phase 3 | keyboard matrix | Baseline | 明确 editable/repeat 规则 |
| FR-VISUAL-001 | `src/h5player/h5player.js:71-96` transform 状态 | visual command module | P1 | Phase 4 | unit + screenshot e2e | Baseline | 状态按 MediaSession 隔离 |
| FR-VISUAL-003 | `src/libs/FullScreen/index.js`、TCC | fullscreen/PiP capability | P1 | Phase 4 | fixture + browser e2e | Baseline | 站点能力优先、通用实现兜底 |
| FR-MEDIA-001 | `src/libs/videoCapturer/index.js` | capture module | P1 | Phase 4 | canvas fixture + e2e | Baseline | 明确 CORS/DRM 失败 |
| FR-MEDIA-002 | `src/h5player/h5player.js` 进度记录 | progress repository | P1 | Phase 4 | migration + time tests | Baseline | 加过期、容量和隐私开关 |
| FR-MEDIA-003 | `src/h5player/monkeyMsg.js:98-131` 广播 | cross-tab event service | P1 | Phase 3 | multi-page integration | Baseline | 移除 2 秒轮询广播 |
| FR-MEDIA-004 | `src/h5player/mediaSource.js`、`mediaDownload.js` | experimental media package | P2 | Phase 7 | security + perf + e2e | Deferred | 独立权限和开关 |
| FR-ADAPTER-001 | `src/h5player/h5PlayerTccInit.js` 通用回退 | generic adapter | P0 | Phase 2 | fixture + e2e | Baseline | 通用能力不依赖站点表 |
| FR-ADAPTER-002 | `src/h5player/h5PlayerTccInit.js:75-600` 站点任务 | site adapter registry | P1 | Phase 5 | per-adapter fixture | Baseline | 每个适配器独立文件与测试 |
| FR-ADAPTER-005 | `src/h5player/h5player.js:2657-2705` 外部函数配置 | declarative custom rules | P2 | Phase 7 | schema + security tests | Deferred | 不执行任意函数 |
| FR-CONFIG-001 | `src/h5player/configManager.js`、`libs/monkey/configManager.ts` | settings domain + repository | P0 | Phase 1 | unit + migration | Baseline | 单一权威和 schemaVersion |
| FR-CONFIG-003 | `src/h5player/monkeyStorageProxy.js` | settings service | P0 | Phase 1 | concurrency integration | Baseline | 字段级/版本化更新 |
| FR-UI-001 | `web-extension/popup.*` | popup application | P0 | Phase 3 | component + extension e2e | Baseline | 不按数组 index 执行函数 |
| FR-UI-002 | Legacy 菜单/配置编辑器 | options application | P0 | Phase 3 | component + e2e | Planned | 原生设置页，不跳转远程 JSON 编辑器 |
| FR-UI-003 | `src/h5player/ui/h5playerUI.js` | overlay components | P1 | Phase 4 | component + visual e2e | Baseline | 不复用生成的 `h5playerUI.es.js` |
| FR-DIAG-001 | `src/h5player/debug.js` | structured logger | P0 | Phase 1 | unit + redaction tests | Baseline | 默认本地、限量、结构化 |
| FR-DIAG-002 | 当前无正式诊断导出 | diagnostics service | P0 | Phase 3 | redaction + e2e | Planned | 新能力 |

## 2. 菜单与全局功能迁移

| Legacy 功能 | 目标入口 | 决策 |
| --- | --- | --- |
| 启用/禁用当前站点 | popup + options 站点规则 | P0 迁移 |
| UI 开关 | popup/options | P0 迁移 |
| 快捷键开关 | popup/options | P0 迁移 |
| 恢复配置 | options 数据管理 | P0 迁移并增加备份 |
| 官网/Issue/ChangeLog | popup/about | P1 迁移为固定链接 |
| 自定义配置编辑器 | options 声明式规则 | P2 重设计 |
| 推荐/AI 项目/远程 helper | 无 | 首发拒绝，未来单独产品决策 |
| 捐赠入口 | about | P2，不影响核心验收 |

## 3. 站点迁移优先级

### Tier 1：自动化保护、Stable 必须

- 通用 fixture（普通 video、多 video、SPA、Shadow DOM、iframe）。
- YouTube、Bilibili、腾讯视频、爱奇艺、优酷。

### Tier 2：Beta 目标，至少手工 + 部分 fixture

- Douyin、Xigua、Zhihu、Weibo/X、Baidu Pan、Alibaba Drive、TED。

### Tier 3：社区/尽力支持

- 其他历史站点；按 Issue、使用量和适配复杂度迁移。

站点具体顺序必须考虑可自动化访问性、登录/地区限制和法律政策；无法稳定自动化的网站以脱敏 DOM fixture + 发布前手工 smoke 代替，并记录测试缺口。

## 4. 明确不保持的 Legacy 行为

- 向页面 `window` 挂载完整 `_h5Player` 调试对象。
- 通过 `window.GM_*` 兼容函数和页面 `localStorage` 模拟同步存储。
- 把函数对象放入菜单列表再尝试跨消息/存储传输。
- 修改站点 CSP 以允许 `unsafe-inline`/`unsafe-eval`。
- 通过 Data URI 或 `new Function` 执行扩展源码。
- 隐式加载远程 iframe 获取推荐内容。
- 执行外部自定义配置中的任意 JavaScript 函数。

## 5. 维护要求

- 任务进入 `In Progress` 前更新“目标模块、阶段、验证”。
- 验证完成后链接对应测试文件或 CI artifact。
- 行为不一致时不得简单标注“兼容问题”；必须写清输入、Legacy 结果、新结果和接受理由。
- Stable 发布评审使用本矩阵确认所有 P0 为 `Verified`，P1 未完成项有明确接受记录。
