# Architecture Decision Records

ADR 用于记录跨模块、跨版本或会影响安全/兼容性的决策。编号不可复用；被取代的 ADR 保留并链接替代项。

| 编号 | 标题 | 状态 | 结论 |
| --- | --- | --- | --- |
| [ADR-0001](./ADR-0001-greenfield-extension.md) | Web Extension 独立绿地重构 | Accepted | 新扩展与油猴主线平行演进 |
| [ADR-0002](./ADR-0002-runtime-contexts-and-bridge.md) | 运行时上下文与消息桥 | Accepted | MAIN/content/background 分层，严格 typed bridge |
| [ADR-0003](./ADR-0003-versioned-storage.md) | 版本化配置与存储权威 | Accepted | background repository + Schema migration |
| [ADR-0004](./ADR-0004-toolchain-and-test-stack.md) | 构建与测试技术栈 | Accepted | 独立 pnpm；WXT/Vite + TS/Vitest/Playwright/Zod Mini |
| [ADR-0005](./ADR-0005-permission-minimization.md) | 权限最小化与远程能力 | Accepted | required 仅 storage；all-sites optional；无网络拦截/远程代码 |
