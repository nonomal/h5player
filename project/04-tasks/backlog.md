# Web Extension 重构主任务台账

> 文档 ID：TASK-003  
> 状态：Approved as Initial Backlog  
> 负责人：Project Owner  
> 最后更新：2026-08-10  
> 规则：任务状态以 `progress.md` 为当前摘要，本页保留完整规划。

优先级：P0 稳定版阻塞；P1 稳定版目标；P2 后续/实验。估算：S（≤1 日）、M（2～3 日）、L（4～7 日）、XL（需拆分）。

## EPIC-00：工程基线与脚手架（Phase 0）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-001 | 建立 `web-extension/src`、多入口和 profile 配置 | P0 | L | — | Chrome/Firefox dev 包可加载 | Verified |
| EXT-002 | TypeScript strict、路径别名、声明输出 | P0 | M | EXT-001 | typecheck 通过，无业务 JS 新增 | Verified |
| EXT-003 | ESLint/Prettier/依赖边界/循环依赖检查 | P0 | M | EXT-002 | CI 命令可执行并有失败样例 | Verified |
| EXT-004 | Vitest 基础配置与测试工具箱 | P0 | M | EXT-002 | unit 命令与覆盖率报告可生成 | Verified |
| EXT-005 | Playwright 扩展加载 smoke | P0 | L | EXT-001 | Chrome 真包可安装并打开 popup | Verified |
| EXT-006 | Firefox 扩展加载 spike | P0 | M | EXT-001 | 记录可行性/阻塞和替代方案 | Verified |
| EXT-007 | 固定测试页 basic/multi-player | P0 | M | EXT-005 | 页面可稳定复现媒体元素 | Verified |
| EXT-008 | 固定测试页 SPA/Shadow/iframe | P0 | L | EXT-007 | 生命周期场景可自动驱动 | Verified |
| EXT-009 | Legacy 行为快照与允许差异清单 | P0 | L | EXT-007 | 核心命令快照可重放 | Verified |
| EXT-010 | 新旧构建互不影响的 CI job | P0 | M | EXT-001 | Legacy build 与新 build 同时绿 | Verified |
| EXT-011 | 版本、产物目录和 source map 规范 | P0 | S | EXT-001 | 产物命名和 metadata 固定 | Verified |
| EXT-012 | Phase 0 基线审查 | P0 | M | EXT-001..011 | 评审记录 Approved | Verified |

## EPIC-01：消息、存储与安全基础（Phase 1）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-020 | 定义 Message Envelope 与错误码 | P0 | M | EXT-002 | 类型与 Schema 一致 | Proposed |
| EXT-021 | 实现 nonce 握手与 frame/session 校验 | P0 | L | EXT-020 | 伪造/重放消息被拒绝 | Proposed |
| EXT-022 | 实现 request/response、超时、取消和重连 | P0 | L | EXT-020 | worker 重启可恢复握手 | Proposed |
| EXT-023 | 建立 Browser Ports（runtime/tabs/storage） | P0 | L | EXT-020 | domain 无浏览器导入 | Proposed |
| EXT-024 | 定义 Settings Schema 与命名空间 | P0 | M | EXT-002 | 默认值/边界/未知字段有测试 | Proposed |
| EXT-025 | 实现 SettingsRepository 与并发策略 | P0 | L | EXT-023,EXT-024 | 多 Tab 更新不丢字段 | Proposed |
| EXT-026 | 实现 schema migration、backup、rollback | P0 | L | EXT-025 | N/N-1/损坏数据测试通过 | Proposed |
| EXT-027 | 实现导入/导出格式 v1 与脱敏 | P0 | M | EXT-024,EXT-026 | 非法导入保持原状态 | Proposed |
| EXT-028 | 生成最小权限 manifest profiles | P0 | L | EXT-001,ADR-0005 | 无未证明高危权限 | Proposed |
| EXT-029 | 删除 CSP/unsafe-eval/任意执行路径 | P0 | M | EXT-028 | 静态禁止扫描通过 | Proposed |
| EXT-030 | structured logger 与 redaction | P0 | M | EXT-020 | 日志不含敏感字段 | Proposed |
| EXT-031 | 消息攻击与权限边界测试 | P0 | L | EXT-021,EXT-028 | 安全测试全绿 | Proposed |
| EXT-032 | Phase 1 架构/安全审查 | P0 | M | EXT-020..031 | 评审记录 Approved | Proposed |

## EPIC-02：通用媒体核心（Phase 2）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-040 | MediaSession/Capabilities 领域模型 | P0 | M | EXT-002 | 不变量和序列化测试 | Proposed |
| EXT-041 | DOM media discovery 与 teardown | P0 | L | EXT-023,EXT-040 | 动态媒体生命周期正确 | Proposed |
| EXT-042 | active player 评分与切换 | P0 | L | EXT-041 | 多媒体选择矩阵通过 | Proposed |
| EXT-043 | GenericAdapter | P0 | M | EXT-040,EXT-041 | 无站点配置也能控制 | Proposed |
| EXT-044 | Command Registry 与错误处理 | P0 | L | EXT-040,EXT-043 | 命令输入输出可预测 | Proposed |
| EXT-045 | play/pause/seek 命令 | P0 | M | EXT-044 | basic E2E 通过 | Proposed |
| EXT-046 | rate/volume/mute 命令 | P0 | M | EXT-044 | 范围、锁定和降级通过 | Proposed |
| EXT-047 | 页面运行时组装与幂等初始化 | P0 | L | EXT-041..046 | 重复注入不重复监听 | Proposed |
| EXT-048 | 核心媒体快照消息 | P0 | M | EXT-020,EXT-047 | popup 可读状态 | Proposed |
| EXT-049 | 核心差分测试 | P0 | L | EXT-009,EXT-045,EXT-046 | 允许差异已登记 | Proposed |
| EXT-050 | Phase 2 稳定性/性能审查 | P0 | M | EXT-040..049 | 30 分钟 churn 通过 | Proposed |

## EPIC-03：设置、快捷键和扩展 UI（Phase 3）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-060 | Hotkey domain/interpreter | P0 | L | EXT-044,EXT-024 | 冲突/输入框规则测试 | Proposed |
| EXT-061 | Popup view model 与状态页 | P0 | M | EXT-048,EXT-060 | 真扩展 popup E2E | Proposed |
| EXT-062 | Options 路由与配置表单 | P0 | L | EXT-025,EXT-027 | 保存/撤销/错误提示通过 | Proposed |
| EXT-063 | 快捷键编辑器与冲突提示 | P0 | M | EXT-060,EXT-062 | 键盘可操作 | Proposed |
| EXT-064 | 站点规则与临时停用 | P0 | M | EXT-025,EXT-061 | 当前站点状态正确 | Proposed |
| EXT-065 | 配置导入导出/恢复 UI | P0 | M | EXT-027,EXT-062 | 失败可回滚 | Proposed |
| EXT-066 | 诊断摘要与脱敏导出 | P0 | M | EXT-030,EXT-061,EXT-062 | 诊断包无敏感数据 | Proposed |
| EXT-067 | i18n zh-CN/en-US | P0 | M | EXT-061,EXT-062 | 无硬编码用户文案 | Proposed |
| EXT-068 | A11y/组件测试 | P0 | M | EXT-061..067 | 键盘与 AA 基线通过 | Proposed |
| EXT-069 | Phase 3 产品/UX/安全审查 | P0 | M | EXT-060..068 | 评审记录 Approved | Proposed |

## EPIC-04：高级通用能力（Phase 4）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-080 | transform/filter domain 与命令 | P1 | L | EXT-044,EXT-047 | 状态隔离/重置通过 | Proposed |
| EXT-081 | Fullscreen/PiP capability adapters | P1 | L | EXT-043,EXT-044 | 浏览器 + fixture 通过 | Proposed |
| EXT-082 | Overlay shell 与 Shadow DOM 样式隔离 | P1 | L | EXT-061,EXT-067 | 不污染页面 | Proposed |
| EXT-083 | Screenshot/capture service | P1 | M | EXT-023,EXT-044 | CORS/DRM 错误可解释 | Proposed |
| EXT-084 | Progress repository 与恢复策略 | P1 | M | EXT-025,EXT-040 | 过期/容量/隐私测试 | Proposed |
| EXT-085 | Cross-tab event service | P1 | M | EXT-022,EXT-025 | 不依赖高频轮询 | Proposed |
| EXT-086 | Bundle/performance budgets | P0 | M | EXT-080..085 | CI 超预算失败 | Proposed |
| EXT-087 | Phase 4 视觉/性能审查 | P1 | M | EXT-080..086 | 评审记录 Approved | Proposed |

## EPIC-05：站点适配与兼容（Phase 5）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-100 | Adapter registry/match/priority | P0 | M | EXT-043 | 冲突优先级可预测 | Proposed |
| EXT-101 | Tier 1 YouTube adapter | P1 | M | EXT-100,EXT-081 | fixture + smoke | Proposed |
| EXT-102 | Tier 1 Bilibili adapter | P1 | L | EXT-100,EXT-081 | fixture + smoke | Proposed |
| EXT-103 | Tier 1 Tencent adapter | P1 | M | EXT-100 | fixture + smoke | Proposed |
| EXT-104 | Tier 1 iQIYI/Youku adapters | P1 | L | EXT-100 | fixture + smoke | Proposed |
| EXT-105 | Tier 2 adapter batch | P1 | XL | EXT-100 | 每站点有 owner/fixture | Proposed |
| EXT-106 | Adapter failure isolation | P0 | M | EXT-100..105 | 单适配器故障隔离 | Proposed |
| EXT-107 | Compatibility matrix automation | P0 | L | EXT-101..106 | 生成报告/趋势 | Proposed |
| EXT-108 | Phase 5 compatibility review | P1 | M | EXT-100..107 | Tier 门槛通过 | Proposed |

## EPIC-06：Beta 与 Stable 发布（Phase 6）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-120 | CI required checks 与缓存 | P0 | M | EXT-003..005 | PR 门禁可阻断合并 | Proposed |
| EXT-121 | Chrome/Firefox release profiles | P0 | L | EXT-028,EXT-011 | 产物可复现 | Proposed |
| EXT-122 | hash/SBOM/license/provenance | P0 | M | EXT-121 | artifact 完整 | Proposed |
| EXT-123 | Store listing/privacy/security docs | P0 | L | EXT-028,EXT-030 | 实现与声明一致 | Proposed |
| EXT-124 | Beta opt-in/update/rollback | P0 | L | EXT-121 | 回滚演练通过 | Proposed |
| EXT-125 | release candidate regression | P0 | L | EXT-050,EXT-069,EXT-108 | 两轮候选全绿 | Proposed |
| EXT-126 | Stable Go/No-Go review | P0 | M | EXT-120..125 | 审查记录批准 | Proposed |
| EXT-127 | Post-release review | P1 | M | EXT-126 | 指标和缺陷复盘 | Proposed |

## EPIC-07：实验能力与后续决策（Phase 7）

| ID | 任务 | 优先级 | 估算 | 依赖 | 验收摘要 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| EXT-140 | 下载/MediaSource threat & perf spike | P2 | L | EXT-126 | 明确可行/否决 | Proposed |
| EXT-141 | 声音增益可选模块 | P2 | M | EXT-126 | 权限/性能审查 | Proposed |
| EXT-142 | 声明式自定义规则 Schema | P2 | L | EXT-126 | 不执行任意代码 | Proposed |
| EXT-143 | 共享核心成本收益评估 | P2 | M | EXT-127 | 数据化 ADR | Proposed |
| EXT-144 | 油猴脚本后续项目决策 | P2 | S | EXT-143 | 新章程或明确关闭 | Proposed |
