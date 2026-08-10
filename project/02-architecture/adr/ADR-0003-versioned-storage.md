# ADR-0003：配置由版本化 Storage Repository 统一管理

> 状态：Accepted  
> 日期：2026-08-10  
> 决策人：Architect  
> 关联：REQ-001、ARCH-001

## Context

Legacy 同时使用页面 `localStorage`、GM storage、sessionStorage 和内存状态；不同 Tab 可能读取旧快照并互相覆盖。扩展还需要跨上下文同步、数据导入导出和浏览器更新迁移。

## Decision

由 background 的 `SettingsRepository` 作为扩展配置权威：

- 数据采用 `schemaVersion`、命名空间和显式 metadata 包装。
- 所有读取/写入/订阅经过 repository 和 typed message API。
- 迁移函数按版本顺序执行，迁移前生成备份，失败可恢复。
- 页面只缓存只读快照；修改通过 command/use case 请求 background。
- site override、global settings、session state 分离存储，禁止混写。

## Alternatives considered

- 每个页面直接使用 `localStorage`：跨域/跨 Tab 一致性差，且暴露给网页脚本，否决。
- 继续模拟 GM API：只能保留旧行为，无法表达新契约，否决。
- 完全依赖 `storage.sync`：配额、隐私和写入延迟不适合所有状态，否决。

## Consequences

需要异步化 UI 和命令流程，并编写迁移测试；换来一致性、可恢复性、可导出和可审计的数据生命周期。

Phase 1 已实现 V1：权威 key 为 `h5player.web-extension.settings`，backup key 为 `h5player.web-extension.settings.backup`。background repository 串行 mutation、每次重读权威值并执行字段 patch；落后 revision 在最新数据上 rebase，不丢失无关字段。N/N-1、损坏恢复、future schema 不覆盖、checksum backup、原子导入、rollback 和 service worker 重启恢复已有自动化证据。

## Follow-ups

- 固化 `SettingsSchema` 和 key namespace。
- 设计并测试 Legacy JSON 导入映射。
- 定义并发更新策略（版本号/乐观锁/字段级合并）。
