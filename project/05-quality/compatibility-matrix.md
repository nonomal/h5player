# 浏览器与页面兼容性矩阵

> 文档 ID：QA-003  
> 状态：Approved for Phase 4 Preview  
> 负责人：Quality Owner  
> 最后更新：2026-08-11  
> 说明：具体版本号在 Phase 0 按发布时最新稳定版本冻结。

## 1. 浏览器矩阵

| 浏览器                 | Dev 目标 | Beta 目标 | Stable 目标 | 当前证据/状态                                   | 必测层级           |
| ---------------------- | -------- | --------- | ----------- | ----------------------------------------------- | ------------------ |
| Chrome Stable          | 需要     | 需要      | 需要        | bundled Chromium harness 已通过；发布频道未冻结 | full E2E           |
| Chrome previous stable | 需要     | 需要      | 需要        | Phase 4 未执行，Stable 前补齐                   | smoke + core       |
| Edge Stable            | 需要     | 需要      | 需要        | Phase 4 未执行，Phase 5/6 补齐                  | core + popup       |
| Firefox Stable         | 需要     | 需要      | 需要        | Firefox 153.0 临时安装 MV3 已通过               | full E2E           |
| Firefox ESR            | 需要     | 需要      | 需要        | Phase 4 未执行；最低版本暂定 142.0              | core + permissions |
| Safari                 | 不承诺   | 不承诺    | 不承诺      | 单独评估                                        | —                  |
| 移动浏览器             | 不承诺   | 不承诺    | 不承诺      | 单独评估                                        | —                  |

### Phase 2 已执行子矩阵（2026-08-10）

| 浏览器/运行时                  | 版本                            | 扩展验证              | 页面与命令范围                                                                                   | 结果                           |
| ------------------------------ | ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| Chromium（Playwright bundled） | 当前 bundled                    | unpacked MV3          | basic、multi/SPA、open Shadow DOM、same/cross-origin iframe、hostile、strict CSP、worker restart | 通过                           |
| Firefox（Playwright bundled）  | 153.0；manifest minimum `142.0` | Selenium 临时安装 MV3 | basic；声明式 MAIN/content/background/popup；seek、rate、volume、mute、play、pause               | 通过                           |
| Firefox ESR                    | 发布时冻结                      | build/lint 计划       | core + permissions                                                                               | Phase 2 未执行，Stable 前补齐  |
| Edge Stable                    | 发布时冻结                      | 未执行                | core + popup                                                                                     | Phase 2 未执行，Phase 5/6 补齐 |

Firefox E2E 入口为 `pnpm test:e2e:firefox`，使用 Selenium Manager 解析 geckodriver；测试不把浏览器驱动作为带 postinstall 下载脚本的项目依赖。

每次发布在 `release-manifest.json` 固化实际版本、OS、架构和测试时间；“最新版”不能作为唯一证据。

### Phase 3 已执行子矩阵（2026-08-11）

| 浏览器/运行时      | 安装方式                                           | 权限与 UI 范围                                                                                                                                             | 结果                                                |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Chromium bundled   | Playwright persistent context，unpacked Chrome MV3 | 未授权/拒绝/受限页；当前站点与 all-sites grant；Popup 命令、快捷键、临时/永久停用、worker restart、撤权；multi/SPA/Shadow/hostile/CSP/iframe；Options 撤权 | 3 个 E2E 场景通过                                   |
| Firefox 153.0      | Selenium 临时安装 `.output/firefox-mv3`            | optional origin + `activeTab` harness、动态 registration/bootstrap、seek/rate/volume/mute/play/pause、撤权和重载后 absence                                 | 通过                                                |
| Firefox 153.0 lint | `web-ext lint`                                     | manifest、权限、产物静态规则                                                                                                                               | 0 errors；1 条 Vue 生成 runtime warning，已登记风险 |

### Phase 3 权限生命周期子矩阵

| 场景                                    | Chrome           | Firefox               | 备注                                                             |
| --------------------------------------- | ---------------- | --------------------- | ---------------------------------------------------------------- |
| 授权前页面无 runtime marker             | 通过             | 通过                  | 不允许未授权页面执行                                             |
| 当前 origin 显式授权 + 当前页 bootstrap | 通过             | 通过                  | 保留非默认端口；注册两个固定脚本                                 |
| all-sites 显式授权                      | 通过             | 未单独执行            | Firefox 已覆盖 origin grant；`<all_urls>` 发布矩阵待补           |
| 用户拒绝授权                            | 通过（拒绝副本） | 浏览器 E2E 未单独执行 | 两端 application/port contract 均验证返回 `false` 后不 reconcile |
| 撤权、注销、页面重载后 absence          | 通过             | 通过                  | permission event 与显式 reconcile 串行化                         |
| restricted page                         | 通过             | 由浏览器能力矩阵补齐  | `chrome://`/商店/内置页只显示降级原因                            |

headless harness 的证据边界、内部 API 隔离和 headed 手工门禁见 [Phase 3 Exit Review](../09-reviews/phase-3-exit-review-2026-08-11.md) 与
`06-security/permission-inventory.md`；不能把 harness 结果写成原生确认框 UX 已完成。

## 2. 页面形态矩阵

| 页面形态               | Basic | Core | UI   | Security | 长稳 |
| ---------------------- | ----- | ---- | ---- | -------- | ---- |
| 单 video               | ✅    | ✅   | ✅   | ✅       | ✅   |
| 多 video/音频          | ✅    | ✅   | ✅   | ✅       | ✅   |
| 动态 SPA               | ✅    | ✅   | ✅   | ✅       | ✅   |
| open Shadow DOM        | ✅    | ✅   | ✅   | ✅       | ✅   |
| same-origin iframe     | ✅    | ✅   | Overlay 降级 | ✅       | ✅   |
| cross-origin iframe    | ✅    | ✅   | Overlay 降级 | ✅       | ✅   |
| 严格 CSP/Trusted Types | ✅    | ✅   | ✅   | ✅       | ✅   |
| 页面 Hook/恶意消息     | —     | —    | —    | ✅       | ✅   |
| 无媒体页面             | ✅    | —    | 状态 | ✅       | ✅   |

## 3. 站点支持等级

- Tier 0：通用 HTMLMediaElement；每次 PR 的 fixture 必过。
- Tier 1：高使用量/关键站点；有自动化 fixture、发布前 smoke 和 owner。
- Tier 2：有适配器和手工回归；问题按尽力支持处理。
- Tier 3：仅社区反馈或历史记录；不作为稳定版承诺。

## 4. 兼容性证据

每个矩阵单元至少记录：提交 SHA、扩展版本、浏览器版本、OS、页面 fixture/URL 类别、结果、失败日志 artifact、已知限制和复测日期。真实站点报告不得保存账号、完整媒体 URL 或用户内容。

Phase 4 当前证据补充：

- Chrome/Firefox production manifest 均为 required `storage`、`activeTab`、`scripting`，optional `<all_urls>`，
  `content_scripts: []`，无 required host permission 与 WAR。
- Chrome lifecycle E2E 固定单 worker，3 个场景通过；并行 persistent profile 会引入启动资源争抢和假性 timeout。
- 独立 5 秒 smoke 为 5051 ms、94 cycles、1 次 worker restart、listeners `4→4`；Phase 2 的 30 分钟结果仍是继承证据。
- Chrome/Firefox raw bundles：background 90150/90151 B、content 191669 B、page-main 77976 B；manifest guardrail 通过。
- Overlay 仅 top frame；same/cross-origin iframe runtime 通过，但 iframe-only media 的 Overlay 聚合未实现。
- fullscreen/PiP/capture/progress/cross-tab 的 domain、adapter、repository 与 runtime contract 已验证；真实解码帧截图、
  CORS blocked 截图、native→web fullscreen fallback、PiP unavailable、progress restore/complete、multi-tab advisory event
  和 iframe-only media Overlay 的专项浏览器矩阵仍待补。

## 5. 支持策略

若浏览器或站点变更导致能力下降：

1. 先确认 generic adapter 是否仍工作。
2. 按 `BUG-*` 记录最小复现和 Tier。
3. 能力不可用时在 UI 显示降级原因，不静默修改用户设置。
4. 对高频站点可发布 adapter hotfix；涉及权限/协议/数据则走完整 RC 门禁。

## 6. 当前支持声明

Phase 4 退出结论为“Preview 范围可进入 Phase 5 工程开发”。当前只承诺 Tier 0 通用
`HTMLMediaElement` 与固定 fixture 证据；不承诺 Tier 1（YouTube、Bilibili、Tencent Video、iQIYI、Youku）真实站点、
Firefox ESR/最低版本、Chrome previous stable、Edge 或 Stable 商店发布。任何对外文案必须与此边界一致。
