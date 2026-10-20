# 没有 Mac，iOS 目标能推进到哪一步？

**结论：能推进约 70%，最后一段（真机调试 + 上架迭代）需要 macOS 或租云 Mac，但不需要你自己买一台。**

先说清楚边界，再说替代方案。

## 一、硬限制只有一个：Xcode 只能跑在 macOS 上

编译 Swift / Objective-C、打出 `.app` / `.ipa`，必须用 Xcode 工具链。
Apple 没有提供 Windows 或 Linux 版，也没有官方替代。**这条绕不过去。**

但"必须用 Xcode"**不等于**"必须有一台 Mac 放在你桌上"——Xcode 可以在别人的 macOS 上跑。

## 二、不需要 Mac 就能做的（现在这部分占大头）

| 工作 | 怎么做 | 状态 |
|---|---|---|
| 业务逻辑、时区/排期计算 | `packages/schedule`、`packages/core-bridge` 纯 TS，零平台依赖 | ✅ 已完成 |
| UI 设计与三端规范对齐 | 浏览器预览 + `design.ts` token，iOS 那套已在预览里跑 | ✅ 已完成 |
| 信息架构验证 | PWA 在真 iPhone 上直接打开验证 | ✅ 已完成 |
| iOS 工程配置（Info.plist / 权限文案 / 深链 / 图标） | 都是文本文件，手写或用脚本生成 | 可行 |
| 代码签名（证书 + 描述文件） | App Store Connect API 创建；`rcodesign`（Rust 的 `apple-codesign`）可在 Windows/Linux 签名 | 可行但繁琐 |
| 打出可上架的 ipa | **云端 macOS**：GitHub Actions `macos-latest` runner | 可行 |
| 上传 TestFlight / App Store | EAS Submit、fastlane `pilot`（走 Java 写的 iTMSTransporter，跨平台）、App Store Connect API | 可行 |
| App Store 审核截图 | CI 里用模拟器截图，产物当 artifact 下载 | 可行 |
| Apple Developer 账号注册 | 网页 + iPhone 上的 Apple Developer app，年费 $99，全程不碰 Mac | 可行 |

> 也就是说：**"写代码 → 云端构建 → 签名 → 传 TestFlight"这条链路，Windows 完全可以走通。**

## 三、真正需要 Mac 或真机的（最后一段）

| 工作 | 为什么躲不掉 |
|---|---|
| **Live Activity / 灵动岛 / WidgetKit** | 必须 Swift + Xcode 工程 + 真机或模拟器验证。浏览器里没有对应物，**无法在预览里验证** |
| 真机崩溃调试 | CI 日志 + TestFlight 反馈能凑合，但效率很低 |
| Liquid Glass / 安全区 / 键盘 / 手势等系统行为 | 只有真机或模拟器能看准 |
| App Store 被拒后的迭代 | 需要反复构建-提审，有 Mac 会快很多 |

**这正是我在 `ROADMAP.md` Phase 4 里把"实时活动 / 灵动岛"标成依赖壳的原因** ——
它是 iOS 上最有价值的功能，也恰好是最离不开 Mac 的部分。

## 四、三条可行路径 + 成本

| 方式 | 成本 | 适合 |
|---|---|---|
| **GitHub Actions `macos-latest`** | public 仓库有免费额度（具体以 GitHub 当前政策为准） | 日常构建、出 TestFlight。**首选** |
| **EAS Build**（Expo 云构建） | 有免费额度，付费档更宽 | 如果壳选 RN/Expo —— 连证书都托管，最省心 |
| 租云 Mac（MacinCloud / AWS EC2 Mac / Scaleway） | 约 $1/小时；AWS 的 `mac2.metal` 有 24h 最短计费 | 偶尔深度调试、改原生工程 |
| 买二手 Mac mini（M1） | 约 ¥2000 | 长期要频繁做 iOS 时反而最省 |

**建议路线**：先不花钱 —— CI 构建 + 租云 Mac 按小时调试；真的到了每周都要改 iOS 原生代码，再考虑二手 mini。

## 五、还有一条被忽略的路：iOS 上的 PWA

如果"iOS 目标"的本质是**让 iPhone 用户能用上**，而不是"必须上架 App Store"，
那么现在这条已经通了，**零 Mac、零 $99**：

- iOS Safari「添加到主屏幕」→ 以独立窗口运行，我们的 PWA 已支持（`apple-mobile-web-app-capable`）
- **iOS 16.4 起，主屏 Web App 支持 Web Push**
  （[Apple 开发者论坛讨论](https://developer.apple.com/forums/thread/732594)）
  → 意味着"卡池快结束"的提醒在 iOS 上也能推送，**不需要上架**

代价：
- Web Push 需要一个**推送服务端**持有 VAPID 密钥并定时检查。
  可以与现有 CI 方案合并：GitHub Actions 定时检查 → 调推送接口。
  但订阅信息得有地方存（这个项目目前刻意零服务端，要做就得接受一个轻量后端或第三方推送服务）。
- iOS 上 Web Push 要求用户先"添加到主屏幕"，且后台行为受系统节流，**不如本地通知可靠**。

**所以它是"能用"，不是"体验好"。** 真要好的提醒体验，还是得有原生 App。

## 六、我的建议

1. **不要因为没 Mac 就把 iOS 押后到"以后有设备再说"** —— 那样永远等不到。
   正确做法是：**代码按跨端写、构建交给 CI**，本地一台 Mac 都不需要。
2. **但也别现在就让 iOS 当第一优先级。** 从产品看它优先级最低：
   - 你的目标用户以大陆为主，iOS 占比低于 Android / 鸿蒙；
   - App Store 对"抓第三方游戏数据"的审核最严（5.2.2 第三方内容 / 4.2 最低功能，
     见 [`COMPLIANCE.md`](COMPLIANCE.md)），是最容易反复被拒的一端。
3. **推荐顺序**：PWA（已有）→ Android / 鸿蒙 → 最后 iOS。
   等到要上 iOS 时，用 CI 构建 + 按小时租云 Mac 调试，成本远低于买设备。

## 七、待核实（落地前要确认）

- GitHub Actions 的 macOS runner 对 **public 仓库**的免费额度细节（分钟数 / 是否计 10 倍）
- EAS Build 在你最终选的壳上是否可用（RN/Expo 可以；Capacitor 需走自己的 CI）
- `rcodesign` 对 **IPA 重签名**的完整支持程度（能签，但描述文件/entitlements 的组合比较折腾）
- iOS 上 Web Push 的配额与后台投递可靠性（各版本行为有差异）
