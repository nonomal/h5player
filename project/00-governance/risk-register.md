# Web Extension 重构风险台账

> 文档 ID：GOV-003  
> 状态：Active  
> 负责人：Project Owner  
> 最后更新：2026-08-10  
> 评审周期：每周及每个里程碑

等级参考：Impact × Likelihood；Critical/High 必须有明确 owner、缓解、触发条件和回退动作。

| ID       | 风险                                       | 影响     | 概率   | 等级     | Owner             | 缓解/预防                                                                                                                                            | 触发信号                                            | 回退/应急                                     | 状态                |
| -------- | ------------------------------------------ | -------- | ------ | -------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------- | ------------------- |
| RISK-001 | 新工具链修改根配置，破坏 Legacy 构建       | High     | Low    | Medium   | Build Owner       | 独立 pnpm package/lockfile；CI 同时运行 Legacy build；固定 hash/size；禁止顺带改旧目录                                                               | `dist` diff、旧 build 失败                          | 撤销扩展配置耦合，恢复独立 workspace          | Mitigated / Monitor |
| RISK-002 | Chromium/Firefox MAIN world 注入能力不一致 | High     | Medium | High     | Architect         | ADR-0006 声明式 `world: 'MAIN'`、`document_start`、`allFrames`；无 WAR；Chrome 与 Firefox 153 真扩展 E2E、CSP/hostile/iframe fixture 和双浏览器 lint | 任一目标浏览器构建或真实 E2E 无法安全运行 page-main | 降级为受支持能力集，推迟该浏览器 Stable       | Mitigated / Monitor |
| RISK-003 | 全站权限影响用户信任和商店审核             | High     | Medium | High     | Security Owner    | `<all_urls>` 仅为 optional host permission；权限清单、静态 manifest allowlist 和“按站点/所有站点”显式授权决策已建立                                  | 审核拒绝、权限警告过大、未授权页面执行              | 改为按站点授权/缩小首发范围；Preview 前不申请 | Mitigating          |
| RISK-004 | 旧功能范围过大导致无休止追平               | High     | High   | High     | Product Owner     | P0/P1/P2、Tier 分级、明确非目标                                                                                                                      | Backlog 增速大于完成速度                            | 冻结范围，仅交付 P0/Tier 1                    | Open                |
| RISK-005 | 站点适配器污染通用核心                     | High     | Medium | High     | Architect         | Adapter contract、依赖规则、异常隔离                                                                                                                 | core 出现 site 分支或 domain 导入 adapter           | 回退 adapter，恢复 generic 行为               | Open                |
| RISK-006 | 测试过度依赖真实站点而 flaky               | High     | High   | High     | Quality Owner     | 固定 fixture 为主；真实站点仅 smoke                                                                                                                  | nightly flaky >1%、频繁登录/地区失败                | 暂停站点自动化承诺，补 fixture                | Open                |
| RISK-007 | worker 休眠/重启导致内存状态丢失           | High     | Low    | Medium   | Runtime Owner     | storage authority、reconnect client、真实终止 service worker 的 Chromium E2E；关键状态不依赖内存                                                     | popup 无状态、页面无法重连                          | 安全重建 session，禁用依赖常驻内存功能        | Mitigated / Monitor |
| RISK-008 | 配置 Schema 迁移损坏用户设置               | Critical | Low    | High     | Data Owner        | V0→V1 strict migration、raw checksum backup、corrupt safe default、future schema no-overwrite、rollback 和 atomic import tests                       | 导入/更新后配置不可读                               | 自动恢复备份，停止灰度                        | Mitigating          |
| RISK-009 | 页面消息桥被恶意网站滥用                   | Critical | Medium | High     | Security Owner    | nonce/session/origin/source/replay、payload Schema、真实 sender allowlist；MAIN nonce 不当作同 realm 身份秘密，页面桥无特权                          | 未授权存储/下载/剪贴板请求、未知 type 命中          | 禁用受影响消息能力，安全 hotfix               | Mitigating          |
| RISK-010 | 页面 Hook 引发网站行为回归                 | High     | High   | High     | Media Owner       | 能力开关、hostile fixtures、站点停用                                                                                                                 | 页面报错/播放器失效增加                             | 局部禁用 Hook/adapter，保留通用能力           | Open                |
| RISK-011 | UI 组件过早绑死业务架构                    | Medium   | Medium | Medium   | UI Owner          | view model/application facade；domain 无 Vue                                                                                                         | 组件直接调用 browser/media DOM                      | 拆回 facade，冻结新增 UI 功能                 | Open                |
| RISK-012 | 下载/MediaSource 引发性能、合规或权限问题  | Critical | Medium | Critical | Security/Product  | Phase 7、默认关闭、独立 ADR                                                                                                                          | 高内存、商店警告、版权投诉                          | 移除实验模块和权限                            | Open                |
| RISK-013 | 远程 helper/遥测造成隐私争议               | High     | Medium | High     | Product/Security  | 首发不迁移；未来 opt-in ADR                                                                                                                          | 出现未声明外联或用户投诉                            | 关闭远程能力、发布说明                        | Open                |
| RISK-014 | 双实现长期维护成本失控                     | Medium   | High   | High     | Project Owner     | 功能矩阵、明确稳定边界、Beta 后评估共享                                                                                                              | 同一修复重复劳动显著上升                            | 只抽取稳定 pure package，或维持独立范围       | Open                |
| RISK-015 | 构建产物不可复现/供应链风险                | Critical | Low    | High     | Release Manager   | 精确版本、独立 lockfile、固定 Node/pnpm、Legacy hash；Phase 6 补 SBOM/license/provenance 和跨机复现                                                  | 相同提交产物 hash 无法解释                          | 停止发布，审计依赖和构建环境                  | Mitigating          |
| RISK-016 | 性能开销使所有页面变慢                     | High     | Medium | High     | Performance Owner | 无媒体快路径、observer 批处理、bundle/长任务预算                                                                                                     | p95/内存超 NFR，用户反馈卡顿                        | 关闭高成本模块、按需加载                      | Open                |

## 风险处理规则

- 新 Critical/High 风险在发现当天登记；未指定 owner 不得进入开发。
- 风险触发后转为 `Issue/Incident`，但本记录保留并链接处理结果。
- 风险降级/关闭必须提供测试、指标、ADR 或发布证据，不能只写“已解决”。
- 已接受风险必须写明接受人、到期版本和用户影响；Critical 数据/远程执行风险不可永久接受。

## 待决问题

| ID           | 问题                      | 最晚决策点               | 推荐默认                                                                                                                            |
| ------------ | ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| DECISION-001 | 首发 host permission 策略 | Resolved at Phase 1 Exit | 显式可选授权：默认不申请；首次引导提供按当前站点或用户主动选择所有站点；Preview 静态匹配只覆盖 fixture                              |
| DECISION-002 | 最低浏览器版本            | Resolved at Phase 0 Exit | Chromium 最新两个稳定大版本；Firefox manifest 暂定 `>=142.0`，补齐 ESR 真浏览器矩阵后再下调                                         |
| DECISION-003 | 新 UI 是否继续使用 Vue 3  | Resolved at Phase 0 Exit | 使用 Vue 3.5，仅限 presentation；domain/application 无框架依赖                                                                      |
| DECISION-004 | Tier 1 站点最终名单       | Resolved at Phase 2 Exit | Tier 0 通用 HTMLMediaElement；Tier 1 冻结为 YouTube、Bilibili、Tencent Video、iQIYI、Youku，Phase 5 按 adapter fixture + smoke 交付 |
| DECISION-005 | 配置同步字段白名单        | Phase 3 开始前           | 仅小型、非敏感全局设置                                                                                                              |
