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
- [ ] **iOS 构建链路**：GitHub Actions `macos-latest` + 签名 + TestFlight，
      验证"本地没有 Mac 也能出包上测试"。playbook 见 [`IOS-WITHOUT-MAC.md`](IOS-WITHOUT-MAC.md)
      —— 这条可以先于壳落地就搭，因为它只依赖工程结构，不依赖业务代码

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

## Phase 7 — Android 电视端（大陆 AOSP 盒子 / 智能电视）

### 先划清平台边界（这一步很关键）

| | 是 | 不是 |
|---|---|---|
| 系统 | **大陆生态的 AOSP Android**：小米/当贝/海信/TCL/创维/华为智慧屏的 Android 兼容层 | ❌ Google **Android TV** |
| 服务 | 无 GMS、无 Play Services、无 Play 商店 | ❌ 经过 TV 认证、跑 Leanback 启动器 |
| 分发 | 当贝市场 / 沙发管家 / 厂商应用商店 / ADB 侧载 / U 盘 | ❌ Google Play |
| 规范 | **没有官方设计规范**（大陆盒子没有统一设计文档） | ❌ Google 的 TV Design Guidelines |

**为什么这个区分决定架构**：不能用 Play Services 的任何能力、不能假设 Leanback 启动器存在、
不能假设 Play 审核流程；遥控器键位各家不一致（语音键尤其不可依赖）。

### 与手机端的三条根本差异

1. **没有触摸 → 一切靠焦点系统。** 这不是"把字号调大"，是整块交互模型重写：
   每个可交互元素要 `focusable` + **自绘可见焦点环**，要有焦点图（focus graph）防止跑飞。
2. **10-foot UI → 信息密度要反过来降。** 手机一屏 6 张卡，TV 上一屏应是 2–3 组横排卡片行。
   三米外看，宁可少显示也不要小字。
3. **没有官方规范 → 参数只能是工程决定。** 不像手机三端能抄 Apple/Material/鸿蒙，
   大陆盒子无设计文档；参考 Android TV 的 10-foot 原则 + 实测，按 `docs/DESIGN.md` 的规矩
   **必须标注为「工程决定」，不能写成"某家规范要求"**。

### 技术路径（与 Phase 3 的壳决策联动）

- 若 Android 手机端最终选 **RN** → TV 端尽量复用同一份 RN 代码，但有两道坎：
  1. **`minSdk` 是硬门槛。** RN 新版 `minSdk` 已在 24（Android 7.0）以上，
     社区还在往 27 推（[react-native#55726](https://github.com/react/react-native/pull/55726)）。
     这意味着**很多老盒子根本装不上**。立项第一件事是拿目标机型的系统版本分布倒推 `minSdk`，
     再决定还用不用 RN —— 不是先选框架再想兼容。
  2. **D-pad 焦点要自己做。** RN 在 Android 上能跑，但 TV 的焦点系统原生 RN 不处理。
     可参考官方维护的 TV 分支 [`react-native-tvos`](https://www.npmjs.com/package/react-native-tvos)
     （跟到 RN 0.83 / 0.86 线），它主要面向 Apple TV / Android TV，但焦点相关做法可借用。
- 若手机端不走 RN → TV 端直接**原生 Android（View / Compose）**。
  `androidx.leanback` 属于 Jetpack，**不依赖 GMS**，在 AOSP 盒子上可用
  （但它遵循的是 Google TV 的视觉规范，要不要用是产品选择，不是技术限制）。
  此时 `packages/schedule` 需要桥接（QuickJS / J2V8 嵌 JS）或重写为 Kotlin。
- **不建议为 TV 单独引入第三套技术栈** —— 它是 4 个目标里用户量预期最小的一个。

### 要做的事

**焦点系统（工作量主体）**
- [ ] 所有可交互元素 `focusable` + 自绘焦点环（不能只靠系统默认，TV 上默认态常看不清）
- [ ] 焦点图：左侧导航 ⇄ 右侧横排；行内左右滚动；行间上下切换，不跑飞
- [ ] 滚动跟随焦点（`bringIntoView`），横向行内滚动带动整行
- [ ] `KEYCODE_BACK` 逐级返回（详情 → 列表 → 退出确认）
- [ ] 长按 OK 的语义（展开明细 / 进详情），短按与长按不能冲突
- [ ] 切页返回时**恢复上次焦点位置**（TV 上焦点丢失的体验极差）
- [ ] 详情用全屏页或侧滑面板，**不能依赖 hover**（TV 无悬停态）

**布局与可读性**
- [ ] 左侧竖向导航（今天 / 日程 / 游戏 / 数据）+ 右侧横排卡片行
- [ ] 卡片改成"大标题 + 大倒计时 + 少量信息"，手机端的明细行在 TV 上进详情页再看
- [ ] 安全区：电视会裁边（overscan），内容留边距。**参考值 5%，实际按目标机型实测**
- [ ] 1080p / 4K 两种分辨率下都不裁边、字号都够看

**键位（各家不一致，需实测）**
| 键 | 语义 |
|---|---|
| `DPAD_UP/DOWN/LEFT/RIGHT` | 焦点移动 |
| `DPAD_CENTER` / `ENTER` | 确认 |
| `BACK` | 返回 / 退出 |
| `MENU` | 部分盒子有，可选支持 |
| 语音键 | **不可依赖**，各家映射不同 |

**性能与兼容**
- [ ] 定 minSdk（决定能覆盖多少老盒子），需先核实目标机型系统版本分布
- [ ] 低端盒子（1–2 GB RAM、Amlogic/Allwinner 之流）实测：760 KB core 的解析开销、
      28 款并发请求、横排列表滚动是否掉帧
- [ ] 建议 TV 端**缓存优先 + 手动刷新**，不做后台自动抓取（低功耗设备 + 用户预期）

**数据（和 PWA 不同，这里能实时抓）**
- TV 端是原生 App → 走原生 HTTP，**没有 CORS**，所以能像手机一样直连 28 个源站，
  **不需要** PWA 那套"CI 抓取 + 重新部署"的方案。别把两者搞混。

**分发**
- [ ] 当贝市场 / 沙发管家 / 厂商应用商店的上架要求（部分要软著、部分要企业资质）
- [ ] ADB / U 盘侧载路径（开发期主力）
- [ ] 电视端对"第三方内容"的审核口径比手机更敏感，见 `docs/COMPLIANCE.md`

**验收清单（只用遥控器）**
- [ ] 无触摸依赖：没有只能在 hover 下出现的信息、没有 swipe 手势
- [ ] 焦点永不丢失、不跑飞；返回永远回到来的地方
- [ ] 冷启动 < 2 秒（低端盒子）
- [ ] 1 分钟不操作后，界面不做无意义的重绘（省电、防烧屏）

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
