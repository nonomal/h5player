# 功能需求追踪矩阵

> 文档 ID：REQ-004  
> 状态：Approved / Phase 6 Release Engineering Update<br>
> 负责人：Product Owner / Quality Owner  
> 最后更新：2026-08-11  
> 维护规则：任务进入 Ready 前确认映射；Verified 后把“证据”替换为具体测试/CI/评审链接。

## 1. 启动、发现与会话

| 需求           | 模块                                    | 任务                      | 自动化证据                                                                                                               | Phase | 当前证据状态 |
| -------------- | --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----- | ------------ |
| FR-BOOT-001    | runtime/content, page-main, site access | EXT-021, EXT-047, EXT-064 | `page-runtime.spec.ts`；生产 manifest 静态 scripts 为空；Chrome/Firefox optional grant→register→bootstrap/navigation E2E | 1/2/3 | Verified     |
| FR-BOOT-002    | infrastructure/dom, domain/media        | EXT-041                   | `media-discovery.spec.ts` 动态插入/移除、SPA teardown；Chrome churn                                                      | 2     | Verified     |
| FR-BOOT-003    | DOM observer, runtime lifecycle         | EXT-008, EXT-041, EXT-047 | Chrome SPA + Shadow E2E、`shadow-root-hook-coverage.spec.ts`、重复初始化/teardown 集成测试                               | 0/2   | Verified     |
| FR-BOOT-004    | frame runtime/bridge                    | EXT-008, EXT-021, EXT-047 | Chrome same/cross-origin iframe E2E；content/page-main `allFrames`；frame bridge boundary tests                          | 0/2   | Verified     |
| FR-BOOT-005    | settings/site policy, popup             | EXT-061, EXT-064          | `site-access.spec.ts`；Chrome 临时停用、站点停用、恢复、撤权与 worker restart E2E                                        | 3     | Verified     |
| FR-SESSION-001 | media selection service                 | EXT-042                   | `active-player-scoring.spec.ts` + Chrome multi-player/SPA/Shadow E2E                                                     | 2     | Verified     |
| FR-SESSION-002 | media session state                     | EXT-040, EXT-042          | `media-model.spec.ts`、`media-discovery.spec.ts` 多实例状态隔离                                                          | 2     | Verified     |
| FR-SESSION-003 | selection heuristics/capabilities       | EXT-042, EXT-049          | active-player scoring matrix、capability snapshots、Legacy core differential                                             | 2     | Verified     |

## 2. 核心命令与快捷键

| 需求          | 模块                            | 任务                      | 自动化证据                                                                                                    | Phase | 当前证据状态 |
| ------------- | ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- | ----- | ------------ |
| FR-CORE-001   | command registry/media handlers | EXT-044, EXT-045, EXT-046 | `command-registry.spec.ts`、`media-commands.spec.ts`；Chrome/Firefox basic E2E；differential                  | 2     | Verified     |
| FR-CORE-002   | volume handler                  | EXT-046                   | range/rounding/mute unit、Chrome/Firefox E2E（含调音解除静音）                                                | 2     | Verified     |
| FR-CORE-003   | media policy/hook adapter       | EXT-046, EXT-047          | hostile property-reset + strict CSP E2E；原生引用捕获与桥边界测试                                             | 2/3   | Verified     |
| FR-CORE-004   | domain/command                  | EXT-044                   | registry contract、background/media integration、Popup dispatch                                               | 2     | Verified     |
| FR-CORE-005   | capability-aware commands       | EXT-044, EXT-045, EXT-046 | capability matrix、unsupported/error unit、双浏览器 core E2E                                                  | 2     | Verified     |
| FR-HOTKEY-001 | hotkey registry/settings        | EXT-009, EXT-060, EXT-063 | `hotkey-domain.spec.ts` 默认/覆盖/禁用；`shortcut-recorder.spec.ts`；Options facade assignment tests          | 0/3   | Verified     |
| FR-HOTKEY-002 | hotkey interpreter/controller   | EXT-060                   | editable/composition/repeat/physical-code matrix、DOM composed-path 和串行 dispatch unit；Chrome keyboard E2E | 3     | Verified     |
| FR-HOTKEY-003 | shortcut editor/Schema          | EXT-060, EXT-063          | 保留快捷键、非法 chord、冲突检测、Escape 取消与 axe component tests                                           | 3     | Verified     |
| FR-HOTKEY-004 | hotkey mode policy              | EXT-060, EXT-064          | page/player focus、disabled、editable policy unit；站点/本页停用 Chrome E2E                                   | 3     | Verified     |

## 3. 画面、媒体与跨 Tab

| 需求          | 模块                       | 任务    | 自动化证据                                                                                                  | Phase | 当前证据状态           |
| ------------- | -------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- | ----- | ---------------------- |
| FR-VISUAL-001 | visual domain/commands     | EXT-080 | `visual-domain.spec.ts`、`visual-media-commands.spec.ts`；专项浏览器 E2E 尚未执行                           | 4     | Verified for Preview   |
| FR-VISUAL-002 | visual reset transaction   | EXT-080 | 单次 controller reset、inline style restore、teardown unit                                                  | 4     | Verified               |
| FR-VISUAL-003 | fullscreen/PiP adapters    | EXT-081 | generic adapter/command unit；native→web fallback 与 PiP unavailable 浏览器 E2E 待补                        | 4     | Verified for Preview   |
| FR-VISUAL-004 | overlay component shell    | EXT-082 | `overlay.spec.ts`、controller unit、hostile/CSP/iframe runtime lifecycle；iframe-only 聚合待补              | 4     | Verified for Preview   |
| FR-MEDIA-001  | capture service            | EXT-083 | capture command/download/native binding unit、bounded Schema/security/manifest checks；真实帧/CORS E2E 待补 | 4     | Verified for Preview   |
| FR-MEDIA-002  | progress repository        | EXT-084 | progress domain/repository/content-runtime TTL/capacity/privacy/restore/节流集成；浏览器 E2E 待补           | 4     | Verified for Preview   |
| FR-MEDIA-003  | cross-tab event service    | EXT-085 | cross-tab service unit、background/content typed contract                                                   | 4     | Verified advisory only |
| FR-MEDIA-004  | experimental media package | EXT-140 | threat/performance spike + optional E2E                                                                     | 7     | Deferred               |

## 4. 站点适配器

| 需求           | 模块                         | 任务                      | 自动化证据                                                                         | Phase | 当前证据状态         |
| -------------- | ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------- | ----- | -------------------- |
| FR-ADAPTER-001 | adapters/generic             | EXT-043                   | `generic-adapter.spec.ts`、basic/multi fixture；Chrome/Firefox 无站点配置 core E2E | 2     | Verified             |
| FR-ADAPTER-002 | adapter registry/sites       | EXT-100..105              | registry unit + 10 site fixtures；真实站点 smoke 未执行                            | 5     | Verified for fixture |
| FR-ADAPTER-003 | adapter isolation            | EXT-100, EXT-106          | attach/action/selector/detach throw、SPA rematch、Generic fallback                 | 5     | Verified             |
| FR-ADAPTER-004 | adapter metadata/diagnostics | EXT-100, EXT-106, EXT-107 | exact version/feature disable、adapter health、SHA baseline/report                 | 5     | Verified             |
| FR-ADAPTER-005 | declarative custom rules     | EXT-142                   | Schema fuzz + no-code-execution security test                                      | 7     | Deferred             |

## 5. 配置与数据

| 需求          | 模块                          | 任务                           | 自动化证据                                                                                                | Phase | 当前证据状态 |
| ------------- | ----------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- | ----- | ------------ |
| FR-CONFIG-001 | domain/settings, repository   | EXT-024, EXT-025               | strict Schema/default/unknown/range tests；repository integration                                         | 1     | Verified     |
| FR-CONFIG-002 | settings resolution           | EXT-024, EXT-025               | global/site/session priority + normalized origin unit tests                                               | 1     | Verified     |
| FR-CONFIG-003 | settings service/subscription | EXT-025, EXT-062               | repository 并发/订阅；Options storage change live reload；Chromium worker restart 后 revision/状态恢复    | 1/3   | Verified     |
| FR-CONFIG-004 | migration/import/export       | EXT-026, EXT-027, EXT-065      | V0/V1→V2、corrupt/future、backup/rollback、262144-byte import、预览/确认、reset 与 Blob revoke tests      | 1/3   | Verified     |
| FR-CONFIG-005 | sync whitelist                | EXT-025, EXT-062, DECISION-005 | `settings-sync-whitelist.spec.ts`；local authority + change event 已验证；Preview 明确不启用 storage.sync | 1/3   | Verified     |
| FR-CONFIG-006 | Legacy JSON converter         | EXT-027, EXT-143               | sample mapping/golden files                                                                               | 1/7   | Deferred     |

## 6. UI 与诊断

| 需求        | 模块                          | 任务                               | 自动化证据                                                                                               | Phase | 当前证据状态         |
| ----------- | ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- | -------------------- |
| FR-UI-001   | popup                         | EXT-061, EXT-064                   | `popup.spec.ts` + Chrome/Firefox extension E2E：状态、媒体命令、权限、停用、撤权、worker restart         | 3     | Verified             |
| FR-UI-002   | options                       | EXT-062, EXT-063, EXT-065, EXT-066 | 六路由页面；`options.spec.ts` 导航/live reload/import；Options all-sites revoke E2E                      | 3     | Verified             |
| FR-UI-003   | overlay                       | EXT-082                            | component、controller、closed ShadowRoot 配置与 runtime lifecycle；iframe-only 聚合为已知限制            | 4     | Verified for Preview |
| FR-UI-004   | application facade/view model | EXT-061, EXT-062, EXT-082          | Popup/Options/Overlay application unit；dependency-cruiser 128 modules / 415 dependencies / 0 violations | 3/4   | Verified             |
| FR-UI-005   | i18n                          | EXT-067, EXT-068                   | zh-CN/en-US catalog structural completeness、参数格式化、Popup/Options/Recorder axe tests                | 3     | Verified             |
| FR-DIAG-001 | structured logger             | EXT-030                            | `structured-logger.spec.ts` ring-buffer/capacity/redaction                                               | 1     | Verified             |
| FR-DIAG-002 | diagnostics service/UI        | EXT-066                            | `diagnostics.spec.ts` bounded summary/脱敏；Options diagnostics page；download Blob lifecycle test       | 3     | Verified             |
| FR-DIAG-003 | status/error mapping          | EXT-048, EXT-061, EXT-066          | no-permission/rejected/restricted/no-media/site-disabled/temporary/init-failure contract + E2E           | 2/3   | Verified             |

## 7. 非功能需求到门禁映射

| NFR 领域                | 主要事实源                                     | 执行门禁/任务                         |
| ----------------------- | ---------------------------------------------- | ------------------------------------- |
| NFR-MAINT-*             | `engineering-standard.md`, `module-catalog.md` | EXT-002/003；PR static gate           |
| NFR-PERF-*              | `test-strategy.md`, `quality-gates.md`         | EXT-050/086；nightly stress/RC budget |
| NFR-REL-*               | `target-architecture.md`, `test-strategy.md`   | lifecycle/restart/migration E2E       |
| NFR-SEC-*               | `security-and-privacy.md`                      | EXT-028..031；security release gate   |
| NFR-COMPAT-*            | `compatibility-matrix.md`                      | EXT-006/008/107；nightly matrix       |
| NFR-TEST-*              | `test-strategy.md`                             | EXT-004/005/007/008；coverage gate    |
| NFR-A11Y-* / NFR-I18N-* | `ui-component-architecture.md`                 | EXT-067/068；component/a11y gate      |
| NFR-OBS-*               | `observability-and-support.md`                 | EXT-030/066；redaction/export gate    |
| NFR-BUILD-* / NFR-REL-* | `release-artifact-and-evidence-contract.md`    | EXT-120..122/125；profiles、inspection、reproducibility |
| NFR-PRIV-* / NFR-SEC-*  | `privacy-and-permission-disclosure.md`         | EXT-123/124/126；store/manual external gates |

## 8. Phase 6 发布需求追踪

| 任务 | 工程实现与自动化证据 | 治理/人工证据 | 当前状态 |
| ---- | -------------------- | ------------- | -------- |
| EXT-120 | `.github/actions/setup-web-extension`、PR/nightly/RC workflows、`release-ci-policy.spec.ts` | required checks/branch protection 实际配置 | Engineering verified / external enforcement pending |
| EXT-121 | `src/release/profile.ts`、`wxt.config.ts`、`release-profile.spec.ts` | 候选版本冻结与 Release Manager 确认 | Verified |
| EXT-122 | `scripts/release/*`、archive/evidence/artifact/dependency tests、bundle verify/reproducibility | CI/商店签名 provenance（未来） | Verified for unsigned repository evidence |
| EXT-123 | `store-listing-package.md`、`privacy-and-permission-disclosure.md`、artifact permission inspection | 公开隐私 URL、截图、账号与商店签字/回执 | Engineering complete / external pending |
| EXT-124 | `beta-update-rollback-incident-runbook.md`、settings migration/backup/corrupt tests | 真实商店 update/rollback/forward-fix drill | Engineering complete / external drill pending |
| EXT-125 | RC workflow、release gate schema、双次复现、RC record template | 两个连续真实 Beta RC 与观察窗口 | Automation verified / external pending |
| EXT-126 | Stable template、`test-summary.json` NO-GO policy、Phase 6 Exit Review | 全角色签字和商店证据 | Reviewed / Stable NO-GO |
| EXT-127 | post-release template、无遥测指标边界、Legacy 冻结判断项 | 首次真实发布后执行 | Template ready / execution pending |

## 9. 证据更新规则

- `Planned`：有任务和测试层级但尚无实现。
- `Building`：任务 In Progress，填写 PR 链接。
- `Verified`：填写测试路径、CI artifact、浏览器矩阵和评审记录。
- `Deferred`：必须保留产品理由、风险和重新评估条件。
- 任何 P0 在 Stable Go/No-Go 时不是 `Verified`，结论自动为 No-Go。
