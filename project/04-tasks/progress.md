# Web Extension 重构进度

> 文档 ID：TASK-002  
> 状态：Active  
> 负责人：Project Owner / Quality Owner  
> 最后更新：2026-08-10  
> 更新频率：每周或每个开发周期

## 当前阶段

**Phase 2 Exit：通用媒体核心 MVP 已验证，Phase 3 Ready**

整体状态：🟢 `EXT-040`～`EXT-051` 已 Verified；Phase 2 Exit Review 为 `Approved / GO`，完整
静态、测试、双浏览器、长稳态、安全、边界和 Legacy 门禁已在当前工作树重跑通过。

## Phase 0/1 已完成基线

- Legacy 油猴主线保持独立：根 Yarn/Rollup、源码、构建命令和产物基线不被 Web Extension 改写。
- WXT/Vite 多入口、TypeScript strict、Vue presentation、Vitest、Playwright、pnpm lockfile 和
  依赖边界已建立。
- Protocol v1、nonce/replay、sender policy、request lifecycle、Browser Ports、Settings V1、
  migration/backup/rollback、structured logger、最小权限和安全扫描已通过 Phase 1 Exit。
- 生产 page-main 入口遵循 ADR-0006：声明式 MAIN world、`document_start`、`allFrames`；不使用
  运行时 `injectScript()`、WAR、CSP 放宽或动态执行。

## Phase 2 已完成交付

- `MediaSession`/`MediaSnapshot`/`Capabilities`/`MediaId` 领域模型、Schema 和不变量。
- GenericAdapter、原生媒体引用捕获、hostile page 防护、媒体 DOM/Shadow DOM/SPA 发现和 teardown。
- active-player scoring、媒体生命周期事件、frame 独立 session 与幂等 page runtime。
- Command Registry 和 play/pause/seek/rate/volume/mute 全部命令及能力/错误边界。
- page-main → content → background → popup 的媒体状态与命令消息链；service worker 重启后设置与
  页面连接可恢复。
- Chrome/Firefox 构建 profile；Firefox Selenium 真扩展 core E2E 与驱动生命周期治理。
- Legacy 核心媒体差分 oracle；seek/rate/volume 精度、近零 seek、调音解除静音和 Popup 步长已对齐。
- Chrome multi/SPA/Shadow/hostile/CSP/iframe fixture 与 5 秒 churn smoke。

## 验证证据（截至当前运行）

| 门禁                             | 结果                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Format / lint / typecheck        | Passed                                                                                          |
| Unit                             | 21 files / 73 tests passed                                                                      |
| Component                        | 1 file / 2 tests passed                                                                         |
| Integration                      | 5 files / 32 tests passed                                                                       |
| Compatibility                    | 2 files / 21 tests passed                                                                       |
| Coverage                         | Statements 88.53%；Branches 77.53%；Functions 92.58%；Lines 91.67%                              |
| Core domain/application coverage | domain/application lines ≥85%、branches ≥80% 门槛通过                                           |
| Security                         | 静态扫描 83 files + 2 manifests；security tests 2 passed                                        |
| Dependency boundaries            | 66 modules / 176 dependencies；0 violations                                                     |
| Chrome E2E                       | 3 real-extension scenarios passed；1 churn test skipped（未配置时）                             |
| Firefox E2E                      | Firefox 153.0；临时 MV3 安装；seek/rate/volume/mute/play/pause passed                           |
| Firefox lint                     | 0 errors；1 条已登记 Vue runtime `UNSAFE_VAR_ASSIGNMENT` warning                                |
| Churn smoke                      | 5 秒通过：109 cycles、2 worker restarts、listeners 4→4、heap 3.35→4.12 MB                       |
| 30 分钟 churn                    | Passed：1800711 ms、8056 cycles、161 worker restarts、listeners 4→4、heap 3353988→5559956 bytes |
| Legacy regression                | SHA-256 `91b5312d7cf150cd852d005b1e5d5f3d8ed2ed7cd8a481dfa1d561d48f7b3f27`；561788 bytes        |
| Artifact footprint               | Chrome 262755 bytes；Firefox 262750 bytes（unpacked production output）                         |

## 关键决策

- 不新增 `tabs`、`activeTab`、`webRequestBlocking`、downloads 或 required host permission；Popup 测试
  通过保持 fixture tab active 适配最小权限约束。
- Phase 0 的异步 WAR 注入仅保留为历史 spike；生产入口以 ADR-0006 的声明式 MAIN content script
  为准。
- Legacy 默认快捷键继续作为只读 baseline；快捷键解释器、编辑器、冲突校验属于 Phase 3，不在
  Phase 2 增加第二套命令协议。
- Tier 1 站点冻结为通用 HTMLMediaElement、YouTube、Bilibili、Tencent Video、iQIYI、Youku；站点
  adapter 仍在 Phase 5 交付。

## 已知项与风险

1. Firefox 已验证 Playwright bundled 153.0，不等价于最低 `142.0` 或 Firefox ESR；Stable 前需补
   ESR/最低版本 core + permissions 矩阵。
2. `web-ext lint` warning 来自 Vue runtime 生成代码；业务源码 innerHTML assignment 为 0，Phase 3
   Exit 前继续跟踪，禁止业务源码通配豁免。
3. 静态 content matches 仍仅覆盖 localhost fixture；Phase 3 完成显式站点授权/onboarding 前不扩展
   真实站点运行范围。
4. WXT 仍为 `0.x`；升级必须独立变更并重跑双浏览器构建、lint、安全和 E2E。

## 下一步（Phase 3）

1. 实现 `EXT-060`～`EXT-069`：快捷键 domain/interpreter、Popup/Options view model、站点开关、导入
   导出 UI、诊断摘要、i18n、A11y 和产品/UX/安全审查。
2. 在扩大 matches 或申请真实站点权限前，完成权限 onboarding、撤销/拒绝路径和商店文案审查。
3. 保持 Legacy hash/size 回归门禁；任何共享核心抽取延后到 Phase 7 决策。

## 当前阻塞

无代码硬阻塞。Phase 3 开始时首先冻结快捷键语义和权限 onboarding UX；不得以增加 required
全站权限、恢复 WAR 注入或修改 Legacy 主线作为实现捷径。
