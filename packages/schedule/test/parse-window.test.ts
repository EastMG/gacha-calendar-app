import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatWindow,
  normalizeDateText,
  parseWindow,
  parseWindowDetailed,
  TZ_CN,
  TZ_JP,
  TZ_UTC,
  wallToInstant
} from "../src/index.ts";

/** 固定"现在"：2026-10-20 18:00 北京时间 —— 让所有断言与真实时钟无关 */
const NOW = wallToInstant(2026, 10, 20, 18, 0, TZ_CN);

describe("parseWindow —— 归一化展示串（无年份）", () => {
  it("解析国服常见的 MM-DD HH:mm 区间", () => {
    const w = parseWindow("10-13 18:00 ~ 11-03 14:59", TZ_CN, NOW);
    assert.notEqual(w, null);
    assert.equal(w!.startAt, wallToInstant(2026, 10, 13, 18, 0, TZ_CN));
    assert.equal(w!.endAt, wallToInstant(2026, 11, 3, 14, 59, TZ_CN));
    assert.equal(w!.precision, "minute");
  });

  it("年份推断取离 now 最近的一年", () => {
    // 12-28 距 NOW（10-20）69 天，2025-12-28 则已过去近一年 → 应选 2026
    const w = parseWindow("12-28 10:00 ~ 12-31 23:59", TZ_CN, NOW);
    assert.equal(w!.startAt, wallToInstant(2026, 12, 28, 10, 0, TZ_CN));
  });

  it("跨年区间：结束早于开始时结束推到下一年", () => {
    const now = wallToInstant(2026, 12, 30, 0, 0, TZ_CN);
    const w = parseWindow("12-28 00:00 ~ 01-05 23:59", TZ_CN, now);
    assert.equal(w!.startAt, wallToInstant(2026, 12, 28, 0, 0, TZ_CN));
    assert.equal(w!.endAt, wallToInstant(2027, 1, 5, 23, 59, TZ_CN));
  });

  it("支持 ～ 全角分隔符与 / 日期写法", () => {
    const w = parseWindow("10/13 12:00 ～ 10/26 11:59", TZ_JP, NOW);
    assert.equal(w!.startAt, wallToInstant(2026, 10, 13, 12, 0, TZ_JP));
    assert.equal(w!.endAt, wallToInstant(2026, 10, 26, 11, 59, TZ_JP));
    assert.equal(w!.precision, "minute");
  });

  it("只给日期时降级为 day 精度（不许倒计时到分钟）", () => {
    const w = parseWindow("10-13 ~ 11-03", TZ_CN, NOW);
    assert.equal(w!.precision, "day");
  });

  it("源站中文原文：带年份 + 「版本更新后」，起始侧无时刻 → day 精度", () => {
    const raw = "2026年10月13日 版本更新后~2026年11月3日 08:59";
    const w = parseWindow(raw, TZ_CN, NOW);
    assert.notEqual(w, null);
    assert.equal(w!.startAt, wallToInstant(2026, 10, 13, 0, 0, TZ_CN));
    assert.equal(w!.endAt, wallToInstant(2026, 11, 3, 8, 59, TZ_CN));
    assert.equal(w!.precision, "day");
  });

  it("显式年份不受 now 影响", () => {
    const w = parseWindow("2026-10-19 12:00 ~ 2027-01-25 04:59", TZ_CN, NOW);
    assert.equal(w!.startAt, wallToInstant(2026, 10, 19, 12, 0, TZ_CN));
    assert.equal(w!.endAt, wallToInstant(2027, 1, 25, 4, 59, TZ_CN));
  });

  it("无法解析时返回 null，不猜", () => {
    assert.equal(parseWindow("敬请期待", TZ_CN, NOW), null);
    assert.equal(parseWindow("", TZ_CN, NOW), null);
    assert.equal(parseWindow(null, TZ_CN, NOW), null);
    assert.equal(parseWindow("13-45 99:99 ~ 13-46 99:99", TZ_CN, NOW), null);
  });
});

describe("时区换算", () => {
  it("同一墙钟在 UTC 与 UTC+8 下的绝对时刻相差 8 小时", () => {
    const text = "10-13 18:00 ~ 11-03 14:59";
    const cn = parseWindow(text, TZ_CN, NOW)!;
    const utc = parseWindow(text, TZ_UTC, NOW)!;
    // 同一串墙钟 18:00，在 UTC+8 是"更早"的绝对时刻（UTC+8 的 18:00 = UTC 10:00）
    assert.equal(utc.startAt - cn.startAt, 8 * 60 * 60 * 1000);
  });

  it("往返渲染与原始串逐字符一致（带年份与不带年份各一例）", () => {
    const short = "10-13 18:00 ~ 11-03 14:59";
    assert.equal(formatWindow(parseWindow(short, TZ_CN, NOW)!, TZ_CN), short);

    const full = "2026-10-19 12:00 ~ 2027-01-25 04:59";
    assert.equal(formatWindow(parseWindow(full, TZ_CN, NOW)!, TZ_CN, true), full);
  });

  it("normalizeDateText 只改日期写法，不动无关文本", () => {
    assert.equal(normalizeDateText("10月13日"), "10-13");
    assert.equal(normalizeDateText("2026年10月13日"), "2026-10-13");
    assert.equal(normalizeDateText("10/13"), "10-13");
    assert.equal(normalizeDateText("活动一览"), "活动一览");
  });
});

describe("parseWindowDetailed", () => {
  it("回传命中的原文片段，供剥掉日期后取标题", () => {
    const line = "「虹旅藏金·耀星烁熠」   09-28 00:00 ~ 10-22 06:00";
    const w = parseWindowDetailed(line, TZ_CN, NOW);
    assert.notEqual(w, null);
    assert.ok(line.includes(w!.matched));
    assert.equal(line.slice(0, line.indexOf(w!.matched)).trim(), "「虹旅藏金·耀星烁熠」");
  });
});
