# Web Extension 重构风险台账

> 文档 ID：GOV-003  
> 状态：Active  
> 负责人：Project Owner  
> 最后更新：2026-08-11  
> 评审周期：每周及每个里程碑

等级参考：Impact × Likelihood；Critical/High 必须有明确 owner、缓解、触发条件和回退动作。

| ID       | 风险                                         | 影响     | 概率   | 等级     | Owner                | 缓解/预防                                                                                                                                               | 触发信号                                                     | 回退/应急                                               | 状态                |
| -------- | -------------------------------------------- | -------- | ------ | -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- | ------------------- |
| RISK-001 | 新工具链修改根配置，破坏 Legacy 构建         | High     | Low    | Medium   | Build Owner          | 独立 pnpm package/lockfile；CI 同时运行 Legacy build；固定 hash/size；禁止顺带改旧目录                                                                  | `dist` diff、旧 build 失败                                   | 撤销扩展配置耦合，恢复独立 workspace                    | Mitigated / Monitor |
| RISK-002 | Chromium/Firefox MAIN world 注入能力不一致   | High     | Medium | High     | Architect            | ADR-0006 声明式 `world: 'MAIN'`、`document_start`、`allFrames`；无 WAR；Chrome 与 Firefox 153 真扩展 E2E、CSP/hostile/iframe fixture 和双浏览器 lint    | 任一目标浏览器构建或真实 E2E 无法安全运行 page-main          | 降级为受支持能力集，推迟该浏览器 Stable                 | Mitigated / Monitor |
| RISK-003 | 全站权限影响用户信任和商店审核               | High     | Medium | High     | Security Owner       | `<all_urls>` 仅 optional；ADR-0007 动态注册；生产无 required host、静态 content scripts 或 WAR；Chrome grant/reject/revoke 与 Firefox grant/revoke 验证 | 审核拒绝、权限警告过大、未授权页面执行                       | 取消 all-sites，仅保留当前站点/固定名单                 | Mitigated / Monitor |
| RISK-004 | 旧功能范围过大导致无休止追平                 | High     | High   | High     | Product Owner        | P0/P1/P2、Tier 分级、明确非目标                                                                                                                         | Backlog 增速大于完成速度                                     | 冻结范围，仅交付 P0/Tier 1                              | Open                |
| RISK-005 | 站点适配器污染通用核心                       | High     | Medium | High     | Architect            | 复合 registry 只实现现有 MediaAdapter；Generic 先创建并兜底；依赖边界、failure injection 和 SPA rematch 测试                                            | core 出现 site 分支或 domain 导入具体 adapter                | version/feature 禁用，恢复 generic 行为                 | Mitigated / Monitor |
| RISK-006 | 测试过度依赖真实站点而 flaky                 | High     | High   | High     | Quality Owner        | 10 个脱敏 fixture + SHA baseline 为 PR 证据；真实站点只做独立 smoke，必须冻结环境与失败 artifact                                                        | nightly flaky >1%、频繁登录/地区失败                         | 暂停生产支持声明，保留 fixture 与 generic               | Mitigated / Monitor |
| RISK-007 | worker 休眠/重启导致内存状态丢失             | High     | Low    | Medium   | Runtime Owner        | storage authority、reconnect client、真实终止 service worker 的 Chromium E2E；关键状态不依赖内存                                                        | popup 无状态、页面无法重连                                   | 安全重建 session，禁用依赖常驻内存功能                  | Mitigated / Monitor |
| RISK-008 | 配置 Schema 迁移损坏用户设置                 | Critical | Low    | High     | Data Owner           | Schema V2 执行 V0→V1→V2 逐版迁移；raw checksum backup、corrupt/future no-overwrite、262144-byte 上限、原子 import/reset/rollback 与重启恢复测试         | 导入/升级后配置不可读、revision 倒退或原值被覆盖             | 自动恢复最近备份，停止灰度并冻结 Schema 写入            | Mitigated / Monitor |
| RISK-009 | 页面消息桥被恶意网站滥用                     | Critical | Medium | High     | Security Owner       | nonce/session/origin/source/replay、payload Schema、真实 sender allowlist；MAIN nonce 不当作同 realm 身份秘密，页面桥无特权                             | 未授权存储/下载/剪贴板请求、未知 type 命中                   | 禁用受影响消息能力，安全 hotfix                         | Mitigating          |
| RISK-010 | 页面 Hook 引发网站行为回归                   | High     | High   | High     | Media Owner          | selector 优先；静态受限 Hook；attach/detach/action 隔离；精确 version/feature kill switch；站点停用                                                     | 页面报错/播放器失效增加                                      | 局部禁用 feature/adapter，保留 Generic                  | Mitigating          |
| RISK-011 | UI 组件过早绑死业务架构                      | Medium   | Medium | Medium   | UI Owner             | Popup/Options application facade、共享无业务组件与 design tokens 已落地；Vue 仅 presentation；dependency-cruiser、fake facade、组件/axe/键盘测试守边界  | 组件直接调用 browser/media DOM，domain/application 导入 Vue  | 拆回 facade，冻结新增 UI 功能并补边界测试               | Mitigated / Monitor |
| RISK-012 | 下载/MediaSource 引发性能、合规或权限问题    | Critical | Medium | Critical | Security/Product     | Phase 7、默认关闭、独立 ADR                                                                                                                             | 高内存、商店警告、版权投诉                                   | 移除实验模块和权限                                      | Open                |
| RISK-013 | 远程 helper/遥测造成隐私争议                 | High     | Medium | High     | Product/Security     | 首发不迁移；未来 opt-in ADR                                                                                                                             | 出现未声明外联或用户投诉                                     | 关闭远程能力、发布说明                                  | Open                |
| RISK-014 | 双实现长期维护成本失控                       | Medium   | High   | High     | Project Owner        | 功能矩阵、明确稳定边界、Beta 后评估共享                                                                                                                 | 同一修复重复劳动显著上升                                     | 只抽取稳定 pure package，或维持独立范围                 | Open                |
| RISK-015 | 构建产物不可复现/供应链风险                  | Critical | Low    | High     | Release Manager      | 单一版本源、独立 lockfile、固定 Node/pnpm/WXT/action SHA、deterministic ZIP、双构建复现、SBOM/license/checksum/unsigned provenance、Legacy hash | 相同输入的 9 个规范文件 hash 不一致或依赖/许可证无法解释 | 停止发布，保全 bundle，审计依赖、构建器和 release scripts | Mitigated / Monitor |
| RISK-016 | 性能开销使所有页面变慢                       | High     | Medium | High     | Performance Owner    | 无媒体快路径、observer 批处理、bundle/长任务预算                                                                                                        | p95/内存超 NFR，用户反馈卡顿                                 | 关闭高成本模块、按需加载                                | Open                |
| RISK-017 | Headless 权限自动化掩盖原生确认框问题        | High     | Medium | High     | Quality/Security     | 生产 manifest 独立扫描；Chrome 临时 profile/拒绝副本与 Firefox 内部权限 harness 只验证状态机；DECISION-006 要求 Beta/商店前 headed 手工 smoke           | harness 通过但原生弹窗文案、焦点、接受/拒绝行为异常          | 阻断 Beta/商店提交，回退权限 UX 或只保留当前站点        | Mitigating          |
| RISK-018 | top-frame Overlay 无法聚合 iframe-only media | High     | Medium | High     | UI/Runtime Owner     | top frame 单实例、iframe runtime 保留；ADR-0009 明示 Preview 限制；Phase 5 评估 frame registry/selection                                                | 页面只有 iframe 媒体时 Overlay 显示 empty、用户误判无媒体    | 隐藏 Overlay/引导 Popup，或实现受控 frame 聚合          | Open                |
| RISK-019 | base64 截图 Artifact 导致大消息和峰值内存    | High     | Medium | High     | Performance/Security | 8192/16.7MP/4 MiB 上限、encode timeout、二次校验；不经 background；记录 raw/gzip budget                                                                 | 大画面截图卡顿、runtime message 被浏览器拒绝、页面崩溃       | 降低上限、禁用 capture、改专用二进制/分块通道           | Mitigating          |
| RISK-020 | 匿名进度 identity 冲突或形成可关联观看历史   | High     | Medium | High     | Data/Security        | 默认关闭、TTL/容量、origin+path hash、raw URL 不落盘、清除开关联动；兼容 `titleHint` 强制剥离并有导入/落盘/导出回归；ADR-0011                           | 同路径多节目覆盖、导出/诊断出现原 URL 或标题、关闭后仍留记录 | 清除 progress、禁用恢复、由 adapter 提供审查后的稳定 ID | Mitigating          |
| RISK-021 | Overlay event/z-index 与宿主页面冲突         | Medium   | High   | High     | UI Owner             | closed root、host reset、event isolation、站点停用；Preview z-index 明示临时值                                                                          | capture-phase listener 抢事件、遮挡站点关键 UI、页面投诉     | 降低/配置 z-index、改变 placement、停用 Overlay         | Open                |
| RISK-022 | 扩展 E2E 并行 profile 资源争抢产生假失败     | Medium   | High   | High     | Quality Owner        | Playwright `workers:1`；按 runner/job 并行；保存 trace 区分启动与断言失败                                                                               | 用例在 profile seed/close/worker start 阶段超时，串行通过    | 降为单 worker，拆 CI runner，不盲目增大 timeout         | Mitigated / Monitor |
| RISK-023 | fixture 全绿被误写为真实站点支持             | High     | High   | High     | Product/Quality      | 支持矩阵强制 live smoke 字段；report 标注 sanitized-fixture-only；Exit Review 禁止证据外推                                                              | 发布说明出现“已支持”但无浏览器/OS/真实 URL 类别证据          | 撤回声明，阻断 Beta，补真实站点 smoke                   | Open                |
| RISK-024 | 本地/CI 候选包被误当成已发布 Beta 或 Stable   | Critical | Medium | Critical | Release Manager      | 默认 Dev profile；RC workflow 标记 No Publish；test summary/manifest 写明 decision boundary；Stable 缺外部 gate 自动 NO-GO | 未签名 `.release` ZIP 被上传公开渠道、文档声称 Store Ready/Stable | 撤回产物与声明，轮换受影响渠道记录，重新做 Go/No-Go | Mitigating |
| RISK-025 | unsigned provenance 被误解为可信签名/attestation | High | Medium | High | Security/Release | ADR-0014 与 artifact contract 明示 unsigned；builder/clean/commit/lockfile/digest 可核验；真实 OIDC/商店签名另存外部证据 | 仅凭 `provenance.json` 批准 Stable，或 builder identity 无法验证 | 阻断发布，要求受保护环境/商店签名与人工签字 | Open |
| RISK-026 | 商店不支持真实降级导致事故恢复失败           | Critical | Medium | Critical | Release Manager / Data Owner | forward-compatible Schema、backup/corrupt restore、forward-fix runbook；Stable 前真实签名包演练 | 受影响版本无法下架/降级，旧版本不能读取新数据 | 停止推广，发布递增 forward-fix，提供权限/数据自救 | Open |
| RISK-027 | 构建链 image-size 未发布修复的两个 High advisory | High | Medium | High | Security/Build Owner | `pnpm audit --audit-level high` 覆盖 dev/build 链；仅临时显式忽略 GHSA-w3rx-r6r6-pgpr 与 GHSA-5p2g-fcmc-qvqq（上游尚无可用修复版本），web-ext lint 仅处理仓库自有 PNG，保留锁文件与到期复核 | 出现可用上游修复、审计范围扩大或非 PNG 输入进入 lint | 立即升级/替换依赖并重跑全量 gate；Stable 前不得将该例外视为 High=0 | Accepted temporarily / expiry before Stable |

### RISK-027 临时接受记录

- 接受人：Security Owner 与 Build Owner；接受日期：2026-08-11。
- 接受范围：仅 `web-ext` lint 的 dev/build 链，不进入扩展 runtime dependency closure，也不允许处理用户或远程提供的图片。
- 用户影响：当前发布包运行时无直接暴露；若构建输入边界被扩大，恶意图片可能影响 CI/lint 可用性，因此必须立即撤销例外。
- 到期版本：`0.1.0-rc.1` 候选冻结前；届时必须升级/替换、移除例外，或由 Security Owner 重新书面评审，且 Stable 不得续期。

## 风险处理规则

- 新 Critical/High 风险在发现当天登记；未指定 owner 不得进入开发。
- 风险触发后转为 `Issue/Incident`，但本记录保留并链接处理结果。
- 风险降级/关闭必须提供测试、指标、ADR 或发布证据，不能只写“已解决”。
- 已接受风险必须写明接受人、到期版本和用户影响；Critical 数据/远程执行风险不可永久接受。

## 待决问题

| ID           | 问题                        | 最晚决策点                | 推荐默认                                                                                                                                     |
| ------------ | --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| DECISION-001 | 首发 host permission 策略   | Resolved at Phase 3 Exit  | 显式可选授权：默认无 host access；按当前 origin 或所有站点请求 optional host；生产静态 `content_scripts` 为空，授权后动态注册                |
| DECISION-002 | 最低浏览器版本              | Resolved at Phase 0 Exit  | Chromium 最新两个稳定大版本；Firefox manifest 暂定 `>=142.0`，补齐 ESR 真浏览器矩阵后再下调                                                  |
| DECISION-003 | 新 UI 是否继续使用 Vue 3    | Resolved at Phase 0 Exit  | 使用 Vue 3.5，仅限 presentation；domain/application 无框架依赖                                                                               |
| DECISION-004 | Tier 1 站点最终名单         | Resolved at Phase 5 Exit  | Tier 0 通用 HTMLMediaElement；Tier 1 冻结为 YouTube、Bilibili、Tencent Video、iQIYI、Youku；Phase 5 完成 fixture，真实 smoke 转 Phase 6/Beta |
| DECISION-005 | 配置同步字段白名单          | Resolved at Phase 3 Start | ADR-0008：仅小型非敏感全局标量；bindings/sites/progress/diagnostics/experimental 排除；Preview 不启用跨设备 sync                             |
| DECISION-006 | Headless 权限测试证据政策   | Resolved at Phase 3 Exit  | 隔离 harness 可作为权限状态机自动化证据，但不能替代原生确认框 UX；内部浏览器 API 禁止进入生产，Beta/商店前必须 headed/manual 复核            |
| DECISION-007 | Overlay frame 聚合策略      | Phase 5 Start             | Preview 保持 top-frame-only；在引入 frame registry 前不宣称 iframe-only Overlay 支持                                                         |
| DECISION-008 | Capture transport 上限/协议 | Before Beta               | 先以 4 MiB bounded base64 取证；Beta 前依据性能数据决定降限或专用二进制通道                                                                  |
| DECISION-009 | 发布版本与 ZIP 权威          | Resolved at Phase 6 Exit  | ADR-0014：package.json 单一版本源；repository deterministic ZIP 为可复现权威；WXT 默认 ZIP 不作为 release artifact                         |
| DECISION-010 | Provenance/发布自动化边界     | Resolved at Phase 6 Exit  | 当前只生成 unsigned SLSA-compatible metadata 与 no-publish RC；不 tag/push/sign/store upload，真实身份和签名留在受保护外部流程              |
