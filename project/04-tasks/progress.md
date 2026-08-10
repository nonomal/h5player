# Web Extension 重构进度

> 文档 ID：TASK-002  
> 状态：Active  
> 负责人：Project Owner  
> 最后更新：2026-08-10  
> 更新频率：每周或每个开发周期

## 当前阶段

**Phase 1 Exit：平台内核与安全边界已验证，Phase 2 Ready**

整体状态：🟢 `EXT-020`～`EXT-032` 已 Verified。后续媒体功能必须通过 Runtime Envelope、Browser Ports、SettingsRepository 和命令/能力白名单接入，不得新增旁路。

## Phase 1 已完成

- 协议 v1：严格 Envelope、固定错误码、requestId/source/session/frame 上下文和 payload Schema。
- 页面桥：256-bit nonce、精确 origin/source/session、replay guard、握手与 teardown。
- 请求生命周期：response correlation、默认超时、AbortSignal、scoped cancel、一次 reconnect/new requestId retry。
- background sender policy：真实 extension ID/URL/tab/frame 校验，content/popup/options 能力矩阵。
- Browser Ports：runtime、storage、tabs、permissions、clock/scheduler、logger；domain/application 无浏览器依赖。
- Settings V1：strict Schema、默认值、站点规范化、字段级 patch、revision/rebase 和变更事件。
- 数据安全：V0→V1、损坏恢复、future no-overwrite、checksum backup、atomic import、export、rollback。
- structured logger：本地 ring buffer、容量限制、URL/query/title/token/cookie/media source 等脱敏。
- 最小权限：仅 `storage` required、`<all_urls>` optional；真实站点授权尚未静默请求。
- 安全/边界扫描：禁止 CSP 放宽、远程脚本、eval/Function、Data URI、业务 innerHTML、Legacy runtime import。

## 验证证据

| 门禁 | Phase 1 结果 |
| --- | --- |
| Unit | 10 files / 23 tests passed |
| Component | 1 file / 1 test passed |
| Integration | 3 files / 21 tests passed |
| Security adversarial | 2 tests passed；unknown/forged/replay/oversize/script payload 被拒绝 |
| Compatibility | 7 fixture checks passed |
| Coverage | Statements 87.80%、Branches 76.43%、Functions 94.40%、Lines 92.03%（具体浏览器 adapter 由真扩展 E2E 覆盖） |
| Chromium E2E | MAIN/content/background/Popup/Options、配置写入、真实终止 service worker 后 revision 恢复通过 |
| Firefox | MV3 build + `web-ext lint` 0 errors；保留 1 条 Vue runtime 已知 warning |
| Security scan | 58 source/output files + 2 manifests 通过 |
| Boundaries | 43 modules / 100 dependencies，无循环或分层违规 |
| Manifest | MV3；required=`storage`；optional host=`<all_urls>`；无 tabs/download/network interception |
| Build footprint | Chrome、Firefox 解包产物各 199.99 KB，content/page-main/background 均低于初始预算 |
| Legacy | SHA-256 `91b5312d7cf150cd852d005b1e5d5f3d8ed2ed7cd8a481dfa1d561d48f7b3f27`，561788 bytes，Git 无产物差异 |

## 关键结论

- MAIN world nonce 用于 document/session 关联和 replay control，不被误当作对同 realm 站点脚本的秘密认证；页面桥目前无任何特权操作。
- Popup/Options 在真实 Chromium 测试 Tab 中也可能带 `sender.tab`；策略以扩展 ID + 精确扩展页 URL 授权，并拒绝 request 自报 tab/frame。
- service worker 随时可终止；设置权威始终位于 storage，内存 replay/in-flight/session 可安全重建。
- 配置同步仍以 local 为权威；`storage.sync` 字段白名单在 Phase 3 前决定。

## 已知项

- Firefox `web-ext lint` 的 `UNSAFE_VAR_ASSIGNMENT` 来自 Vue runtime 静态 `innerHTML` 优化路径；业务源码 innerHTML assignment 扫描为 0，处理期限仍为 Phase 3 Exit。
- Firefox 真浏览器扩展 E2E 尚未进入 PR 门禁，必须在 Phase 2 Exit 补齐或形成带 owner/期限的条件结论。
- 当前静态 content/WAR match 仅供 localhost fixture；按站点与 all-sites 授权/注册必须在 Preview 扩大范围前完成。
- V8 branch coverage 全局为 76.43%，已超过当前自动门禁 75%；关键协议为 90.9%，storage 模块为 78.35%。Stable 前继续提升至 NFR 最终目标。

## 下一步（Phase 2）

1. `EXT-040`：MediaSession/Capabilities/MediaId 领域模型与序列化不变量。
2. `EXT-041`～`EXT-043`：DOM discovery、teardown、active player scoring、GenericAdapter。
3. `EXT-044`～`EXT-046`：Command Registry 与 play/pause/seek/rate/volume/mute。
4. `EXT-047`～`EXT-048`：page-main 幂等组装、媒体 snapshot 通过现有 bridge/runtime 契约传递。
5. `EXT-049`～`EXT-050`：Legacy 差分、fixture E2E、churn/性能审查和 Phase 2 Exit。

## 当前风险与阻塞

无代码硬阻塞。Phase 2 必须处理多媒体生命周期、observer 批处理、hostile page 原始引用和 Firefox 真浏览器自动化；不得以增加全站 required 权限或恢复 Legacy 注入方式解决兼容问题。
