# 架构

## 设计要求

1. **不复制抓取逻辑。** 28 款游戏的来源注册表与解析器都在上游 `gacha-calendar-core`，
   本仓库只做适配与派生。
2. **不锁定 UI 框架。** 三端壳（RN / Capacitor / 原生 WebView / 鸿蒙 ArkTS）尚未选型
   （见 [`PLATFORM-DECISION.md`](PLATFORM-DECISION.md)），因此凡是长期资产都不能依赖框架。
3. **可验证。** 数据层的每条结论都要能在 Node 里跑出来，不靠"上真机看看"。

## 分层

```
apps/preview/                  浏览器预览（临时 UI，验证信息架构）
  ├─ main.ts                   状态机：装载 → 渲染 → 刷新
  ├─ views.ts                  今天 / 日程 / 游戏 / 数据健康
  ├─ http-browser.ts           走 /__gacha_proxy 的 HttpClient（仅浏览器需要）
  └─ ui.ts                     极简 DOM 构造器

packages/core-bridge/          core 的平台适配（不依赖框架）
  ├─ http.ts                   HttpClient 抽象 + 错误形状归一 + 超时
  ├─ transport.ts              core 需要的 fetchRaw / fetchViaProxy
  ├─ storage.ts                内存 / localStorage 两种实现
  ├─ fetch-client.ts           通用 fetch 版 HttpClient（Node / 真机可用）
  └─ engine.ts                 createAppEngine({ http, storage, now })

packages/schedule/             ★ 本仓库的核心增量（零依赖、零 Intl）
  ├─ timezone.ts               时区表 + 固定偏移换算
  ├─ parse-window.ts           展示串 → 绝对时刻区间
  ├─ events.ts                 Result JSON + 元数据 → 扁平事件
  ├─ bucket.ts                 三段聚合 / 按天分组
  ├─ format.ts                 倒计时 / 相对时间 / 时区标签
  └─ reminders.ts              提醒计划（纯计算）
```

平台差异**只出现在最上层**：三端壳要实现的东西就是

```ts
createAppEngine({
  http:    (req) => myNativeHttp(req),  // 能设任意 header 的请求器
  storage: myKeyValueStore,             // 异步 KV
  now:     () => Date.now()             // 可省略
});
```

## 数据流

```
core.refresh()
   ↓  Result JSON（28 款，字段全是"给人看的字符串"）
toEvents(result, metas, nowMs)
   ↓  ScheduleEvent[]（绝对时刻 + 精度 + 时区 + 失败态）
   ├─ bucket()        → 即将结束 / 进行中 / 即将开启
   ├─ groupByDay()    → 按天分组
   └─ planReminders() → Reminder[]（壳注册成本地通知）
   ↓
UI / 本地通知
```

关键点：**UI 只读 `ScheduleEvent`，不自己解析日期字符串**。
解析逻辑集中在一处，错一次就全错、修一次就全修。

## transport 契约（最容易静默失败的地方）

core 只调用两个方法：

```ts
fetchRaw(url, { signal, headers })              → { ok, status, text(), json() }
fetchViaProxy(url, { referer, headers, body })  → 目标站【原始 body 字符串】
```

**五条硬约束**（违反任何一条都不会报错，只会让游戏静默变成"抓取异常"）：

| # | 约束 | 原因 |
|---|---|---|
| 1 | `fetchViaProxy` 必须返回**字符串** | 返回对象不会报契约错误，只会让每款游戏都失败 |
| 2 | 默认带 `Referer` | bwiki 全系缺 Referer 时回 HTTP 567（WAF 挑战页，不是 JSON） |
| 3 | 默认桌面 UA，**允许覆盖** | wiki.gg 明确拦浏览器 UA，需要换非浏览器串 |
| 4 | 非 2xx 抛 `http-<code>` | core 的 `normErr` 靠这个形状把 403/567 如实显示给用户 |
| 5 | 保留 URL 里的 `origin=*` 等查询参数 | MediaWiki 系接口不带会 403，不能"清理"URL |

错误形状直接决定用户看到什么文案：

| 抛出的错误 | core 归一后的文案 |
|---|---|
| `AbortError` / 含 `abort` | 超时 |
| `http-403` / `proxy-http-403` | HTTP 403 |
| `bad-json` | 响应格式异常 |
| 含 `network error` 等 | 网络不通 |
| 其它 | 抓取异常（**信息量为零**，所以要避免） |

超时与体积上限由适配层自己实现（15s / 8MB），不指望 transport 的 `signal` 一定被尊重。

## storage 契约（会静默丢缓存）

core 的 `lastData` **本身就是一段 JSON 字符串**。若适配层再套一层字符串化，
`getCached()` 会解析失败并回落到空缓存 —— 表现是"每次打开都要重抓、看不到上次内容"，但**不报错**。

`packages/core-bridge/src/storage.ts` 用 `JSON.stringify/parse` 的**类型保真往返**解决：
对 JSON 安全值往返后与原值全等，所以"字符串里装 JSON"也能原样还原。已有测试守住。

配置键共 15 个（`order` / `hidden` / `shown` / `removed` / `customEntries` / `customUrls` /
`customEventUrls` / `gameColors` / `autoRefresh` / `refreshMinutes` / `newPanel` /
`lastData` / `lastRefresh` / `lastSource` / `lastVersion`），见 `CORE_CONFIG_KEYS`。
**新壳接入时照抄键名**，否则用户在其它端的排序/隐藏配置不会跟过来。

## 为什么没有打包器

三端壳未定，UI 层是暂时的，为它引入 bundler 是负资产。当前做法：

- `tsc` 把 TS 编到 `build/`（`rewriteRelativeImportExtensions` 把 import 里的 `.ts` 改写成 `.js`）
- 浏览器用原生 ESM + **import map** 把 `gacha-calendar-core` 指向 `/vendor/core.mjs`
- `tools/preview-server.mjs` 用 `node:http` 托管静态资源与开发代理

好处：`npm run dev` 在任何机器上都不依赖构建链；坏处：没有 HMR。
等壳定下来后，UI 构建交给那个壳自己（RN 用 Metro，Capacitor 用任意 bundler），
`packages/*` 不受影响。

## 新增一个平台壳的清单

1. 实现 `HttpClient`：`(req: HttpRequest) => Promise<{ status, text }>`
   - 必须能设任意 header（含 `Referer` / `User-Agent`）
   - 要尊重传入的 `signal`
2. 实现 `KVStorage`：异步 `get(key)` / `set(key, value)`，**值按原类型往返**
3. 调 `createAppEngine({ http, storage, now })`
4. 订阅 `engine.listGames()` / `getCached()` / `refresh()` / `selfCheck()`
5. 把 `planReminders()` 的结果注册成本地通知
6. 跑一遍真机时区自检：设备时区分别设 `UTC` / `Asia/Tokyo` / `America/New_York`，
   `startAt`/`endAt` 必须与基准零误差（`packages/schedule` 不碰系统时区，理论上必然通过，
   但要防壳层自己引入了 `new Date(y, m, d)` 之类的东西）
