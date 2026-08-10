# Web Extension 重构风险台账

> 文档 ID：GOV-003  
> 状态：Active  
> 负责人：Project Owner  
> 最后更新：2026-08-10  
> 评审周期：每周及每个里程碑

等级参考：Impact × Likelihood；Critical/High 必须有明确 owner、缓解、触发条件和回退动作。

| ID | 风险 | 影响 | 概率 | 等级 | Owner | 缓解/预防 | 触发信号 | 回退/应急 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RISK-001 | 新工具链修改根配置，破坏 Legacy 构建 | High | Medium | High | Build Owner | 独立扩展配置；CI 同时运行 Legacy build；禁止顺带改旧目录 | `dist` diff、旧 build 失败 | 撤销扩展配置耦合，恢复独立 workspace | Open |
| RISK-002 | Chromium/Firefox MAIN world 注入能力不一致 | High | High | Architect | Phase 0 双浏览器 spike；统一 Port、分 profile | 任一浏览器无法安全运行 page-main | 降级为受支持能力集，推迟该浏览器 Stable | Open |
| RISK-003 | 全站权限影响用户信任和商店审核 | High | High | Security Owner | optional host permission 评估；最小权限 ADR；真实文案 | 审核拒绝、权限警告过大 | 改为按站点授权/缩小首发范围 | Open |
| RISK-004 | 旧功能范围过大导致无休止追平 | High | High | Product Owner | P0/P1/P2、Tier 分级、明确非目标 | Backlog 增速大于完成速度 | 冻结范围，仅交付 P0/Tier 1 | Open |
| RISK-005 | 站点适配器污染通用核心 | High | Medium | Architect | Adapter contract、依赖规则、异常隔离 | core 出现 site 分支或 domain 导入 adapter | 回退 adapter，恢复 generic 行为 | Open |
| RISK-006 | 测试过度依赖真实站点而 flaky | High | High | Quality Owner | 固定 fixture 为主；真实站点仅 smoke | nightly flaky >1%、频繁登录/地区失败 | 暂停站点自动化承诺，补 fixture | Open |
| RISK-007 | worker 休眠/重启导致内存状态丢失 | High | Medium | Runtime Owner | storage authority、重连协议、restart E2E | popup 无状态、页面无法重连 | 安全重建 session，禁用依赖常驻内存功能 | Open |
| RISK-008 | 配置 Schema 迁移损坏用户设置 | Critical | Medium | Data Owner | 版本、备份、dry-run、rollback、测试 | 导入/更新后配置不可读 | 自动恢复备份，停止灰度 | Open |
| RISK-009 | 页面消息桥被恶意网站滥用 | Critical | Medium | Security Owner | nonce、sender、Schema、allowlist、权限二次检查 | 未授权存储/下载/剪贴板请求 | 禁用受影响消息能力，安全 hotfix | Open |
| RISK-010 | 页面 Hook 引发网站行为回归 | High | High | Media Owner | 能力开关、hostile fixtures、站点停用 | 页面报错/播放器失效增加 | 局部禁用 Hook/adapter，保留通用能力 | Open |
| RISK-011 | UI 组件过早绑死业务架构 | Medium | Medium | UI Owner | view model/application facade；domain 无 Vue | 组件直接调用 browser/media DOM | 拆回 facade，冻结新增 UI 功能 | Open |
| RISK-012 | 下载/MediaSource 引发性能、合规或权限问题 | Critical | Medium | Security/Product | Phase 7、默认关闭、独立 ADR | 高内存、商店警告、版权投诉 | 移除实验模块和权限 | Open |
| RISK-013 | 远程 helper/遥测造成隐私争议 | High | Medium | Product/Security | 首发不迁移；未来 opt-in ADR | 出现未声明外联或用户投诉 | 关闭远程能力、发布说明 | Open |
| RISK-014 | 双实现长期维护成本失控 | Medium | High | Project Owner | 功能矩阵、明确稳定边界、Beta 后评估共享 | 同一修复重复劳动显著上升 | 只抽取稳定 pure package，或维持独立范围 | Open |
| RISK-015 | 构建产物不可复现/供应链风险 | Critical | Low | Release Manager | lockfile、固定环境、SBOM、hash、provenance | 相同提交产物 hash 无法解释 | 停止发布，审计依赖和构建环境 | Open |
| RISK-016 | 性能开销使所有页面变慢 | High | Medium | Performance Owner | 无媒体快路径、observer 批处理、bundle/长任务预算 | p95/内存超 NFR，用户反馈卡顿 | 关闭高成本模块、按需加载 | Open |

## 风险处理规则

- 新 Critical/High 风险在发现当天登记；未指定 owner 不得进入开发。
- 风险触发后转为 `Issue/Incident`，但本记录保留并链接处理结果。
- 风险降级/关闭必须提供测试、指标、ADR 或发布证据，不能只写“已解决”。
- 已接受风险必须写明接受人、到期版本和用户影响；Critical 数据/远程执行风险不可永久接受。

## 待决问题

| ID | 问题 | 最晚决策点 | 推荐默认 |
| --- | --- | --- | --- |
| DECISION-001 | 首发 host permission 策略 | Phase 1 开始前 | 首次引导选择，支持按站点授权 |
| DECISION-002 | 最低浏览器版本 | Phase 0 Exit | 以真实测试能力为准，不沿用 Firefox 57 |
| DECISION-003 | 新 UI 是否继续使用 Vue 3 | Phase 0 技术 spike | 使用 Vue 3，但 domain/application 无框架依赖 |
| DECISION-004 | Tier 1 站点最终名单 | Phase 2 Exit | 通用 + YouTube/Bilibili/Tencent/iQIYI/Youku |
| DECISION-005 | 配置同步字段白名单 | Phase 3 开始前 | 仅小型、非敏感全局设置 |

