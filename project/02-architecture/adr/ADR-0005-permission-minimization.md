# ADR-0005：权限最小化并取消远程执行能力

> 状态：Proposed  
> 日期：2026-08-10  
> 决策人：待 Security Review  
> 关联：SEC-001、SEC-002、NFR-SEC-*

## Context

当前 manifest 声明 `<all_urls>`、`webRequestBlocking`、`declarativeNetRequest`、`clipboardWrite` 等权限；background 还尝试修改 CSP，content 通过内联/Data URI/Function 多路注入。这扩大了攻击面和商店审核风险。

## Proposal

- 先用 content script + `world: MAIN`（或浏览器等价受控入口）验证是否能满足页面 Hook，只有必要时才增加权限。
- 删除全站 CSP 修改和任意代码执行兜底。
- 将 `webRequest`、downloads、clipboard、tabs、host permissions 拆成按功能证明的能力；实验能力默认不申请或按可选权限启用。
- 页面消息只能请求白名单命令，不能传函数、脚本、任意 URL 或权限名。
- 远程推荐/助手不纳入首发；若未来需要，使用固定 HTTPS API、响应 Schema、超时、隐私声明和内容安全审查。

## Decision gate

Phase 1 必须产出权限清单：每项包含使用点、最小替代方案、用户可见目的、Chrome/Firefox 差异、测试和商店说明。没有证明的权限不得进入 Stable manifest。

