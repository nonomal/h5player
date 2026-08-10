# ADR-0005：权限最小化并取消远程执行能力

> 状态：Accepted  
> 日期：2026-08-10  
> 决策人：Architecture / Security / Product  
> 关联：SEC-001、SEC-002、NFR-SEC-*

## Context

当前 manifest 声明 `<all_urls>`、`webRequestBlocking`、`declarativeNetRequest`、`clipboardWrite` 等权限；background 还尝试修改 CSP，content 通过内联/Data URI/Function 多路注入。这扩大了攻击面和商店审核风险。

## Decision

- 先用 content script + `world: MAIN`（或浏览器等价受控入口）验证是否能满足页面 Hook，只有必要时才增加权限。
- 删除全站 CSP 修改和任意代码执行兜底。
- 将 `webRequest`、downloads、clipboard、tabs、host permissions 拆成按功能证明的能力；实验能力默认不申请或按可选权限启用。
- 页面消息只能请求白名单命令，不能传函数、脚本、任意 URL 或权限名。
- 远程推荐/助手不纳入首发；若未来需要，使用固定 HTTPS API、响应 Schema、超时、隐私声明和内容安全审查。

Phase 1 manifest 只保留 `storage` 常规权限，并将 `<all_urls>` 放入 `optional_host_permissions`；不静默请求。静态 content script 与 `page-main.js` 可访问范围暂时只包含 localhost/127.0.0.1 fixture。`tabs`、`activeTab`、`scripting`、downloads、clipboard 和网络拦截能力在出现经过验证的使用点前均不申请。

权限事实源为 `project/06-security/permission-inventory.md`，构建产物由 `scripts/security-scan.ts` 对 manifest、CSP、远程资源和禁止代码执行模式进行检查。

## Consequences

- 用户首次安装不会获得真实站点访问；Phase 2/3 必须实现明确授权和内容脚本注册流程。
- `<all_urls>` 只是可选能力，不代表 background 可以执行任意页面请求；sender、消息类型、payload 和具体 capability 仍要逐层校验。
- 发布 profile 必须移除开发 fixture 匹配，或把它们与 production profile 明确分离。
- 没有登记到权限清单的权限不得进入任何 Stable manifest。
