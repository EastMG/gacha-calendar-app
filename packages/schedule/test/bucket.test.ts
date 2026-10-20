import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bucket, groupByDay, daysFromNow, TZ_CN, wallToInstant, type ScheduleEvent } from "../src/index.ts";

const DAY = 86_400_000;
const NOW = wallToInstant(2026, 10, 20, 18, 0, TZ_CN);

function mkEvent(overrides: Partial<ScheduleEvent> & Pick<ScheduleEvent, "startAt" | "endAt">): ScheduleEvent {
  return {
    id: overrides.id ?? `e-${overrides.startAt}`,
    gameId: overrides.gameId ?? "genshin",
    gameName: overrides.gameName ?? "原神",
    kind: overrides.kind ?? "gacha",
    kindLabel: "卡池",
    title: overrides.title ?? "测试卡池",
    detail: "",
    precision: overrides.precision ?? "minute",
    tzMin: overrides.tzMin ?? TZ_CN,
    origin: "primary",
    fail: null,
    stale: false,
    rawDates: "",
    ...overrides
  };
}

describe("bucket —— 首页三段聚合", () => {
  const ending = mkEvent({ startAt: NOW - 2 * DAY, endAt: NOW + 10 * 3_600_000, title: "即将结束" });
  const ongoing = mkEvent({ startAt: NOW - 1 * DAY, endAt: NOW + 5 * DAY, title: "进行中" });
  const upcoming = mkEvent({ startAt: NOW + 3 * DAY, endAt: NOW + 10 * DAY, title: "即将开启" });
  const farAway = mkEvent({ startAt: NOW + 60 * DAY, endAt: NOW + 70 * DAY, title: "很久以后" });
  const ended = mkEvent({ startAt: NOW - 30 * DAY, endAt: NOW - 1 * DAY, title: "已结束" });

  it("按「结束迫近度 / 是否已开始」正确分桶", () => {
    const b = bucket([ending, ongoing, upcoming, farAway, ended], NOW);
    assert.deepEqual(b.ending.map((e) => e.title), ["即将结束"]);
    assert.deepEqual(b.ongoing.map((e) => e.title), ["进行中"]);
    assert.deepEqual(b.upcoming.map((e) => e.title), ["即将开启"]);
    assert.deepEqual(b.ended.map((e) => e.title), ["已结束"]);
    assert.equal(
      [...b.ending, ...b.ongoing, ...b.upcoming].some((e) => e.title === "很久以后"),
      false,
      "60 天后才开始的既不该进 upcoming 也不该进 ongoing"
    );
  });

  it("即将结束按结束时间升序（最先过期的排最前）", () => {
    const a = mkEvent({ startAt: NOW - DAY, endAt: NOW + 30 * 3_600_000, title: "B" });
    const b = mkEvent({ startAt: NOW - DAY, endAt: NOW + 5 * 3_600_000, title: "A" });
    assert.deepEqual(bucket([a, b], NOW).ending.map((e) => e.title), ["A", "B"]);
  });

  it("阈值可调", () => {
    const r = bucket([ongoing], NOW, { endingWithinHours: 24 * 20 });
    assert.equal(r.ending.length, 1);
    assert.equal(r.ongoing.length, 0);
  });
});

describe("groupByDay —— 按源站时区取日", () => {
  it("把同一源站时区的同一天归到一组", () => {
    const a = mkEvent({
      startAt: wallToInstant(2026, 10, 22, 6, 0, TZ_CN),
      endAt: wallToInstant(2026, 11, 1, 0, 0, TZ_CN)
    });
    const b = mkEvent({
      startAt: wallToInstant(2026, 10, 22, 18, 0, TZ_CN),
      endAt: wallToInstant(2026, 11, 2, 0, 0, TZ_CN),
      id: "b"
    });
    const groups = groupByDay([a, b]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.key, "2026-10-22");
    assert.equal(groups[0]!.events.length, 2);
  });

  it("UTC 源的事件按 UTC 取日，不会被设备时区挤到前一天", () => {
    const e = mkEvent({
      startAt: wallToInstant(2026, 10, 13, 0, 0, 0),
      endAt: wallToInstant(2026, 10, 27, 0, 0, 0),
      tzMin: 0,
      gameId: "ba-global",
      gameName: "蔚蓝档案·国际服"
    });
    assert.equal(groupByDay([e])[0]!.key, "2026-10-13");
  });

  it("分组按日期升序", () => {
    const a = mkEvent({
      startAt: wallToInstant(2026, 10, 30, 0, 0, TZ_CN),
      endAt: wallToInstant(2026, 11, 1, 0, 0, TZ_CN),
      id: "x"
    });
    const b = mkEvent({
      startAt: wallToInstant(2026, 10, 22, 0, 0, TZ_CN),
      endAt: wallToInstant(2026, 11, 1, 0, 0, TZ_CN),
      id: "y"
    });
    assert.deepEqual(
      groupByDay([a, b]).map((g) => g.key),
      ["2026-10-22", "2026-10-30"]
    );
  });
});

describe("daysFromNow", () => {
  it("按源站时区的日界线算整数天", () => {
    const target = wallToInstant(2026, 10, 23, 0, 30, TZ_CN);
    assert.equal(daysFromNow(target, NOW, TZ_CN), 3);
  });
});
