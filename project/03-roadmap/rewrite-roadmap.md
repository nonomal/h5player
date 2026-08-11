# Web Extension 重构路线图

> 文档 ID：ROADMAP-001  
> 状态：Approved / Phase 3 Exit Baseline  
> 负责人：Project Owner  
> 最后更新：2026-08-11  
> 估算方式：以退出条件为主，不以日期驱动；建议两周一个可演示增量。

## 总体路径

```text
Phase 0 基线与脚手架
  -> Phase 1 契约、存储、消息、安全边界
    -> Phase 2 媒体核心纵向切片
      -> Phase 3 配置/快捷键/Popup/Options
        -> Phase 4 画面、UI、截图、进度
          -> Phase 5 站点适配与兼容矩阵
            -> Phase 6 Beta、发布工程与稳定化
              -> Phase 7 实验能力与是否共享核心的决策
```

## 当前阶段状态

| 阶段       | 状态                  | 结论                                                                                                                 |
| ---------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Phase 0    | Completed             | 独立工程基线与 Legacy 隔离已批准                                                                                     |
| Phase 1    | Completed             | typed protocol、storage、security boundary 已批准                                                                    |
| Phase 2    | Completed             | Tier 0 媒体核心与双浏览器真实扩展证据已批准                                                                          |
| Phase 3    | Completed for Preview | [Exit Review](../09-reviews/phase-3-exit-review-2026-08-11.md) 为 Conditional GO；可进入 Phase 4，不具备 Stable 资格 |
| Phase 4    | Next                  | 高级通用能力、页面组件、性能预算                                                                                     |
| Phase 5～7 | Planned               | 站点适配、发布稳定化、实验与 Legacy 后续决策                                                                         |

## Phase 0：基线冻结与工程脚手架

目标：建立不触碰 Legacy 的独立开发闭环。

主要交付：

- 确认 ADR-0004 技术栈，创建 TS 严格模式、多入口 manifest profile。
- 建立 lint、format、typecheck、unit、build、extension E2E 命令。
- 建立固定测试页面：basic、multi-player、SPA、Shadow DOM、same/cross-origin iframe、property-reset。
- 记录 Legacy 核心行为快照、默认快捷键和允许差异。
- 建立 CI、artifact、依赖缓存和基础安全扫描。

退出条件：

- Chrome 与 Firefox dev 包可加载；至少一个空壳 popup、content、background 和 page-main E2E 通过。
- Legacy `yarn build` 仍可运行且产物行为不因新脚手架改变。
- 新代码无 JS 业务文件、无 `any` 漏洞基线、无循环依赖。
- `EXT-001`～`EXT-012` 全部 Verified。

## Phase 1：契约、消息、配置与安全边界

目标：先完成跨上下文基础设施，使后续功能不再绕过边界。

主要交付：

- 消息 Envelope、Schema、nonce 握手、请求超时、错误码。
- background settings repository、schemaVersion、迁移、备份和订阅。
- Browser Ports、structured logger、diagnostic redaction。
- 权限清单、manifest 最小权限和 CSP/远程执行禁止扫描。

退出条件：

- 页面伪造消息、错误 payload、重放、未知 type 被安全拒绝。
- 多 Tab 并发写不同配置字段不丢失；service worker 重启后状态恢复。
- manifest 不含 `webRequestBlocking`/全站 CSP 改写；产物扫描不含 `eval`/`new Function`。
- 配置从 N、N-1、损坏数据迁移/恢复测试通过。

## Phase 2：通用媒体核心 MVP

目标：在真实扩展中完成从媒体发现到命令执行的最小闭环。

范围：

- 媒体发现、生命周期、active player 评分。
- play/pause、seek、rate、volume/mute。
- 通用 adapter、命令注册表、快捷键只读默认映射。
- 当前页面连接状态和最小 popup 控制。
- Chrome 与 Firefox 的真实扩展 core smoke；Firefox 驱动由 Selenium Manager 在测试运行时治理。

退出条件：

- P0 核心命令在 basic/multi/SPA/Shadow/iframe fixtures 通过。
- 30 分钟 churn 测试无 listener/session 单调增长。
- 与 Legacy 的核心命令差分用例通过或差异已批准。
- Chrome/Firefox 核心 E2E 全绿。

Phase 2 的 Firefox 证据以当前自动化 Firefox 153.0 为基线；Firefox 最低版本 `142.0` 与 ESR
权限矩阵仍需在 Stable 前按兼容矩阵补齐，不得把单一版本结果扩写为全版本承诺。

## Phase 3：配置、快捷键与原生扩展 UI

目标：让用户可理解地管理扩展，而不是依赖油猴菜单模拟。

状态：**Completed for Preview / Conditional GO（2026-08-11）**。

范围：

- Popup 当前页面状态、常用命令和站点开关。
- Options 全局/站点设置、快捷键编辑、冲突校验、导入导出、恢复默认。
- 跨 Tab `storage.local` change event + revision 重拉、诊断脱敏导出；Preview 不启用跨设备 `storage.sync`。
- 全局页面/播放器聚焦快捷键模式。
- optional host onboarding、动态 isolated/MAIN registration、当前页 bootstrap 与撤权 teardown。

退出条件：

- [x] P0 配置/快捷键/UI 需求在 unit/component/integration 与 Chrome 真扩展主路径通过；Firefox 真扩展覆盖权限和媒体核心链路。
- [x] Popup/Options/ShortcutRecorder 的 axe 自动基线与键盘交互通过；完整 headed/manual WCAG 与视觉审查保留为 Beta 门禁。
- [x] 配置导入失败不会修改现有数据；V1/V2 读取、V2 导出、reset/backup/restore 可逆并有测试。
- [x] Popup 能解释无权限、受限页面、无媒体、站点/本页停用和 runtime 状态。
- [x] 生产 manifest 无 required host、静态 content scripts 和 WAR；Chrome grant/reject/revoke 与 Firefox grant/revoke 生命周期通过。

验证摘要：28 个 unit files / 93 tests、3 个 component files / 9 tests、7 个 integration files / 40 tests、
21 个 compatibility tests；Chrome 3 个 E2E 场景、Firefox 153.0 权限/媒体 E2E、5 秒 churn smoke、security scan、
dependency boundaries 和 Legacy hash 回归均通过。精确证据以 Phase 3 Exit Review 为准。

未纳入本阶段完成声明：Tier 1 真实站点、Firefox ESR/最低版本、Chrome previous stable、Edge、原生权限确认框 headed UX、
商店审核材料、完整 RC 长稳和 Stable Go/No-Go。

## Phase 4：高级通用能力与页面组件

目标：完成 Legacy 的主要高频增强体验。

范围：

- transform、filter、reset、web/native fullscreen、PiP。
- 页面 overlay 组件化、按需加载和站点禁用。
- 截图、进度保存/恢复、跨 Tab 受控状态。

退出条件：

- 视觉状态按媒体隔离，重置原子可靠。
- CORS/DRM/能力不足给出可解释降级。
- overlay 不污染页面 CSS/全局命名，组件与视觉回归测试通过。
- 页面加载性能和 bundle 预算满足 NFR。

## Phase 5：站点适配与兼容性收敛

目标：把历史 TCC 中高价值站点逐个迁入可测试 Adapter。

范围：

- Tier 1 站点自动化保护。
- Tier 2 站点 fixture + 手工 smoke。
- adapter health、版本禁用、诊断命中信息。
- 站点问题模板和快速回退机制。

退出条件：

- Tier 1 全部自动化通过；Tier 2 有发布证据。
- 单个 adapter 抛错不会影响 generic adapter。
- 每个 adapter 有 owner、支持等级、fixture 和最近验证日期。
- 兼容矩阵无未解释红项。

## Phase 6：Beta、发布工程与稳定化

目标：形成可安全分发、可灰度、可回滚的产品。

范围：

- Alpha/Beta/Stable profile、自动版本、zip、hash、SBOM、许可证报告。
- Chrome Web Store / Firefox AMO 审核资料和隐私说明。
- Beta 反馈、缺陷分级、发布候选回归、性能/安全审计。
- 发布、回滚和 incident runbook。

退出条件：

- 两个连续 Beta 候选无 P0/P1 回归。
- 所有质量门禁通过，发布包可复现并成功安装。
- 权限提示、隐私政策、商店描述与实际实现一致。
- Stable Go/No-Go 审查批准。

## Phase 7：实验能力与 Legacy 后续决策

目标：把高风险能力置于成熟基础之上，并决定是否影响油猴主线。

候选：

- 媒体下载/MediaSource、音频增益、声明式自定义规则。
- 可选遥测或兼容性健康信号（必须 opt-in）。
- 抽取通用 pure packages 给油猴脚本使用。

退出条件：

- 每项实验功能都有独立权限、风险、性能和合规 ADR。
- 扩展稳定运行数据足以评估共享核心收益与成本。
- 关于“是否重构油猴脚本”的新项目章程被明确批准或否决。

## 阶段控制规则

- 不允许为了追赶站点数量跳过 Phase 1 的消息、存储和权限边界。
- 一个阶段可提前实现后续 spike，但不能宣告后续功能完成。
- 每个阶段结束都必须在 `09-reviews/` 新增评审记录，并更新 backlog、progress、矩阵和风险。
- 若连续两个里程碑质量门禁未过，暂停新增功能，优先偿还架构和测试债。
- Phase 3 的 Conditional GO 只授权继续 Phase 4 工程开发；任何 Beta/Stable 或 Tier 1 对外承诺仍必须满足 Phase 5/6 门禁。
