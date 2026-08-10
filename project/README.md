# H5Player Web Extension 重构工程管理中心

> 状态：Active  
> 建立日期：2026-08-10  
> 维护范围：Web Extension 重构的需求、架构、任务、质量、发布与审查资料  
> 与 `docs/` 的边界：`docs/` 继续存放面向用户和现有工程的说明；本目录只管理项目治理与重构交付资料。

## 1. 目录目标

本目录是 H5Player Web Extension 重构的唯一项目管理入口，用来解决以下问题：

- 将“为什么重构、重构到什么程度、何时算完成”固化为可验证的需求。
- 明确油猴脚本是稳定基线，Web Extension 是独立演进的新产品线。
- 用架构边界、类型契约和自动化测试替代隐式约定。
- 用任务 ID、里程碑、质量门禁和审查记录追踪实际进展。
- 为未来是否反向重构油猴脚本保留证据，而不是提前承诺共享代码。

## 2. 核心结论

1. `src/h5player/`、`src/libs/`、`config/` 和现有油猴构建链在本次 Web Extension 重构中视为 Legacy 稳定基线，不进行体系化翻修。
2. `web-extension/` 采用绿地重构，不再把“注入油猴产物并模拟 GM API”作为目标架构。
3. 新扩展采用 TypeScript 严格模式、分层模块、显式能力接口、版本化数据模型和自动化测试矩阵。
4. 页面 MAIN world、扩展 isolated world 与 service worker 必须形成最小权限边界；禁止通过修改全站 CSP、`unsafe-eval`、`new Function` 或任意代码执行完成注入。
5. 功能按纵向切片迁移，以可观测行为与旧脚本做对照；不以“代码搬完”作为完成标准。
6. Web Extension 达到稳定门槛前，不启动油猴脚本的共享核心抽取或 TypeScript 全量迁移。

## 3. 文档地图

| 领域 | 入口 | 用途 |
| --- | --- | --- |
| 治理 | [项目章程](./00-governance/project-charter.md) | 目标、边界、原则、角色与成功标准 |
| 治理 | [文档管理规范](./00-governance/document-standard.md) | 目录、命名、状态、评审和归档规则 |
| 治理 | [工程开发规范](./00-governance/engineering-standard.md) | 工作区、脚本、类型、依赖、CI 与本地开发约定 |
| 治理 | [术语表](./00-governance/glossary.md) | 统一 Legacy、上下文、能力、支持等级等术语 |
| 治理 | [风险台账](./00-governance/risk-register.md) | 风险等级、owner、缓解、触发与复查 |
| 需求 | [产品与重构需求](./01-requirements/product-requirements.md) | 用户价值、范围、功能需求、非目标 |
| 需求 | [功能对照矩阵](./01-requirements/feature-parity-matrix.md) | Legacy 功能到扩展模块、阶段和测试的映射 |
| 需求 | [需求追踪矩阵](./01-requirements/traceability-matrix.md) | 全部功能需求到任务、测试和完成证据的映射 |
| 需求 | [非功能需求](./01-requirements/non-functional-requirements.md) | 性能、安全、兼容、可维护性与可访问性指标 |
| 架构 | [目标架构](./02-architecture/target-architecture.md) | 运行上下文、分层、数据流和目录结构 |
| 架构 | [模块目录与契约](./02-architecture/module-catalog.md) | 模块职责、依赖规则和公共接口 |
| 架构 | [UI 组件架构](./02-architecture/ui-component-architecture.md) | 组件层级、状态、样式隔离与可访问性 |
| 架构 | [数据模型与迁移契约](./02-architecture/data-model.md) | 配置、进度、会话、导入导出和版本迁移 |
| 架构 | [迁移与 Legacy 边界](./02-architecture/migration-strategy.md) | 平行演进、功能切片、回退与共享代码条件 |
| 决策 | [ADR 索引](./02-architecture/adr/README.md) | 已接受和待决的架构决策 |
| 路线图 | [阶段路线图](./03-roadmap/rewrite-roadmap.md) | Phase 0～7、退出条件和依赖关系 |
| 任务 | [主任务台账](./04-tasks/backlog.md) | Epic、任务、依赖和验收标准 |
| 任务 | [当前进度](./04-tasks/progress.md) | 当前阶段、风险、阻塞与下一步 |
| 任务 | [任务工作流](./04-tasks/task-workflow.md) | 从需求到交付的状态机和 Definition of Ready/Done |
| 质量 | [自动化测试策略](./05-quality/test-strategy.md) | 单元、组件、集成、端侧、兼容和差分测试 |
| 质量 | [质量门禁](./05-quality/quality-gates.md) | PR、夜间、候选发布和正式发布门槛 |
| 质量 | [兼容性矩阵](./05-quality/compatibility-matrix.md) | 浏览器、页面形态、重点站点和能力覆盖 |
| 安全 | [安全与隐私基线](./06-security/security-and-privacy.md) | 权限、消息、存储、远程通信和商店审核要求 |
| 发布 | [版本与发布策略](./07-release/release-strategy.md) | 渠道、版本、构建、签名、灰度和回滚 |
| 发布 | [商店与合规清单](./07-release/store-and-compliance.md) | 权限说明、隐私、审核材料与内容边界 |
| 运维 | [可观测性与支持](./08-operations/observability-and-support.md) | 日志、诊断、缺陷分级和兼容性维护 |
| 审查 | [现状基线审查](./09-reviews/baseline-assessment-2026-08-10.md) | 代码事实、缺口、风险与重构起点 |
| 审查 | [审查清单](./09-reviews/review-checklists.md) | 需求、架构、安全、测试和发布审查 |
| 模板 | [模板目录](./templates/README.md) | 新需求、任务、ADR、风险和发布记录模板 |

## 4. 推荐阅读顺序

首次参与重构时按以下顺序阅读：

1. 本页与《项目章程》。
2. 《产品与重构需求》《功能对照矩阵》。
3. 《目标架构》《模块目录与契约》《迁移与 Legacy 边界》。
4. 《阶段路线图》《主任务台账》《自动化测试策略》。
5. 开始任务前阅读相应 ADR、安全基线和质量门禁。

## 5. 单一事实源

- 范围和验收：`01-requirements/`。
- 技术边界和已定决策：`02-architecture/` 与 ADR。
- 计划与执行状态：`03-roadmap/`、`04-tasks/`。
- 是否允许合并或发布：`05-quality/`、`06-security/`、`07-release/`。
- 历史结论和审查证据：`09-reviews/`。

当文档冲突时，优先级为：已接受 ADR > 已批准需求 > 路线图 > 任务描述 > 临时进度记录。冲突必须通过更新上位文档解决，不允许长期保留口头例外。
