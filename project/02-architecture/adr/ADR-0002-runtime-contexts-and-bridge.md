# ADR-0002：采用 MAIN/content/background 分层与严格消息桥

> 状态：Accepted  
> 日期：2026-08-10  
> 决策人：Architect / Security Reviewer  
> 关联：ARCH-001、SEC-001

## Context

播放器 Hook 和站点脚本交互通常需要页面 MAIN world；扩展 storage、tabs、permissions 等能力只能安全地由扩展上下文提供。现有实现将页面消息、扩展 API 和模拟 GM 函数混在一起，并使用多种任意注入兜底。

## Decision

使用三个明确上下文：

- MAIN world：只处理页面媒体与站点适配。
- Isolated content world：建立 nonce 保护的页面桥、overlay 和 frame 生命周期。
- Service worker：统一扩展能力、消息路由、持久化和权限检查。

消息采用版本化判别联合 Envelope；每次会话有随机 nonce；payload 进入业务前经过 Schema 校验；请求必须有 request ID、超时和错误响应。

## Alternatives considered

- 只用 content script：无法可靠接触页面世界中被改写的原生对象，否决。
- 继续以内联脚本/`new Function` 注入：违反 CSP/商店安全预期，否决。
- 让页面直接调用扩展 API：信任边界错误，否决。

## Consequences

需要维护桥接协议和两个页面运行时入口；但可以测试每个边界、限制权限，并使页面故障不拖垮 service worker。

## Follow-ups

- 定义消息 Schema、nonce 握手和拒绝码。
- 在 Chrome/Firefox 各做 CSP、iframe、页面消息攻击测试。
- 为桥接增加协议兼容和超时指标。

