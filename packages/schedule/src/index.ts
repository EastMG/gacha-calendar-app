/**
 * `@gacha/schedule` —— 排期派生层。
 *
 * 职责单一：把 `gacha-calendar-core` 输出的**展示串**变成
 * **可排序、可倒计时、可提醒的结构化事件**。
 *
 * 三条硬约束（改了会出隐蔽 bug）：
 *  1. 不依赖 `Intl` / ICU —— 全部用固定偏移整数运算（见 `timezone.ts` 顶部说明）。
 *  2. 不读系统时钟 —— "现在"一律显式传 `nowMs`，测试可完全复现。
 *  3. 不编造精度 —— 只知道日期的事件标 `precision: "day"`，绝不显示到分钟。
 */
export * from "./timezone.ts";
export * from "./parse-window.ts";
export * from "./events.ts";
export * from "./bucket.ts";
export * from "./format.ts";
export * from "./reminders.ts";
