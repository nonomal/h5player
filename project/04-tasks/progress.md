# Web Extension 重构进度

> 文档 ID：TASK-002  
> 状态：Active  
> 负责人：Project Owner  
> 最后更新：2026-08-10  
> 更新频率：每周或每个开发周期

## 当前阶段

**Phase 0 Exit：工程基线已验证，Phase 1 Ready**

整体状态：🟢 `EXT-001`～`EXT-012` 已 Verified；Phase 1 可开始，但不得绕过消息、存储和权限边界直接迁移媒体功能。

## Phase 0 已完成

- `web-extension/` 建立独立 Node 24.13.x + pnpm 11.21.0 工程；根 Yarn/Rollup 未改动。
- WXT 0.21.3 + Vite 8.2.1 生成 Chrome/Firefox Manifest V3 多入口产物。
- TypeScript 5.9.3 strict、ESLint 10、Prettier、dependency-cruiser 与禁止 `any`/循环依赖门禁已启用。
- Vitest unit/component/integration/compatibility/coverage 与 Chromium 真扩展 Playwright smoke 已建立。
- Firefox MV3 构建和 `web-ext lint` 通过；MAIN-world 使用 `defineUnlistedScript` + `injectScript` 的跨浏览器路径。
- basic、multi-player、SPA、Shadow DOM、same/cross-origin iframe、hostile-page、strict-CSP fixtures 已建立。
- Legacy 快捷键、允许差异和 userscript hash/size Oracle 已冻结。
- GitHub Actions 同时保护 Legacy 与 Web Extension 构建。

## 验证证据

| 门禁 | 结果 |
| --- | --- |
| `corepack pnpm@11.21.0 check` | format、lint、typecheck、unit、component、integration、compatibility、security、boundaries 全绿 |
| Unit / Component / Integration | 5 / 1 / 1 tests passed |
| Compatibility fixtures | 7 cases passed |
| Coverage | Statements 80.95%、Branches 90%、Functions 80%、Lines 83.33% |
| Chromium E2E | 真实打包扩展、service worker、content、page-main、popup smoke 通过 |
| Firefox | MV3 build 通过，`web-ext lint` 0 errors |
| Security | 双浏览器产物和源码 30 files 扫描通过；无 eval/Function/远程脚本/CSP 放宽 |
| Boundaries | 15 modules，无循环或 domain 越界 |
| Legacy | SHA-256 `91b5312d7cf150cd852d005b1e5d5f3d8ed2ed7cd8a481dfa1d561d48f7b3f27`，561788 bytes，Git 无产物差异 |
| Build size | Chrome、Firefox 解包产物各约 106.49 KB |

## 已知项

- Firefox `web-ext lint` 有 1 条 `UNSAFE_VAR_ASSIGNMENT` warning，来源为 Vue runtime 的静态 `innerHTML` 优化路径，不是业务代码。当前不创建宽泛扫描豁免；后续通过精确依赖来源/版本 allowlist 或上游变化处理。
- Firefox Phase 0 只完成 MV3 构建与 lint，尚未把真浏览器扩展 E2E 纳入 PR 门禁；必须在 Stable 前补齐目标版本矩阵。
- `optional_host_permissions: ['<all_urls>']` 仅声明可选能力，Phase 1 仍须完成首次授权 UX、每项权限证明和二次权限检查。

## 下一步（Phase 1，按顺序）

1. `EXT-020`～`EXT-022`：统一 Message Envelope、nonce/frame/session 校验、超时/取消/重连。
2. `EXT-023`：Browser Ports，使 domain/application 不导入浏览器 API。
3. `EXT-024`～`EXT-027`：Settings Schema、仓储、并发更新、迁移/备份/回滚、导入导出。
4. `EXT-028`～`EXT-031`：权限清单、CSP/动态执行扫描、structured logger、对抗性消息测试。
5. `EXT-032`：Phase 1 Architecture/Security Exit Review。

## 当前风险与阻塞

无硬阻塞。Phase 1 必须关闭或显著降低 `RISK-007`、`RISK-008`、`RISK-009`；首发 host permission 策略仍由 `DECISION-001` 在 Phase 1 中定案。
