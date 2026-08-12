# Web Extension 重构进度

> 文档 ID：TASK-002  
> 状态：Active  
> 负责人：Project Owner / Quality Owner  
> 最后更新：2026-08-12
> 更新频率：每周或每个开发周期

## 当前阶段

**Phase 6 Exit：发布工程基线 Conditional GO；Stable NO-GO**

整体状态：🟢 release profiles、确定性双端 ZIP、9 文件 evidence bundle、PR/nightly/no-publish RC CI、商店/隐私材料和
运维模板已落地；🟡 branch protection、真实商店演练和两轮 Beta RC 属于外部证据；🔴 Stable 保持 `NO-GO`。
结论以 [Phase 6 Exit Review](../09-reviews/phase-6-exit-review-2026-08-11.md) 为准，不宣告真实 Beta、商店提交、Tier 1
真实站点、完整浏览器版本矩阵或 Stable 发布已经完成。

## 已完成基线

- Legacy 油猴主线继续独立：根 Yarn/Rollup、`src/h5player/`、`src/libs/`、`config/` 和冻结产物未被
  Web Extension 重构改写。
- WXT/Vite 多入口、TypeScript strict、Vue presentation、Vitest、Playwright、Selenium、pnpm lockfile、
  依赖边界和静态安全扫描已形成独立闭环。
- Protocol v1、nonce/replay、sender policy、request lifecycle、Browser Ports、structured logger、
  SettingsRepository、版本迁移与恢复在 Phase 1 建立。
- 通用媒体发现、GenericAdapter、active-player scoring、page/content/background bridge、核心命令和
  双浏览器真实扩展 E2E 在 Phase 2 建立。

## Phase 3 已完成交付

### 快捷键与领域策略

- `domain/hotkey` 提供固定 command ID、物理 `KeyboardEvent.code` chord、规范化、显示、冲突和浏览器保留
  快捷键校验。
- interpreter/controller 明确 editable、player focus、composition、repeat、disabled 和事件消费策略；连续命令
  串行化，异步失败进入 logger。
- DOM event source 使用 composed path 识别输入控件和媒体焦点；页面临时停用、站点停用和全局停用均阻断命令。

### Settings Schema V2 与数据生命周期

- `storage.local` 仍是唯一权威；Schema V2 将快捷键 chord/command ID 收紧为 domain Schema。
- V0/V1 可迁移至 V2；无效旧快捷键在迁移时丢弃，不执行未知命令；future/corrupt 数据不覆盖原值。
- 导入格式升级为 V2，同时兼容 V1；支持预览、262144-byte 上限、原子导入、导出、分类 reset、最近备份和恢复。
- ADR-0008 冻结未来 sync 白名单，但 Preview 不启用 `storage.sync`；跨 Tab 更新只依赖 local change event + revision 重拉。

### 站点权限与动态运行时

- required permissions 固定为 `storage`、`activeTab`、`scripting`；`<all_urls>` 只位于
  `optional_host_permissions`。
- production manifests 的 `content_scripts` 为 `[]`，不含 `host_permissions` 或 WAR；构建仍输出
  `content-scripts/content.js` 和 `content-scripts/page-main.js`。
- background 只从 `permissions.getAll()` 派生动态注册，稳定注册 isolated/MAIN 两个脚本；grant/revoke、
  permission event、显式 reconcile 和 worker 启动都经过串行 reconcile。
- 当前 origin 保留非默认端口；拒绝、受限页面、当前站点/所有站点授权、撤权、临时停用、永久站点停用和 worker
  restart 均有自动化证据。

### Popup、Options、诊断与组件

- PopupApplication/OptionsApplication 隔离 browser/runtime API，Vue 组件只依赖 application facade。
- Popup 提供权限状态、媒体指标与命令、全局/站点/本页开关、当前站点撤权和 Options 入口。
- Options 提供 General、Shortcuts、Sites、Data、Diagnostics、About 六个路由页面。
- 快捷键 recorder、确认对话框、toggle、status、metric、panel 等公共组件已建立；Popup/Options/Recorder 通过 axe
  自动检查和键盘交互测试。
- zh-CN/en-US catalog 结构完整；诊断仅输出本地 bounded summary，URL 降为 hostname，排除 title、媒体 URL、
  page text、cookie 和 token。

## Phase 4 已完成交付

- visual state 按 MediaSession 隔离，支持 zoom/pan/rotate/flip/filter、单调用原子 reset、native/web fullscreen、PiP；原始 inline style 在 reset/teardown 恢复。
- top frame 挂载 closed ShadowRoot Overlay，包含 hostile CSS reset、event isolation、动态 mount/teardown 和 typed intent→command 映射；iframe 仍运行媒体 runtime，但 Preview 不做跨 frame 媒体聚合。
- Canvas 截图不修改 crossorigin、不新增 downloads/clipboard 权限；bounded artifact 通过临时 Blob URL 下载，CORS/DRM/未就绪/尺寸/编码失败均映射为有限错误。
- progress 使用匿名 hash identity、TTL、容量、隐私门禁和 5 秒节流；完成判断优先删除记录。跨 Tab 只发送 playback/progress advisory event，不轮询、不自动暂停。
- bundle budget 和 manifest guardrail 已进入 CI；生产 Chrome/Firefox 无 required host、静态 content scripts 和 WAR。

## Phase 5 已完成交付

- `MediaAdapterRegistry` 作为现有 MediaDiscovery 的单一复合 adapter；priority 降序、id 稳定 tie-break，GenericController
  在每个媒体上先创建并作为永久 fallback。
- Registry 对 catalog、rollback policy 和 Hook 表运行时校验并防御性冻结；selector 优先在目标媒体父容器内解析，
  再回退 document，降低多播放器串控风险。
- 静态 catalog 覆盖 Tier 1：YouTube、Bilibili、Tencent Video、iQIYI、Youku；Tier 2：Netflix、Ixigua、AcFun、
  Sohu Video、TED。每项包含 owner、version、tier、support、fixture、lastVerified、match 和 feature。
- selector 优先；受限 Hook 只允许随构建发布的 attach/detach/action/fullscreen 入口。attach、detach、selector、action
  抛错均被隔离，SPA URL 变化在下一次 snapshot/command 自动重匹配。
- `rollback-policy.ts` 支持精确 adapter version 或单 feature 禁用；禁止远程规则、页面规则和任意用户函数。
- adapter health 经 page-main → content site state → background diagnostics 输出，只有 id/version/tier/status/failure count/
  disabled features，不含完整 URL、title、媒体源或页面文本。
- 10 个脱敏 fixture、compatibility contract、SHA-256 baseline 和 `test:compat:report` 已进入 `pnpm check`；报告同时冻结
  support level/owner/lastVerified，并对超过 183 天未复核的 adapter 失败。

## Phase 6 已完成工程交付

- `web-extension/package.json` 成为版本单一事实源；Dev/Alpha/Beta/RC/Stable 共用 TypeScript profile resolver，默认构建
  为 Dev，浏览器 manifest 使用确定性四段数字版本。
- 自有 ZIP32 writer 固定路径顺序、DOS timestamp、`100644` mode 和 CRC32；拒绝隐藏/危险/重复/前缀重叠路径、symlink、
  source map、local range 重叠、header 漂移、多磁盘和额外 metadata。
- release bundle 固定输出 Chrome/Firefox ZIP、checksums、release manifest、SPDX 2.3 SBOM、运行时许可证、测试摘要、
  fixture-only 兼容报告和 unsigned SLSA-compatible provenance。
- artifact inspection 以 allowlist 重新验证 manifest identity/capability、required/optional API、host/CSP、action/options、Firefox
  metadata、background 差异、静态 content script/WAR、远程代码、入口、timestamp/mode/CRC；`release:verify` 检查目录闭包、
  artifact browser 身份、兼容报告重建和全部 digest。
- `release:reproducibility` 执行两个独立 WXT 双端构建并比较全部 9 个发布文件；正式候选要求 clean worktree 与显式
  `SOURCE_DATE_EPOCH`。
- `.github/workflows/` 分为 PR、nightly 和 workflow_dispatch RC，action 固定到 commit SHA、依赖冻结安装、最小
  `contents: read`；RC 明确 no-publish，不 tag/push/sign/store upload。
- ADR-0014、artifact contract、Chrome/Firefox listing、隐私/权限说明、Beta/update/rollback/incident runbook、RC/Stable/
  post-release 模板已进入 `project/`。

任务状态：EXT-121/122 工程实现 Verified；EXT-120/123/124 为工程完成但外部配置/签字/演练待完成；EXT-125 自动化完成但
两轮真实 RC 待证据；EXT-126 已审查为 Stable `NO-GO`；EXT-127 模板完成、真实发布后执行。

## 验证证据（Phase 6，2026-08-12 当前工作树）

| 门禁                      | 结果                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Format / lint / typecheck | Passed                                                                                                      |
| Release tests             | 10 files / 43 tests passed                                                                                  |
| Unit                      | 44 files / 177 tests passed                                                                                 |
| Component                 | 4 files / 19 tests passed                                                                                   |
| Integration               | 12 files / 80 tests passed                                                                                  |
| Compatibility             | 3 files / 33 tests passed；10 site fixtures + SHA baseline/report                                           |
| Coverage                  | 64 files / 312 tests；Statements 85.41%；Branches 77.57%；Functions 86.83%；Lines 88.88%                    |
| Security                  | 静态扫描 152 files + 2 manifests；security tests 3 passed                                                   |
| Dependency boundaries     | 138 modules / 433 dependencies；0 violations                                                                |
| Chrome E2E                | 3 passed（固定 workers=1）；1 configured churn skipped                                                      |
| Firefox E2E               | Firefox 153.0；optional origin + activeTab harness、动态注册、6 类媒体命令和撤权通过                        |
| Firefox lint              | 0 errors；2 条 Vue/runtime 生成代码 `UNSAFE_VAR_ASSIGNMENT` warning，业务源码无对应 sink                    |
| Churn smoke               | 5046 ms；84 cycles；1 worker restart；listeners 4→4；heap 4905048→6543988 bytes                             |
| Legacy regression         | SHA-256 `91b5312d7cf150cd852d005b1e5d5f3d8ed2ed7cd8a481dfa1d561d48f7b3f27`；561788 bytes                    |
| Production manifests      | required `storage/activeTab/scripting`；optional API=0；optional host=`<all_urls>`；deny-default capability allowlist；无 required hosts/WAR |
| Bundle budget             | Chrome/Firefox background 90813/90814 B、content 192180 B、page-main 93458 B raw；全部通过                  |
| Release reproducibility   | `0.1.0-beta.1` / manifest `0.1.0.30001`；9 files 两次构建逐字节一致；verifier 通过；dirty 候选不作发布       |
| Dependency audit          | 2 High / 2 ignored；仅限 RISK-027 精确临时接受，不代表 High=0，Stable 前到期                               |
| Workflow / docs           | Ruby YAML parser、actionlint v1.7.7、CI policy tests；70 Markdown files / 85 relative links 全部通过        |

Phase 2 的 30 分钟 churn 结果仍作为已批准历史证据保留；Phase 6 只重新执行 5 秒 smoke，没有伪称重跑 30 分钟。
Playwright 扩展生命周期套件固定单 worker；并行 persistent Chromium profiles 会争抢启动资源并产生假性 timeout。

## 权限自动化边界

原生扩展 optional-host 确认框在当前 headless Chrome/Firefox 自动化中不可稳定接受或拒绝。测试采用隔离 harness：

- Chrome grant：复制 production extension，在临时 profile 第一次启动时短暂把目标 origin 放入
  `host_permissions` 生成浏览器授权状态，关闭后恢复原 production manifest，再用同一 profile 启动；测试结束删除临时目录。
- Chrome reject：测试副本移除 `optional_host_permissions`，使真实 `permissions.request()` 确定性返回拒绝；生产 manifest 不变。
- Firefox grant：Selenium `--allow-system-access` 仅在测试 profile 中调用 Firefox
  `ExtensionPermissions` 和 tab manager，分别模拟 optional origin 与 action `activeTab`；生产代码和 manifest 不引用内部 API。
- 所有测试继续检查最终 production manifests、授权集合和动态注册 ID；Beta/商店提交前仍需至少一次 headed 手工权限 smoke。

## 已知项与风险

1. Firefox 自动化版本为 153.0；manifest minimum `142.0`、Firefox ESR、Chrome previous stable 和 Edge 尚未完成
   发布矩阵，Stable 前不可豁免。
2. Headless harness 证明权限状态机与产品代码，但不能取代原生确认框文案、焦点和商店审核体验的 headed/manual 验证。
3. `web-ext lint` warning 来自 Vue 生成 runtime；业务源码 innerHTML assignment 为 0，继续按供应链/构建风险跟踪。
4. iframe-only media 不在 top-frame Overlay 聚合；capture base64 最大消息体约 5.6 MiB；跨 Tab 不提供自动暂停/仲裁。
5. 当前 Chrome/Firefox E2E 未覆盖真实解码帧/CORS blocked 截图、native→web fullscreen fallback、PiP unavailable、
   progress restore/complete、multi-tab advisory event 和 iframe-only media Overlay；这些不能由 unit/contract 结果外推。
6. WXT 仍为 `0.x`；升级必须独立变更并重跑双浏览器 build/lint/security/E2E。

## 下一步（真实 Beta 准入，不等于 Phase 7）

1. 在 GitHub 仓库配置并核验 required checks/branch protection，保存规则截图或 API 导出。
2. 执行 Tier 1 真实站点 smoke、Firefox ESR/最低版本、Chrome previous stable、Edge 和 headed 权限 UX。
3. 用真实商店测试渠道完成安装/升级/rollback 或 forward-fix 演练，归档签名包与审核/账号签字。
4. 完成两个连续 Beta RC 及观察窗口；任何范围变化会重置连续候选计数。
5. 只有 Stable Go/No-Go 全部通过后，才可进入 Phase 7 的实验能力与 Legacy 后续决策；否则 Legacy 继续冻结。

## 当前阻塞

无代码硬阻塞。外部阻塞为：仓库分支保护证据、真实浏览器/站点/权限矩阵、商店账号签字与签名包演练、两轮 Beta RC 和
观察窗口。它们不阻止 Phase 6 工程基线完成，但全部阻止 Stable，且不能由本地候选包替代。
