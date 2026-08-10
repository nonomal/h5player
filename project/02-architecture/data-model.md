# 数据模型与迁移契约

> 文档 ID：ARCH-005  
> 状态：Approved / V1 Implemented  
> 负责人：Data/Architecture Owner  
> 最后更新：2026-08-10  
> 关联：ADR-0003、FR-CONFIG-001..006、NFR-REL-004

## 1. 数据分类与权威

| 数据类 | 示例 | 权威上下文 | 默认持久化 | 生命周期 |
| --- | --- | --- | --- | --- |
| Global settings | enable、hotkeys、UI 默认值 | background repository | `storage.local` | 用户清除/卸载 |
| Site overrides | origin/site enabled、站点能力开关 | background repository | `storage.local` | 用户清除/站点删除 |
| Progress | media identity、position、updatedAt | background repository | `storage.local` | 可选、按 TTL 清理 |
| Session snapshot | frame/media/active 状态 | content/page-main | 内存 | frame/page 生命周期 |
| Migration metadata | schemaVersion、backup ID | background repository | `storage.local` | 保留当前与最近备份 |
| Diagnostics | 限量事件 ring buffer | 各 runtime | 内存/可选 local | 用户导出或容量淘汰 |

页面 `localStorage`、sessionStorage 和全局变量不能作为新扩展配置权威。若为站点行为必须使用页面存储，需单独列为 adapter capability，并禁止与扩展设置同名竞争。

## 2. 持久化包络

所有扩展仓储使用带版本的命名空间：

```ts
interface PersistedEnvelope<T> {
  schema: 'h5player.web-extension'
  schemaVersion: number
  revision: number
  updatedAt: number
  data: T
}

interface SettingsStoreV1 {
  global: GlobalSettingsV1
  sites: Record<SiteId, SiteOverrideV1>
  progress: Record<ProgressId, ProgressRecordV1>
}
```

`revision` 用于乐观并发控制；`updatedAt` 只作排序/诊断，不作安全凭据。未知顶层字段不能静默执行，允许保留到备份但不进入业务对象。

## 3. GlobalSettingsV1 草案

```ts
interface GlobalSettingsV1 {
  enabled: boolean
  ui: {
    overlayEnabled: boolean
    theme: 'system' | 'light' | 'dark'
    locale: 'zh-CN' | 'en-US'
  }
  hotkeys: {
    enabled: boolean
    scope: 'page' | 'player'
    bindings: Record<string, { commandId: string; disabled: boolean }>
  }
  media: {
    defaultPlaybackRate: number
    defaultVolume: number
    restoreProgress: boolean
  }
  policies: {
    protectPlaybackRate: boolean
    protectCurrentTime: boolean
    protectVolume: boolean
    allowExperimental: boolean
  }
  diagnostics: {
    localLogLevel: 'error' | 'warn' | 'info' | 'debug'
    retainProgressDays: number
  }
}
```

约束示例：

- `defaultPlaybackRate` 建议 `[0.1, 16]`，实际站点能力可更窄。
- `defaultVolume` 为 `[0, 1]`。
- `retainProgressDays` 有上限，`0` 表示不保存。
- command ID 必须来自注册表，未知 ID 导入时标记错误而不执行。

## 4. Site identity 与进度 identity

### 4.1 SiteId

使用规范化结构而不是裸 `location.host`：

```ts
interface SiteId {
  origin: string
  hostname: string
  includePath?: string
}
```

规范化规则：小写 hostname、去除默认端口、只允许 `http/https`、不保存 query/fragment；若站点需要路径区分，使用受控 include pattern 并限制长度。

### 4.2 ProgressId

```ts
interface ProgressRecordV1 {
  site: string
  mediaKey: string
  positionSeconds: number
  durationSeconds: number | null
  titleHint?: string
  updatedAt: number
  expiresAt: number
}
```

`mediaKey` 优先使用页面提供的稳定内容 ID；没有稳定 ID 时使用去敏的 URL/path hash，不保存完整源地址。`titleHint` 默认不写入，若启用必须在诊断/隐私文案中说明。

## 5. 读写与并发

- 所有 mutation 以 `expectedRevision` 或事务 API 提交。
- 冲突时进行字段级合并；同一字段采用 latest revision 或用户可见冲突提示，不能整包覆盖。
- 写入顺序：校验 → 计算迁移/合并 → 写备份（必要时）→ 写新 envelope → 发布变更事件。
- 事件包含 key、revision、changedPaths 和 source，不包含完整数据。
- 订阅者断线后通过 revision 重新拉取 snapshot，不依赖事件必达。

## 6. Schema migration

迁移函数必须是纯函数或显式接受 `Clock/Logger` 的可测试函数：

```ts
type Migration = (input: unknown) => Result<unknown, MigrationError>

const migrations: Record<number, Migration> = {
  1: migrateV0ToV1,
  2: migrateV1ToV2,
}
```

规则：

1. 只允许向前逐版本迁移；不在运行时猜测旧字段含义。
2. 迁移前保存原 envelope 的校验和和备份 ID。
3. 每个迁移有 golden fixtures、边界/损坏测试和逆向恢复演练。
4. 迁移失败保留原数据，使用安全默认启动，并在 options 显示恢复入口。
5. 删除字段要经过至少一个 minor 版本的弃用期；无法读取的未来版本不得覆盖。

## 7. Legacy 导入格式

Legacy 导入使用独立文件格式：

```ts
interface LegacyImportFile {
  format: 'h5player.legacy-export'
  formatVersion: 1
  exportedAt: string
  sourceVersion?: string
  global?: unknown
  sites?: unknown
}
```

导入流程：选择文件 → 大小/JSON 解析 → Schema 校验 → 字段映射预览 → 用户确认 → 备份当前设置 → 原子写入 → 输出迁移报告。

自动拒绝：函数、脚本字符串、远程 URL、未知权限、DOM/Window 对象、超出范围的数值和不可识别站点规则。

## 8. 清除、卸载与隐私

- options 提供按类别清除：设置、站点规则、进度、诊断、迁移备份。
- 清除操作显示影响范围并支持短时撤销（若实现成本允许）；至少在操作前备份可恢复数据。
- 卸载前无法可靠执行 UI 确认时，不新增外部清理请求；保留浏览器标准卸载行为，并在文档说明用户如何清除站点 localStorage（若旧数据存在）。
- 不把密码、token、cookie、完整观看历史或付费媒体信息写入扩展存储。

## 9. 数据模型验收

- 所有持久化对象能由 Schema 解析，且静态类型从同一模型生成/维护。
- N、N-1、空、未知字段、损坏 JSON、超大导入和并发冲突测试通过。
- service worker 重启、浏览器升级和发布回滚不会丢失已确认配置。
- 诊断导出和日志测试确认敏感字段被移除。

## 10. Phase 1 实现记录

- Schema 与静态类型事实源：`web-extension/src/domain/settings/schema.ts`。
- 默认值、字段级合并和优先级：`defaults.ts`、`merge.ts`、`resolve.ts`。
- V0→V1 migration、checksum 与 repository：`src/infrastructure/storage/`。
- `revision` 冲突采用 background 队列中的 field patch rebase；无变化不增加 revision。
- 当前保存最近一次 migration/corrupt/import/rollback backup；多代备份保留策略可在真实升级需求出现后扩展。
- `storage.local` 是当前唯一权威；`storage.sync` 白名单仍由 DECISION-005 在 Phase 3 前定案。
- 端侧证据包含实际终止 Chromium service worker 后重新打开 Popup，并恢复 revision 与设置。
