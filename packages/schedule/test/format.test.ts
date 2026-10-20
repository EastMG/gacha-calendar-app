import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatRelative, formatRemaining, formatUntil, TZ_CN, wallToInstant } from "../src/index.ts";

const NOW = wallToInstant(2026, 10, 20, 12, 0, TZ_CN);
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("formatRemaining —— 过去方向", () => {
  it("day 精度只给天数，不给时分（不编造精度）", () => {
    assert.equal(formatRemaining(3 * DAY + 5 * HOUR, "day"), "剩 4 天");
    assert.equal(formatRemaining(1 * HOUR, "day"), "今天结束");
    assert.equal(formatRemaining(30 * MINUTE, "day"), "今天结束");
  });

  it("minute 精度给天/时/分", () => {
    assert.equal(formatRemaining(3 * DAY + 2 * HOUR, "minute"), "剩 3 天 2 小时");
    assert.equal(formatRemaining(5 * HOUR + 20 * MINUTE, "minute"), "剩 5 小时 20 分");
    assert.equal(formatRemaining(5 * MINUTE + 30_000, "minute"), "剩 5 分 30 秒");
  });

  it("已结束", () => {
    assert.equal(formatRemaining(-1, "minute"), "已结束");
    assert.equal(formatRemaining(0, "minute"), "已结束");
  });
});

describe("formatUntil —— 未来方向", () => {
  it("一分钟内算「即将触发」", () => {
    assert.equal(formatUntil(NOW + 30_000, NOW), "即将触发");
    assert.equal(formatUntil(NOW - 5 * MINUTE, NOW), "即将触发");
  });

  it("按天/时/分给出「还有多久」，不会返回「刚刚」", () => {
    assert.equal(formatUntil(NOW + 3 * DAY, NOW), "3 天后");
    assert.equal(formatUntil(NOW + 2 * HOUR + 15 * MINUTE, NOW), "2 小时 15 分后");
    assert.equal(formatUntil(NOW + 12 * MINUTE, NOW), "12 分钟后");
    // 关键回归：以前误用 formatRelative 算未来，只会得到「刚刚」
    assert.notEqual(formatUntil(NOW + 2 * HOUR, NOW), "刚刚");
  });
});

describe("formatRelative —— 过去方向", () => {
  it("刚刚 / 分钟 / 小时 / 天 / 月", () => {
    assert.equal(formatRelative(NOW - 10_000, NOW), "刚刚");
    assert.equal(formatRelative(NOW - 12 * MINUTE, NOW), "12 分钟前");
    assert.equal(formatRelative(NOW - 3 * HOUR, NOW), "3 小时前");
    assert.equal(formatRelative(NOW - 2 * DAY, NOW), "2 天前");
    assert.equal(formatRelative(NOW - 70 * DAY, NOW), "2 个月前");
  });

  it("未来时间不应被当成「很久以前」", () => {
    assert.equal(formatRelative(NOW + DAY, NOW), "刚刚");
  });
});
