# Roadmap

## Phase 0 — 共享层地基 ✅ 已完成

- [x] 打通上游 `gacha-calendar-core`，验证移动端宿主契约（**不需要代理服务器**）
- [x] `packages/schedule`：展示串 → 结构化排期
  - 时区换算（零 `Intl`）、年份推断、跨年、`day`/`minute` 精度
  - 事件派生（含 `*Hover` 明细展开、去重）
  - 三段聚合、按天/按游戏分组、倒计时与相对时间格式化
  - 提醒计划（纯计算，壳无关）
- [x] `packages/core-bridge`：transport / storage / engine 门面
- [x] 68 个测试，含 43/43 逐字符往返自检与真实快照回归
- [x] 浏览器预览（零框架、零打包器），四个视图跑真实数据
- [x] 文档：架构 / 数据模型 / 选型 / 合规

## Phase 1 — 数据层收尾（下一步，不需要壳）

- [ ] **明细事件的年份歧义**：`*Hover` 里的归档活动可能被推断成"今年"而显示为进行中。
      加"合理性窗口"（`now ± 45 天`）或让上游在明细里带年份。见 `docs/DATA-MODEL.md`。
- [ ] **接入 `selfCheck()`**：把"数据健康"页从"根据 Result JSON 推断"升级为"跑一次自检"，
      能区分「未配置来源」与「本期未公布」（当前 `Result JSON` 表达不了）。
- [ ] **配置持久化与设置项**：`hidden` / `order` / `customEntries` 的读写与 UI。
      键名照抄 `CORE_CONFIG_KEYS`，保证与桌面端 / 扩展端配置互通。
- [ ] **月历视图**：当前"日程"是按结束日分组的列表，需要真正的月历（周视图优先）。
- [ ] **跨端一致性校验**：用同一份快照在 Node 与浏览器里各算一遍，`JSON.stringify` 结果必须相同。

## Phase 2 — 壳 PoC 与选型落地

前置：先做 `docs/PLATFORM-DECISION.md` 里的 PoC 清单第 1 条
（**鸿蒙上跑通日期选择器 + 1000 条长列表**），再定壳。

- [ ] PoC：鸿蒙日期选择 + 长列表（2 天，决定 uni-app 系是否出局）
- [ ] PoC：鸿蒙 `Referer` 透传（决定是否必须自写 TurboModule）
- [ ] 选定壳，接入 `createAppEngine({ http, storage, now })`
- [ ] 三端时区自检（设备时区 `UTC` / `Asia/Tokyo` / `America/New_York` 零误差）
- [ ] 首刷性能实测（Hermes 无 JIT 的风险项）

## Phase 3 — 产品化与上架

- [ ] 本地通知：把 `planReminders()` 结果注册为系统通知（三端各一套实现）
- [ ] 失败态 UI：`down` / `nomatch` / `stale` / `empty` 四态的完整呈现
- [ ] 冷启动优化（华为应用市场拒因：> 2 秒）
- [ ] 合规页面：关于页 + 免责声明 + 权利人下架通道（见 `docs/COMPLIANCE.md`）
- [ ] 上架顺序：华为应用市场 → Google Play → App Store

## 明确不做（已论证过）

- **自建推送服务器**：调研的 15 个同类开源项目里 0 个自建推送，全是本地通知 / ICS / IM Bot。
  自建推送要服务器、要备案、要处理卸载与静默，收益不高于本地通知。
- **抽卡记录 / 概率计算**：直接踩判例红线的功能，见 `docs/COMPLIANCE.md`。
- **把 core 的抓取逻辑复制进本仓库**：会造出第二个真源，源站改版要修两处。
- **UI 层绑定框架**：壳未定，`packages/*` 保持零框架依赖。

## 可能的上游改进（提给 `dsh-gacha-calendar`）

这几项在移动端更有价值，但对桌面端也无害：

1. `listGames()` 暴露 `tz`（现在本仓库只能自己维护时区表）
2. `Result JSON` 能表达"该侧未配置来源"（现在只有 `selfCheck()` 知道）
3. `*Hover` 明细带年份或标注是否归档（消除年份推断的歧义）
4. 结构化时间戳输出（例如额外给 `startTs`/`endTs`），让所有宿主都不必解析字符串
