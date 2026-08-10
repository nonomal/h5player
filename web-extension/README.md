# H5Player Web Extension

该目录同时保留旧的注入原型和新的 WXT 工程。根目录 Legacy 油猴构建仍可运行
`corepack yarn@3.7.0 build` / `build:inject`；新工程不会读取 Legacy 运行时，也不会改写根
`package.json`、`yarn.lock` 或 Rollup 配置。

## 新工程基线

- Node 24.13.x
- pnpm 11.21.0（独立 `pnpm-lock.yaml`）
- WXT 0.21.3 + Vite 8.2.1
- TypeScript 5.9.3 strict（TypeScript 7 暂不满足 typescript-eslint 兼容范围）
- Vue 3.5.41
- Vitest 4.1.10 + Playwright 1.62.1
- ESLint 10.8.1 + typescript-eslint 8.66.0
- Zod Mini 4.4.3，用于运行时边界校验且避免标准构建中的 Function/JIT 路径

所有版本精确锁定。WXT 仍处于 `0.x`，升级必须独立 PR 并运行完整构建与 E2E。

## 常用命令

```bash
corepack pnpm@11.21.0 install --frozen-lockfile
corepack pnpm@11.21.0 check
corepack pnpm@11.21.0 build:all
corepack pnpm@11.21.0 test:e2e
corepack pnpm@11.21.0 test:e2e:firefox
corepack pnpm@11.21.0 test:legacy
```

Chrome 与 Firefox 均构建 Manifest V3。Chromium E2E 加载真实打包扩展；Firefox 当前通过
MV3 构建和 `web-ext lint`，浏览器级自动化可用性记录在 Phase 0 评审中。

## 目录边界

- `entrypoints/`：background、isolated content、page-main、popup、options。
- `src/domain/`：纯领域逻辑，不依赖 Vue、WXT 或浏览器 API。
- `src/shared/`：跨入口协议与无副作用工具。
- `src/ui/`：Vue 展示组件。
- `tests/`：unit、component、integration、compatibility、E2E 和固定页面。
- `scripts/`：安全扫描与 Legacy 构建回归。
- 旧 `background.js`、`content.js`、`inject.*`、`manifest.json`、`popup.*`：Legacy prototype，
  只供旧 `build:inject` 使用；新代码不得导入。
