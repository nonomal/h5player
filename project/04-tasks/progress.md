# Web Extension 重构进度

> 文档 ID：TASK-002  
> 状态：Active  
> 负责人：Project Owner / Quality Owner  
> 最后更新：2026-08-11  
> 更新频率：每周或每个开发周期

## 当前阶段

**Phase 3 Exit：设置、快捷键、站点权限与原生扩展 UI 已完成 Preview 范围验证**

整体状态：🟢 `EXT-060`～`EXT-069` 已 Verified；[Phase 3 Exit Review](../09-reviews/phase-3-exit-review-2026-08-11.md)
结论为 `Approved / Conditional GO`。可以进入 Phase 4 工程化迭代，但尚不具备 Stable 发布资格，也不宣告
Tier 1 真实站点、Firefox ESR/最低版本或商店上架准备已完成。

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

## 验证证据（2026-08-11 当前工作树）

| 门禁                      | 结果                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Format / lint / typecheck | Passed                                                                                                          |
| Unit                      | 28 files / 93 tests passed                                                                                      |
| Component                 | 3 files / 9 tests passed                                                                                        |
| Integration               | 7 files / 40 tests passed                                                                                       |
| Compatibility             | 2 files / 21 tests passed                                                                                       |
| Coverage                  | Statements 85.84%；Branches 75.18%；Functions 88.24%；Lines 89.50%                                              |
| Security                  | 静态扫描 120 files + 2 manifests；security tests 3 passed                                                       |
| Dependency boundaries     | 105 modules / 330 dependencies；0 violations                                                                    |
| Chrome E2E                | 3 passed；未授权/拒绝/受限、当前站点媒体与 worker restart、all-sites 生命周期与撤权；1 configured churn skipped |
| Firefox E2E               | Firefox 153.0；optional origin + activeTab harness、动态注册、6 类媒体命令和撤权通过                            |
| Firefox lint              | 0 errors；1 条 Vue runtime 生成代码 `UNSAFE_VAR_ASSIGNMENT` warning                                             |
| Churn smoke               | 5017 ms；82 cycles；1 worker restart；listeners 4→4；heap 3613664→4315488 bytes                                 |
| Legacy regression         | SHA-256 `91b5312d7cf150cd852d005b1e5d5f3d8ed2ed7cd8a481dfa1d561d48f7b3f27`；561788 bytes                        |
| Production manifests      | required `storage/activeTab/scripting`；optional `<all_urls>`；`content_scripts: []`；无 required hosts/WAR     |
| Artifact footprint        | Chrome 484 KiB；Firefox 484 KiB（unpacked production directories）                                              |

Phase 2 的 30 分钟 churn 结果仍作为已批准历史证据保留在对应 Exit Review；本次 Phase 3 变更重新执行了 5 秒
churn smoke，没有伪称重新完成 30 分钟运行。

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
4. Tier 1 adapter、视觉增强、截图、进度、跨 Tab 媒体协同属于 Phase 4/5；当前 Preview 只承诺 Tier 0 通用媒体能力。
5. WXT 仍为 `0.x`；升级必须独立变更并重跑双浏览器 build/lint/security/E2E。

## 下一步（Phase 4）

1. 先冻结 EXT-080～EXT-087 的视觉/overlay/capture/progress 范围和性能预算，避免把 Phase 4 变成 Legacy 全量搬运。
2. 保持 Phase 3 权限、Schema V2、facade 和组件边界；新增能力不得绕过 typed command、settings repository 或 dynamic registration。
3. 在任何 Beta/Stable 决策前补 Firefox ESR/最低版本、Chrome previous stable、Edge、headed 权限 smoke 和真实商店文案审查。
4. 继续执行 Legacy hash/size 回归；共享核心与油猴主线重构仍只允许在 Phase 7 单独立项评估。

## 当前阻塞

无代码硬阻塞。当前是“可进入下一阶段工程开发、不可发布 Stable”的状态；若项目 Owner 不接受 headless 权限 harness
边界，则 EXT-069 需退回 In Review，并先投入 headed 浏览器权限自动化或人工审查流程。
