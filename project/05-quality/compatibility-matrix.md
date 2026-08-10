# 浏览器与页面兼容性矩阵

> 文档 ID：QA-003  
> 状态：Approved as Initial Matrix  
> 负责人：Quality Owner  
> 最后更新：2026-08-10  
> 说明：具体版本号在 Phase 0 按发布时最新稳定版本冻结。

## 1. 浏览器矩阵

| 浏览器 | Dev | Beta | Stable | 必测层级 |
| --- | --- | --- | --- | --- |
| Chrome Stable | ✅ | ✅ | ✅ | full E2E |
| Chrome previous stable | ✅ | ✅ | ✅ | smoke + core |
| Edge Stable | ✅ | ✅ | ✅ | core + popup |
| Firefox Stable | ✅ | ✅ | ✅ | full E2E |
| Firefox ESR | ✅ | ✅ | ✅ | core + permissions |
| Safari | ❌ | ❌ | ❌ | 未承诺，单独评估 |
| 移动浏览器 | ❌ | ❌ | ❌ | 未承诺，单独评估 |

每次发布在 `release-manifest.json` 固化实际版本、OS、架构和测试时间；“最新版”不能作为唯一证据。

## 2. 页面形态矩阵

| 页面形态 | Basic | Core | UI | Security | 长稳 |
| --- | --- | --- | --- | --- | --- |
| 单 video | ✅ | ✅ | ✅ | ✅ | ✅ |
| 多 video/音频 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 动态 SPA | ✅ | ✅ | ✅ | ✅ | ✅ |
| open Shadow DOM | ✅ | ✅ | ✅ | ✅ | ✅ |
| same-origin iframe | ✅ | ✅ | ✅ | ✅ | ✅ |
| cross-origin iframe | ✅ | ✅ | 降级 | ✅ | ✅ |
| 严格 CSP/Trusted Types | ✅ | ✅ | ✅ | ✅ | ✅ |
| 页面 Hook/恶意消息 | — | — | — | ✅ | ✅ |
| 无媒体页面 | ✅ | — | 状态 | ✅ | ✅ |

## 3. 站点支持等级

- Tier 0：通用 HTMLMediaElement；每次 PR 的 fixture 必过。
- Tier 1：高使用量/关键站点；有自动化 fixture、发布前 smoke 和 owner。
- Tier 2：有适配器和手工回归；问题按尽力支持处理。
- Tier 3：仅社区反馈或历史记录；不作为稳定版承诺。

## 4. 兼容性证据

每个矩阵单元至少记录：提交 SHA、扩展版本、浏览器版本、OS、页面 fixture/URL 类别、结果、失败日志 artifact、已知限制和复测日期。真实站点报告不得保存账号、完整媒体 URL 或用户内容。

## 5. 支持策略

若浏览器或站点变更导致能力下降：

1. 先确认 generic adapter 是否仍工作。
2. 按 `BUG-*` 记录最小复现和 Tier。
3. 能力不可用时在 UI 显示降级原因，不静默修改用户设置。
4. 对高频站点可发布 adapter hotfix；涉及权限/协议/数据则走完整 RC 门禁。

