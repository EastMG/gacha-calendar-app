# 三端壳选型：为什么现在不锁定

## 状态

**Deferred（刻意延后）。** 用户明确选择"先只做可验证的共享层，三端壳以后定"。

本文件不是"待办"，而是**把决策所需的材料先备齐**：
调研已完成，条件一旦满足即可落地，不需要重新做一遍调研。

## 为什么要延后

1. **共享层的价值与壳无关。** `packages/*` 在两个候选方案里都能直接用，
   先把它做扎实，换壳不返工。
2. **壳是最贵的一次性决策。** 它决定构建环境（JDK / Xcode / DevEco；**iOS 侧不需要本地 Mac**，用 CI 的 macOS runner 构建，见 [`IOS-WITHOUT-MAC.md`](IOS-WITHOUT-MAC.md)）、
   通知实现、包体、上架路径，且迁移成本高。
3. **有一个必须先验证的硬风险**（见文末 PoC 清单第 1 条），
   在没验证前选型等于赌。

## 共享层对壳的要求（已收敛）

`gacha-calendar-core` 的宿主耦合面极小。壳必须提供：

| 能力 | 用途 | 备注 |
|---|---|---|
| **能设任意 header 的 HTTP** | 抓 28 个源站 | 含 `Referer` / `User-Agent`；**不需要** `headers.get()` / `arrayBuffer()` / `ReadableStream` |
| 异步 KV 存储 | 配置 + 缓存 | 值按原类型往返（`lastData` 是字符串里装 JSON） |
| `setTimeout` | core 内部超时 | 任何 JS 运行时都有 |
| 本地通知 | 新卡池 / 即将结束提醒 | 这类 App 的命门 |
| 全局 `URL` | core 里有 8 处 `new URL()` | Hermes 需要 polyfill（1 行） |
| `AbortController` | core 里有 1 处 | RN 自带 |

**关键结论：不需要任何服务端。** `fetchViaProxy` 的存在理由全是浏览器限制。

## 候选方案对比

调研时间 2026-10，事实基线（npm dist-tags / 官方文档）如下。

| 方案 | Android | iOS | HarmonyOS NEXT | 能否直接复用 JS core | 判定 |
|---|---|---|---|---|---|
| **React Native + RNOH** | ✅ 官方 | ✅ 官方 | ✅ 厂商级适配 | ✅ 导入即用 | **主方案** |
| **Capacitor 8 + 鸿蒙 hionic 壳** | ✅ 官方 | ✅ 官方 | ⚠️ 社区维护 | ✅ WebView 内零改 | **备选** |
| Tauri 2 | ✅ | ✅ | ⚠️ 社区移植，非官方 | ✅ WebView | 为一个 JS 核引入 Rust 工具链，不划算 |
| Flutter + OpenHarmony fork | ✅ | ✅ | ✅ | ❌ 要把 760KB 逻辑翻成 Dart | **排除**：等于重写 |
| uni-app / uni-app x | ✅ | ✅ | ✅（编译成 ArkTS） | ⚠️ 只能塞 WebView | 解决页面，不解决"现成 JS 核原样跑" |
| KMP / Compose Multiplatform | ✅ | ✅ | ✅（2026-09 首版） | ❌ 需自嵌 JS 引擎 | 技术可行、工程不划算 |
| 纯 PWA + 本地壳 | ⚠️ | ❌ 不进 App Store | ⚠️ 无官方分发 | ✅ | 不能作为三端交付 |
| ArkTS 原生 + WebView | — | — | ✅ | ✅ | 只能当鸿蒙兜底壳 |

### 为什么 RN + RNOH 是主方案

三端里有且只有它同时成立四件事：**厂商级投入 + JS 运行时 + 原生 UI + 原生通知**。

「零改动」具体是两行：

```js
// index.js
import "react-native-url-polyfill/auto";   // Hermes 缺 URL
// metro.config.js: resolver.sourceExts 加 'mjs'
```

### 两个必须写进 README 的版本陷阱

1. `@react-native-oh/react-native-harmony` 的 **`latest` dist-tag 指向 0.72.x**（陈旧）。
   必须显式装稳定线（`0.82-stable` 或 `0.84`），否则退回旧架构。
2. ohpm 原生包 `@rnoh/react-native-openharmony` **没有 dist-tag**，
   其版本号必须与 JS 包严格对齐。

> 落地前用 `npm view <pkg> dist-tags` 复核，不要照抄本文档里的具体版本号。

## 时区 / ICU（对两个候选的影响）

`packages/schedule` 已刻意**不依赖 `Intl`**，所以派生层在任何引擎上都对。但 core 内部仍在用
`Intl` 把源站墙钟转成绝对时刻 —— 若 ICU 缺失，core 在**挑选当期卡池**时可能选错（边界情况）。

- **RN + Hermes**：Android 走 ICU4J、iOS 走 Foundation，RN 的 iOS 构建脚本默认开 Intl；
  **鸿蒙 RNOH 侧是否启用未确认**，必须做启动自检 + shim 兜底。
- **Capacitor / WebView**：ArkWeb 基于 Chromium，自带 ICU4C 与全量 tzdata，无此问题。

## 落地前必须先做的 PoC（按风险排序）

1. **鸿蒙上的日期选择器与长列表。** 有实测反馈 uni-app x 在鸿蒙上
   `picker-view` 回调无响应、长列表白屏、FlexLayout 与 Web 表现不一致。
   日历类 App 重度依赖日期选择与 1000+ 条列表渲染 ——
   无论选哪个方案，都先做"鸿蒙跑通日期选择 + 1000 条列表"的 2 天验证。
2. **鸿蒙端 `Referer` 透传。** RN 内置 `fetch` 对 `Referer` 的行为未逐案验证；
   若不可控，改为自写 TurboModule 走原生 HTTP（工作量约 1 天）。
3. **真机时区自检。** 三端各设 `UTC` / `Asia/Tokyo` / `America/New_York`，
   `startAt`/`endAt` 必须与基准零误差。
4. **Hermes 解析性能。** 760KB 的 core 在无 JIT 的 Hermes 下可能比 V8 慢 2–5 倍。
   若真机首刷 > 3 秒，缓解手段：缓存优先渲染、预编译 `.hbc`，
   或改走备选（WebView 有 JIT）。
5. **包体与冷启动。** 华为应用市场拒因清单里有"冷启动 > 2 秒"，
   RN 基线包体也明显大于 WebView 壳。实测后再定。

## 决策触发条件

满足以下任一即建议启动壳的落地：

- 共享层完成 Phase 1（见 [`ROADMAP.md`](ROADMAP.md)），数据层不再频繁变动；
- 用户明确要"能在手机上用"的版本；
- 需要验证本地通知的产品价值（这是壳才能做的）。

## 如果现在就要选

- 想要**体验最好、愿投入构建环境**（JDK + Android SDK + DevEco；iOS 用 CI 的 macOS runner，本地无需 Mac）→ **RN + RNOH**
- 想要**最快上手、保真度优先、能接受 Web UI 与社区维护的鸿蒙层** → **Capacitor + hionic**
- 只想先看看手机上的效果，不做商店分发 → 直接用本仓库的浏览器预览装成 PWA

## 未确认事项

以下均标注为**未确认**，落地前需自行复核：

- RNOH 0.84 稳定 tag 是否已推公仓
- 鸿蒙 RNOH 侧 `Intl` 启用状态
- 鸿蒙 `reminderAgentManager` 的权限名与每日提醒配额
- 鸿蒙 PWA 的官方支持度
- 三端包体 / 冷启动实测数字（本文均为估算）
- `notifee` / `expo-notifications` 是否有未公开的鸿蒙适配
