# Web Extension 权限清单

> 文档 ID：SEC-002  
> 状态：Approved for Phase 1  
> 负责人：Security / Product Owner  
> 最后更新：2026-08-10  
> 关联：ADR-0005、EXT-028、DECISION-001

## 当前 manifest 权限

| 权限/匹配 | 类型 | 当前使用点 | 最小替代与理由 | 用户可见目的 | Chrome / Firefox | 自动化证据 | 移除条件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `storage` | 常规权限 | background `WxtStoragePort`、版本化 SettingsRepository | 页面 localStorage/GM 模拟不满足隔离、并发与迁移要求 | 在本机保存设置、站点规则、备份与后续进度 | 两端统一 WebExtension API | repository migration/concurrency/restart tests；manifest scan | 若产品不再持久化任何用户设置 |
| `<all_urls>` | optional host permission | Phase 1 仅声明，尚未静默请求；实际内容脚本仍只匹配本地 fixture | 用户可选择按站点授权；不把全站访问写入 required host permissions | 用户明确授权后在选定网页控制媒体 | Chrome/Firefox 均由 permissions API 管理，授权 UX 后续按平台适配 | manifest allowlist scan；权限 Port contract | 若产品改为只支持 `activeTab` 单次启用或固定站点列表 |
| `http://localhost/*`、`http://127.0.0.1/*` | 静态 content/WAR match | 自动化 fixture 与 MAIN-world bridge | 仅用于可复现测试，不覆盖真实站点 | 不面向商店用户 | 两端一致 | Chromium extension E2E、Firefox build/lint | 发布 profile 必须删除或明确标记 development-only |

## 明确不申请

当前 manifest 不含：`tabs`、`activeTab`、`scripting`、`downloads`、`clipboardWrite`、`webRequest`、`webRequestBlocking`、`declarativeNetRequest`、`cookies`、远程网络域名或 externally connectable。

任何新增项必须在合入前补齐：代码调用点、威胁场景、替代方案、用户文案、Chrome/Firefox 差异、权限撤销行为、自动化测试和商店声明。页面消息不得传入任意权限名；background 只接受固定消息类型，并以真实 sender context 二次授权。

## Host permission 决策

`DECISION-001` 采用“显式可选授权”方向：不在安装时静默获得全站访问。Phase 2/3 必须提供首次引导与两种模式：

1. 按当前站点启用并可随时撤销；
2. 用户主动选择“所有站点”后请求 `<all_urls>`。

在授权 UX 和动态/按站点注册内容脚本完成前，扩展保持 Preview，不得描述为已支持任意生产站点。
