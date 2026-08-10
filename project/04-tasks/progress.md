# Web Extension 重构进度

> 文档 ID：TASK-002  
> 状态：Active  
> 负责人：Project Owner  
> 最后更新：2026-08-10  
> 更新频率：每周或每个开发周期

## 当前阶段

**Pre-Phase 0：规划与基线建立**

整体状态：🟡 规划基线已建立，尚未启动业务代码重构。

## 已完成

- 建立根目录 `project/` 工程管理体系及文档规范。
- 审计 Legacy 入口、构建、GM API、配置、站点 TCC、UI 与远程助手。
- 审计当前 Web Extension manifest、注入、消息、存储、popup 与打包脚本。
- 确定平行绿地重构、Legacy 只读边界、目标架构和阶段路线图。
- 建立需求、功能矩阵、测试、安全、发布和任务基线。

## 当前事实

- 当前扩展通过 `inject.main.js` 直接引入 `src/h5player/index.js`。
- 当前注入器模拟同步 GM API，并同时写页面 localStorage 和 extension storage。
- 当前 background 会放宽所有页面 CSP，content 还包含内联/Data URI/`new Function` 兜底。
- 当前仓库没有测试脚本、tsconfig、扩展 CI 或商店发布流水线。
- `package.json` 版本与 manifest 版本已出现不一致，扩展打包脚本也未进入 package scripts。

## 下一步（按顺序）

1. 批准 ADR-0004、ADR-0005 的 Phase 0 spike 范围。
2. 执行 `EPIC-00`：工程脚手架与 Legacy 基线保护。
3. 建立真实扩展最小 E2E 和固定媒体测试页。
4. 建立消息/配置 Schema 与权限清单。
5. 完成 Phase 0 Exit Review 后进入媒体核心。

## 当前风险

| ID | 风险 | 等级 | 状态 | 缓解 |
| --- | --- | --- | --- | --- |
| RISK-001 | 新工程配置误改 Legacy 构建 | High | Open | 分离配置、CI 同时验证旧 build |
| RISK-002 | Chrome/Firefox MAIN world 能力差异 | High | Open | Phase 0 双浏览器 spike |
| RISK-003 | 站点特例数量造成范围失控 | High | Open | Tier 分级与 adapter 退出条件 |
| RISK-004 | 类型迁移演变为照搬旧对象 | Medium | Open | 先建领域模型和命令契约 |
| RISK-005 | E2E 对真实站点不稳定 | High | Open | 固定 fixture 为主、真实站点 smoke 为辅 |
| RISK-006 | 用户期望“一版完全等价” | Medium | Open | 功能矩阵和 P0/P1/P2 明示 |

## 阻塞

暂无硬阻塞。需要在开始实现前由维护者确认：

- 首发最低浏览器版本；
- 首发是否默认请求所有站点权限，或采用按站点授权；
- 首个 Beta 的 Tier 1 站点最终名单；
- 是否继续使用 Vue 3 作为新 UI 层（架构不依赖此选择）。

这些选择不阻碍 Phase 0 基础设施 spike，但会影响 manifest 和 UI 实现。

