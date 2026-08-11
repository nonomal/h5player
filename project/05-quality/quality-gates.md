# 自动化质量门禁

> 文档 ID：QA-002  
> 状态：Approved / Phase 5 Executed  
> 负责人：Quality Owner  
> 最后更新：2026-08-11

## 1. PR 门禁（每次变更）

必须全部通过：

- `format:check`
- `lint`
- `typecheck`
- `unit`
- 受影响模块的组件/集成测试
- 依赖边界与循环依赖扫描
- 禁止代码/远程资源/权限扫描
- manifest schema/lint
- Legacy 构建回归（不修改其源码）
- `test:coverage` 全局 thresholds：statements/lines/functions ≥80%，branches ≥75%
- `build:all` 后执行 `test:budget`，同时检查三类入口 raw budget 和 production manifest guardrail

以下变更额外要求：

| 变更                | 额外门禁                                                  |
| ------------------- | --------------------------------------------------------- |
| message/schema      | contract tests + backwards compatibility review           |
| storage/migration   | N/N-1/corrupt/rollback tests                              |
| permission/manifest | security review + store text update                       |
| DOM Hook/adapter    | hostile page + lifecycle + target browser E2E             |
| UI                  | component + a11y + i18n tests                             |
| build/release       | reproducibility + artifact inspection                     |
| capture/progress    | bounded artifact、隐私/TTL/容量、CORS/DRM/完成删除测试    |
| cross-tab           | sender context、source tab 过滤、发送失败隔离、无轮询证明 |

## 2. Nightly 门禁

- Chrome/Firefox 完整 E2E 矩阵。
- 30 分钟媒体 churn 和 worker restart 压力。
- Tier 1/2 adapter fixture。
- 依赖漏洞、许可证、SBOM 和产物扫描。
- 与上一稳定候选的差分测试。
- 生成覆盖率、兼容性、性能和 flaky 报告。

## 3. Release Candidate 门禁

- 所有 PR 门禁和 nightly 结果在候选提交上重新运行。
- P0 E2E 100% 通过；P1 E2E ≥90% 且未通过项有批准的风险记录。
- 核心 domain/application 覆盖率达到 NFR 目标。
- bundle、启动、内存和长任务预算不超标。
- Critical/High 安全漏洞为 0；权限与隐私文案一致。
- Chrome/Firefox zip 可安装、升级、卸载和回滚。
- 产物 hash、SBOM、许可证、提交 SHA 和版本 metadata 齐全。

## 4. Stable Go/No-Go

### Go 条件

- 无未接受 P0/P1 缺陷。
- 两个连续候选版本在目标浏览器矩阵通过。
- Tier 1 站点自动化保护通过，Tier 2 有明确降级说明。
- 数据迁移/恢复演练成功。
- 权限、安全、隐私、商店 listing 和支持文档均获审查。
- 回滚包和 incident 联系路径可用。

### No-Go 条件

- 任何未解释的权限扩大、远程代码或 CSP 绕过。
- 关键命令在一个目标浏览器不稳定。
- service worker 重启导致设置丢失或页面无法重连。
- E2E 通过依赖真实生产站点偶然可用。
- 发布产物不可复现或无法确认来源。

## 5. 例外规则

例外必须写入 `RISK-*` 或发布审批记录，包含：范围、理由、用户影响、临时缓解、owner、到期版本和回退条件。P0 安全门禁、远程执行禁止项和数据损坏保护不可豁免。

## 6. Phase 4 强制预算与执行约束

| 项目                   | 门槛/策略                                       | 当前结果                              |
| ---------------------- | ----------------------------------------------- | ------------------------------------- |
| background raw         | ≤150 KiB                                        | Chrome 90,150 B；Firefox 90,151 B     |
| content raw            | ≤250 KiB                                        | 两端 191,669 B                        |
| page-main raw          | ≤200 KiB                                        | 两端 77,976 B                         |
| production manifest    | required host=0、static content script=0、WAR=0 | Passed                                |
| Chromium extension E2E | `workers: 1`，每场景独立 persistent profile     | 3 passed / 1 configured churn skipped |
| churn smoke            | 5 秒 PR smoke；30 分钟 nightly/RC               | 94 cycles、1 restart、listeners 4→4   |

Chromium 扩展 lifecycle 用例不得在同一机器上并行启动多个 persistent profile。Phase 4 实测并行运行会让 profile seed/
close/worker startup 争抢资源，在产品断言开始前耗尽 30 秒 timeout；串行运行全部通过。需要并行时应拆成独立 CI job/
runner，而不是提高单用例 timeout 掩盖资源竞争。

Phase 4 Conditional GO 不替代 Nightly/RC 门禁：尚未重跑 30 分钟 churn、Tier 1 真实站点、完整浏览器版本矩阵、
headed 权限 UX、zip 安装升级/回滚和 SBOM/provenance。

## 7. Phase 5 Adapter 强制门禁

- `pnpm test:compat` 必须通过所有 Tier 1/Tier 2 脱敏 fixture；`pnpm test:compat:report` 必须通过
  catalog/fixture/SHA baseline。
- 每个 adapter 必须有 owner、version、Tier、support level、fixture 和 lastVerified；support level/owner drift 或超过
  183 天未复核均阻断合并。
- registry priority/tie、version/feature disable、SPA rematch、attach/detach/action/selector failure isolation 必须有自动化证据。
- adapter diagnostics 必须 bounded、脱敏，并显示 selected/status/failureCount/disabledFeatures；Generic fallback 不能被站点异常破坏。
- “真实站点 smoke 未执行”属于明确黄项，不得在发布说明中写成生产支持；Phase 6/Beta 前必须补齐并冻结环境证据。
- kill switch 只能是随扩展发布的静态代码，不允许远程 selector、远程任意函数、页面注入规则或新增权限。
