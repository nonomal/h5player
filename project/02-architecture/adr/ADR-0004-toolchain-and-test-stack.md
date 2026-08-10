# ADR-0004：采用 WXT/Vite + TypeScript + Vitest + Playwright 的多入口体系

> 状态：Proposed  
> 日期：2026-08-10  
> 决策人：待 Phase 0 spike 后确认  
> 关联：NFR-MAINT-*、NFR-TEST-*

## Context

仓库当前使用 Rollup 直接构建油猴产物，没有 TypeScript 配置、测试脚本或扩展真实加载测试。新扩展需要多入口 manifest、快速开发、类型检查、单元/组件测试和浏览器端 E2E。

## Proposal

- WXT（首选）或等价的 Vite 薄封装：manifest profile、多浏览器入口、开发服务器、静态资源和打包；若 spike 证明框架带来不可接受约束，则降级为 raw Vite 多入口，但不自建庞大私有框架。
- TypeScript：`strict` 类型检查、路径别名和生成声明。
- Vue 3：仅用于 popup/options/overlay presentation；领域层不绑定 Vue。
- Vitest + Testing Library：领域、应用、组件和契约测试。
- Playwright：加载真实 unpacked extension，覆盖 Chromium；Firefox 以可行性 spike 和稳定版矩阵纳入。
- ESLint + TypeScript ESLint + Prettier：统一静态质量。
- Schema 库（推荐 Zod 或等价方案）：消息、配置、导入数据运行时校验。

## Spike acceptance

Phase 0 必须证明：

1. Chrome/Firefox dev profile 都能生成可加载扩展。
2. service worker、content、page-main、popup、options 多入口可调试。
3. Vitest 能运行纯 Node 测试，Playwright 能安装并连接扩展。
4. source map、manifest 权限和 zip 产物可检查。
5. 热更新不会污染 Legacy 构建链。
6. 框架生成的 manifest、权限、入口和资源可被静态检查，且不存在无法绕开的运行时黑盒。

若某项失败，允许替换具体插件，但保留 TypeScript、契约 Schema、真实扩展 E2E 和可复现产物这四个不变目标。
