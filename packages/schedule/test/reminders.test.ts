import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planReminders, TZ_CN, wallToInstant, type ScheduleEvent } from "../src/index.ts";

const NOW = wallToInstant(2026, 10, 20, 12, 0, TZ_CN);
const HOUR = 3_600_000;
const DAY = 86_400_000;

let seq = 0;
function mkEvent(startAt: number, endAt: number, overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  seq += 1;
  return {
    id: overrides.id ?? `ev-${seq}`,
    gameId: overrides.gameId ?? "genshin",
    gameName: overrides.gameName ?? "原神",
    kind: "gacha",
    kindLabel: "卡池",
    title: overrides.title ?? "测试卡池",
    detail: "",
    precision: overrides.precision ?? "minute",
    tzMin: TZ_CN,
    origin: "primary",
    fail: null,
    stale: false,
    rawDates: "",
    startAt,
    endAt,
    ...overrides
  };
}

describe("planReminders", () => {
  it("为即将结束的事件排「提前 N 分钟」提醒", () => {
    const e = mkEvent(NOW - DAY, NOW + 10 * HOUR);
    const r = planReminders([e], NOW, { leadMinutes: 60 });
    assert.equal(r.length, 1);
    assert.equal(r[0]!.at, e.endAt - HOUR);
    assert.ok(r[0]!.title.includes("即将结束"));
    assert.ok(r[0]!.body.includes("还剩 10 小时"));
  });

  it("day 精度事件不排提醒（不知道确切时刻，不许编造）", () => {
    const e = mkEvent(NOW - DAY, NOW + 3 * DAY, { precision: "day" });
    assert.equal(planReminders([e], NOW).length, 0);
  });

  it("已结束的事件不排提醒", () => {
    const e = mkEvent(NOW - 5 * DAY, NOW - DAY);
    assert.equal(planReminders([e], NOW).length, 0);
  });

  it("超出 horizon 的事件不排提醒", () => {
    const e = mkEvent(NOW - DAY, NOW + 30 * DAY);
    assert.equal(planReminders([e], NOW, { horizonDays: 7 }).length, 0);
  });

  it("每款游戏有条数上限，防刷屏", () => {
    const events = [1, 2, 3, 4].map((i) => mkEvent(NOW - DAY, NOW + i * HOUR * 5, { id: `g${i}` }));
    assert.equal(planReminders(events, NOW, { maxPerGame: 2 }).length, 2);
  });

  it("不同游戏各自计数", () => {
    const a = mkEvent(NOW - DAY, NOW + 20 * HOUR, { gameId: "genshin", gameName: "原神" });
    const b = mkEvent(NOW - DAY, NOW + 20 * HOUR, { gameId: "hsr", gameName: "星铁" });
    assert.equal(planReminders([a, b], NOW, { maxPerGame: 1 }).length, 2);
  });

  it("返回结果按触发时间升序", () => {
    const later = mkEvent(NOW - DAY, NOW + 50 * HOUR, { gameId: "a", gameName: "A" });
    const sooner = mkEvent(NOW - DAY, NOW + 10 * HOUR, { gameId: "b", gameName: "B" });
    const r = planReminders([later, sooner], NOW);
    assert.ok(r[0]!.at < r[1]!.at, "提醒应升序");
  });

  it("提醒时刻不早于 now（事件已进入提前量窗口时立刻提醒）", () => {
    const e = mkEvent(NOW - DAY, NOW + 10 * 60_000); // 10 分钟后结束
    const r = planReminders([e], NOW, { leadMinutes: 60, minLeadMinutes: 5 });
    assert.equal(r.length, 1);
    assert.ok(r[0]!.at >= NOW);
  });
});
