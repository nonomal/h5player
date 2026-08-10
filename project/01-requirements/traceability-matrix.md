# 功能需求追踪矩阵

> 文档 ID：REQ-004  
> 状态：Approved as Planning Baseline  
> 负责人：Product Owner / Quality Owner  
> 最后更新：2026-08-10  
> 维护规则：任务进入 Ready 前确认映射；Verified 后把“证据”替换为具体测试/CI/评审链接。

## 1. 启动、发现与会话

| 需求           | 模块                              | 任务                      | 自动化证据                                                                                      | Phase | 当前证据状态 |
| -------------- | --------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- | ----- | ------------ |
| FR-BOOT-001    | runtime/content, page-main        | EXT-021, EXT-047          | `page-runtime.spec.ts` nonce handshake；Chrome/Firefox 真扩展启动；声明式 MAIN `document_start` | 1/2   | Verified     |
| FR-BOOT-002    | infrastructure/dom, domain/media  | EXT-041                   | `media-discovery.spec.ts` 动态插入/移除、SPA teardown；Chrome churn                             | 2     | Verified     |
| FR-BOOT-003    | DOM observer, runtime lifecycle   | EXT-008, EXT-041, EXT-047 | Chrome SPA + Shadow E2E、`shadow-root-hook-coverage.spec.ts`、重复初始化/teardown 集成测试      | 0/2   | Verified     |
| FR-BOOT-004    | frame runtime/bridge              | EXT-008, EXT-021, EXT-047 | Chrome same/cross-origin iframe E2E；content/page-main `allFrames`；frame bridge boundary tests | 0/2   | Verified     |
| FR-BOOT-005    | settings/site policy, popup       | EXT-061, EXT-064          | 临时/永久停用 E2E                                                                               | 3     | Planned      |
| FR-SESSION-001 | media selection service           | EXT-042                   | `active-player-scoring.spec.ts` + Chrome multi-player/SPA/Shadow E2E                            | 2     | Verified     |
| FR-SESSION-002 | media session state               | EXT-040, EXT-042          | `media-model.spec.ts`、`media-discovery.spec.ts` 多实例状态隔离                                 | 2     | Verified     |
| FR-SESSION-003 | selection heuristics/capabilities | EXT-042, EXT-049          | active-player scoring matrix、capability snapshots、Legacy core differential                    | 2     | Verified     |

## 2. 核心命令与快捷键

| 需求          | 模块                            | 任务                      | 自动化证据                                                                                   | Phase | 当前证据状态 |
| ------------- | ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- | ----- | ------------ |
| FR-CORE-001   | command registry/media handlers | EXT-044, EXT-045, EXT-046 | `command-registry.spec.ts`、`media-commands.spec.ts`；Chrome/Firefox basic E2E；differential | 2     | Verified     |
| FR-CORE-002   | volume handler                  | EXT-046                   | range/rounding/mute unit、Chrome/Firefox E2E（含调音解除静音）                               | 2     | Verified     |
| FR-CORE-003   | media policy/hook adapter       | EXT-046, EXT-047          | hostile property-reset + strict CSP E2E；原生引用捕获与桥边界测试                            | 2/3   | Verified     |
| FR-CORE-004   | domain/command                  | EXT-044                   | registry contract、background/media integration、Popup dispatch                              | 2     | Verified     |
| FR-CORE-005   | capability-aware commands       | EXT-044, EXT-045, EXT-046 | capability matrix、unsupported/error unit、双浏览器 core E2E                                 | 2     | Verified     |
| FR-HOTKEY-001 | hotkey registry/settings        | EXT-009, EXT-060, EXT-063 | Legacy default snapshot + edit E2E                                                           | 0/3   | Planned      |
| FR-HOTKEY-002 | hotkey interpreter              | EXT-060                   | editable/repeat/platform keyboard matrix                                                     | 3     | Planned      |
| FR-HOTKEY-003 | shortcut editor/Schema          | EXT-060, EXT-063          | conflict/invalid input component tests                                                       | 3     | Planned      |
| FR-HOTKEY-004 | hotkey mode policy              | EXT-060, EXT-064          | page/player focus-mode E2E                                                                   | 3     | Planned      |

## 3. 画面、媒体与跨 Tab

| 需求          | 模块                       | 任务    | 自动化证据                                     | Phase | 当前证据状态 |
| ------------- | -------------------------- | ------- | ---------------------------------------------- | ----- | ------------ |
| FR-VISUAL-001 | visual domain/commands     | EXT-080 | transform/filter unit + visual E2E             | 4     | Planned      |
| FR-VISUAL-002 | visual reset transaction   | EXT-080 | 多属性原子 reset unit/E2E                      | 4     | Planned      |
| FR-VISUAL-003 | fullscreen/PiP adapters    | EXT-081 | browser capability + site fixture E2E          | 4     | Planned      |
| FR-VISUAL-004 | overlay component shell    | EXT-082 | host-style pollution + teardown + visual tests | 4     | Planned      |
| FR-MEDIA-001  | capture service            | EXT-083 | canvas/CORS/DRM fixtures + download result E2E | 4     | Planned      |
| FR-MEDIA-002  | progress repository        | EXT-084 | clock/expiry/capacity/privacy integration      | 4     | Planned      |
| FR-MEDIA-003  | cross-tab event service    | EXT-085 | multi-page sync + worker restart integration   | 4     | Planned      |
| FR-MEDIA-004  | experimental media package | EXT-140 | threat/performance spike + optional E2E        | 7     | Deferred     |

## 4. 站点适配器

| 需求           | 模块                         | 任务                      | 自动化证据                                                                         | Phase | 当前证据状态 |
| -------------- | ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------- | ----- | ------------ |
| FR-ADAPTER-001 | adapters/generic             | EXT-043                   | `generic-adapter.spec.ts`、basic/multi fixture；Chrome/Firefox 无站点配置 core E2E | 2     | Verified     |
| FR-ADAPTER-002 | adapter registry/sites       | EXT-100..105              | 每 adapter contract/fixture/smoke                                                  | 5     | Planned      |
| FR-ADAPTER-003 | adapter isolation            | EXT-100, EXT-106          | throw/timeout/teardown failure injection                                           | 5     | Planned      |
| FR-ADAPTER-004 | adapter metadata/diagnostics | EXT-100, EXT-106, EXT-107 | version disable + report generation                                                | 5     | Planned      |
| FR-ADAPTER-005 | declarative custom rules     | EXT-142                   | Schema fuzz + no-code-execution security test                                      | 7     | Deferred     |

## 5. 配置与数据

| 需求          | 模块                          | 任务                      | 自动化证据                                                                                                | Phase | 当前证据状态 |
| ------------- | ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- | ----- | ------------ |
| FR-CONFIG-001 | domain/settings, repository   | EXT-024, EXT-025          | strict Schema/default/unknown/range tests；repository integration                                         | 1     | Verified     |
| FR-CONFIG-002 | settings resolution           | EXT-024, EXT-025          | global/site/session priority + normalized origin unit tests                                               | 1     | Verified     |
| FR-CONFIG-003 | settings service/subscription | EXT-025                   | concurrent field patch + actual Chromium worker termination/recovery E2E；Phase 3 补 live UI subscription | 1/3   | Building     |
| FR-CONFIG-004 | migration/import/export       | EXT-026, EXT-027, EXT-065 | N/N-1/corrupt/future/rollback/import atomicity；Phase 3 补完整 UI                                         | 1/3   | Building     |
| FR-CONFIG-005 | sync whitelist                | EXT-025, DECISION-005     | local authority 已验证；sync whitelist 在 Phase 3 前决策                                                  | 1/3   | Building     |
| FR-CONFIG-006 | Legacy JSON converter         | EXT-027, EXT-143          | sample mapping/golden files                                                                               | 1/7   | Deferred     |

## 6. UI 与诊断

| 需求        | 模块                          | 任务                               | 自动化证据                                                 | Phase | 当前证据状态 |
| ----------- | ----------------------------- | ---------------------------------- | ---------------------------------------------------------- | ----- | ------------ |
| FR-UI-001   | popup                         | EXT-061, EXT-064                   | real extension popup state/command E2E                     | 3     | Planned      |
| FR-UI-002   | options                       | EXT-062, EXT-063, EXT-065, EXT-066 | component + settings/import E2E                            | 3     | Planned      |
| FR-UI-003   | overlay                       | EXT-082                            | component + visual + page integration                      | 4     | Planned      |
| FR-UI-004   | application facade/view model | EXT-061, EXT-062, EXT-082          | dependency-boundary check + fake facade tests              | 3/4   | Planned      |
| FR-UI-005   | i18n                          | EXT-067, EXT-068                   | locale completeness + long-text/a11y tests                 | 3     | Planned      |
| FR-DIAG-001 | structured logger             | EXT-030                            | `structured-logger.spec.ts` ring-buffer/capacity/redaction | 1     | Verified     |
| FR-DIAG-002 | diagnostics service/UI        | EXT-066                            | export preview/redaction/size E2E                          | 3     | Planned      |
| FR-DIAG-003 | status/error mapping          | EXT-048, EXT-061, EXT-066          | no-permission/no-media/disabled/failure E2E                | 2/3   | Planned      |

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

## 8. 证据更新规则

- `Planned`：有任务和测试层级但尚无实现。
- `Building`：任务 In Progress，填写 PR 链接。
- `Verified`：填写测试路径、CI artifact、浏览器矩阵和评审记录。
- `Deferred`：必须保留产品理由、风险和重新评估条件。
- 任何 P0 在 Stable Go/No-Go 时不是 `Verified`，结论自动为 No-Go。
