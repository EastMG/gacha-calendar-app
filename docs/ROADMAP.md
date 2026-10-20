# Roadmap

## Phase 0 — 共享层地基 ✅ 已完成

- [x] 打通上游 `gacha-calendar-core`，验证移动端宿主契约（**不需要代理服务器**）
- [x] `packages/schedule`：展示串 → 结构化排期
  - 时区换算（零 `Intl`）、年份推断、跨年、`day`/`minute` 精度
  - 事件派生（含 `*Hover` 明细展开、去重）
  - 三段聚合、按天/按游戏分组、倒计时与相对时间格式化
  - 提醒计划（纯计算，壳无关）
- [x] `packages/core-bridge`：transport / storage / engine 门面
- [x] 108 个测试，含 43/43 逐字符往返自检、真实快照回归、28 条设计规范断言、12 条 PWA 断言
- [x] 浏览器预览（零框架、零打包器），四个视图跑真实数据
- [x] 三端官方设计规范 token（Apple HIG / Material 3 / HarmonyOS Design）
- [x] 文档：架构 / 数据模型 / 设计规范 / 选型 / 合规

## Phase 1 — PWA 上线 ✅ 已完成

- [x] `manifest.webmanifest` + 5 个尺寸图标（含 maskable，`tools/make-icons.py` 生成）
- [x] Service Worker：外壳预缓存 + 导航网络优先 + 数据文件网络优先 + 静态资源缓存优先
- [x] 静态产物构建（`tools/build-pwa.mjs`，零打包器，产物 52 个文件 / 约 1 MB）
- [x] **数据新鲜度方案**：浏览器受 CORS 约束 → 抓取放 CI。
      `GitHub Actions` 每 6 小时 `tools/refresh-data.mjs` 抓一轮 → 重新部署 Pages
- [x] GitHub Pages 部署（`https://eastmg.github.io/gacha-calendar-app/`）
- [x] 离线可用（断网重载实测通过）
- [ ] 浅色主题（三家规范都已查到，见 `docs/DESIGN.md` §七）
- [ ] 动态字体 / 无障碍缩放（iOS Dynamic Type、鸿蒙 fp）

## Phase 2 — 数据层收尾

- [ ] **明细事件的年份歧义**：`*Hover` 里的归档活动可能被推断成"今年"而显示为进行中。
      加"合理性窗口"（`now ± 45 天`）或让上游在明细里带年份。见 `docs/DATA-MODEL.md`。
- [ ] **接入 `selfCheck()`**：把"数据健康"页从"根据 Result JSON 推断"升级为"跑一次自检"，
      能区分「未配置来源」与「本期未公布」（当前 `Result JSON` 表达不了）。
- [ ] **配置持久化与设置项**：`hidden` / `order` / `customEntries` 的读写与 UI。
      键名照抄 `CORE_CONFIG_KEYS`，保证与桌面端 / 扩展端配置互通。
- [ ] **月历视图**：当前"日程"是按结束日分组的列表，需要真正的月历（周视图优先）。
- [ ] **跨端一致性校验**：用同一份快照在 Node 与浏览器里各算一遍，`JSON.stringify` 结果必须相同。

## Phase 3 — 壳 PoC 与选型落地

前置：先做 `docs/PLATFORM-DECISION.md` 里的 PoC 清单第 1 条
（**鸿蒙上跑通日期选择器 + 1000 条长列表**），再定壳。

- [ ] PoC：鸿蒙日期选择 + 长列表（2 天，决定 uni-app 系是否出局）
- [ ] PoC：鸿蒙 `Referer` 透传（决定是否必须自写 TurboModule）
- [ ] 选定壳，接入 `createAppEngine({ http, storage, now })`
- [ ] 三端时区自检（设备时区 `UTC` / `Asia/Tokyo` / `America/New_York` 零误差）
- [ ] 首刷性能实测（Hermes 无 JIT 的风险项）

## Phase 4 — 系统级能力（三端各自实现）

这是**这个产品真正的差异化**：日历类工具的价值一半在"不用打开就能看到"。
`packages/schedule` 已经把计算备好了（`bucket()` / `planReminders()`），
壳只需要把结果渲染进系统组件，**不需要任何服务端**。

### 4.1 桌面卡片 / 小组件（常驻展示"今天最紧急的是什么"）

| 平台 | 形态 | 技术 |
|---|---|---|
| iOS | 主屏小组件（小/中/大）+ 锁屏小组件 | WidgetKit |
| Android | 桌面小组件 | App Widgets（或 Jetpack Glance） |
| HarmonyOS | 服务卡片（桌面卡片 + 负一屏） | ArkTS 卡片（FormKit） |

- [ ] 抽 `packages/schedule` 里的「今日摘要」纯函数：`buildWidgetPayload(events, now)` →
      `{ endingSoon: 前3条, ongoingCount, nextStart }`，三端共用同一份输出
- [ ] iOS 小组件（iOS 17+ 交互式小组件，可直接"知道了"）
- [ ] Android 桌面小组件
- [ ] 鸿蒙服务卡片
- [ ] 卡片数据刷新策略：本地计算 + 壳触发刷新，**不依赖推送**

### 4.2 实时活动 / 实时状态（"正在进行"的倒计时常驻）

| 平台 | 形态 | 技术 | 备注 |
|---|---|---|---|
| iOS | **实时活动**（锁屏 + 灵动岛） | ActivityKit + Live Activity | 灵动岛是 iPhone 14 Pro 起的刘海交互区 |
| Android | 常驻通知 / Android 16 起的 **Live Updates** | 前台通知 + 通知 Live Update | 版本覆盖差异大，先做常驻通知 |
| HarmonyOS | **实况窗**（部分用户称"超级岛"） | 实况窗能力 | 与 iOS 灵动岛定位相近 |

- [ ] iOS 实时活动：卡池开始/结束前 N 小时自动起一个 Live Activity，锁屏倒计时
- [ ] iOS 灵动岛紧凑视图：只显示"剩 2 天"字号的最大化信息密度
- [ ] 鸿蒙实况窗（超级岛）
- [ ] Android 常驻通知（低版本兜底）
- [ ] 生命周期口径统一：什么条件下起、什么条件下自动结束（避免常驻烂尾）

> ⚠️ 依赖关系：4.1 / 4.2 **都必须等壳落地**（Phase 3）才能做，且都是各平台原生代码，
> 无法在共享层里解决 —— 共享层只负责算"显示什么"，不负责"怎么画"。

## Phase 5 — 产品化与上架

- [ ] 本地通知：把 `planReminders()` 结果注册为系统通知（三端各一套实现）
- [ ] 失败态 UI：`down` / `nomatch` / `stale` / `empty` 四态的完整呈现
- [ ] 冷启动优化（华为应用市场拒因：> 2 秒）
- [ ] 合规页面：关于页 + 免责声明 + 权利人下架通道（见 `docs/COMPLIANCE.md`）
- [ ] 上架顺序：华为应用市场 → Google Play → App Store

## Phase 6 — 鸿蒙元服务（与鸿蒙 App 一起规划）

**元服务（Atomic Service）是独立的形态**，不是 App 的一个功能：免安装、可从
服务中心/负一屏/卡片直达，适合"我只要看一眼今天有什么"的场景。

- [ ] **先决策**：鸿蒙侧最终用 ArkTS 原生还是 RN+RNOH
  - 若 ArkTS 原生 → **App + 元服务可以在同一个 DevEco 工程里按多模块做**（同仓合理）
  - 若 RN+RNOH → 元服务必须另起 ArkTS 工程（**另开仓库**，靠 npm 依赖共享层）
- [ ] 元服务资质与发布流程确认（华为对元服务有单独类目与审核）
- [ ] 元服务卡片：今天/本周两档
- [ ] 与 App 的配置互通（同一份 `hidden` / `order` 键）

> 详细取舍见 `docs/PLATFORM-DECISION.md`：元服务是四个"轻量端"里**唯一值得做**的，
> 因为服务卡片正好承载本产品的核心价值；微信/支付宝小程序与快应用已论证不做。

## 明确不做（已论证过）

- **自建推送服务器**：调研的 15 个同类开源项目里 0 个自建推送，全是本地通知 / ICS / IM Bot。
  自建推送要服务器、要备案、要处理卸载与静默，收益不高于本地通知。
- **微信 / 支付宝小程序、快应用**：见与 PWA 的取舍分析 —— 域名白名单 + 不能设 `Referer` +
  不能改 UA 三条叠加，**必须引入服务端中转**，与零运维定位冲突；且订阅消息撑不起提醒价值。
- **抽卡记录 / 概率计算**：直接踩判例红线的功能，见 `docs/COMPLIANCE.md`。
- **把 core 的抓取逻辑复制进本仓库**：会造出第二个真源，源站改版要修两处。
- **UI 层绑定框架**：壳未定，`packages/*` 保持零框架依赖。

## 可能的上游改进（提给 `dsh-gacha-calendar`）

这几项在移动端更有价值，但对桌面端也无害：

1. `listGames()` 暴露 `tz`（现在本仓库只能自己维护时区表）
2. `Result JSON` 能表达"该侧未配置来源"（现在只有 `selfCheck()` 知道）
3. `*Hover` 明细带年份或标注是否归档（消除年份推断的歧义）
4. 结构化时间戳输出（例如额外给 `startTs`/`endTs`），让所有宿主都不必解析字符串
