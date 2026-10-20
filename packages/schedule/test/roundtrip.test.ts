/**
 * 用**真实快照**（`fixtures/sample-result.json`，2026-10-20 抓的 28 款）验证派生层。
 *
 * 核心断言是"往返一致"：解析出的绝对时刻按源站时区渲染回去，
 * 必须与 core 给的展示串**逐字符**相同 —— 只要年份推断或时区算错一丁点就会挂。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { formatWindow, gameTz, GAME_TZ, parseWindow, toEvents, toGameViews, type ResultLike } from "../src/index.ts";

const FIXTURE = fileURLToPath(new URL("../../../fixtures/sample-result.json", import.meta.url));
const result = JSON.parse(readFileSync(FIXTURE, "utf8")) as ResultLike & { refreshedAt: number };
const NOW = result.refreshedAt;

const metas = Object.entries(result.games ?? {}).map(([id, rec]) => ({ id, name: rec.name ?? id }));

describe("真实快照 —— 往返自检", () => {
  it("每一条有日期的展示串都能还原成逐字符一致的区间", () => {
    const failures: string[] = [];
    let checked = 0;

    for (const [gameId, rec] of Object.entries(result.games ?? {})) {
      const tzMin = gameTz(gameId);
      for (const [label, datesField] of [
        ["banner", "bannerDates"],
        ["event", "eventDates"]
      ] as const) {
        const text = rec[datesField];
        if (!text) continue;
        const w = parseWindow(text, tzMin, NOW);
        if (!w) {
          failures.push(`${gameId}.${label} 解析失败: ${JSON.stringify(text)}`);
          continue;
        }
        checked++;
        const withYear = /\d{4}-\d{2}-\d{2}/.test(text);
        const got = formatWindow(w, tzMin, withYear);
        if (got !== text) failures.push(`${gameId}.${label}: ${JSON.stringify(text)} → ${JSON.stringify(got)}`);
      }
    }

    assert.deepEqual(failures, []);
    // 快照里实际有 43 个有日期的侧；少于这个数说明解析覆盖面退化了
    assert.ok(checked >= 43, `只校验到 ${checked} 条，少于预期 43`);
  });

  it("所有快照里出现的游戏都必须显式配置时区（漏配会静默偏 8-9 小时）", () => {
    const missing = Object.keys(result.games ?? {}).filter((id) => GAME_TZ[id] === undefined);
    assert.deepEqual(missing, []);
  });
});

describe("真实快照 —— 事件展开", () => {
  it("Hover 明细能显著扩大事件覆盖面", () => {
    const events = toEvents(result, metas, NOW);
    const primary = events.filter((e) => e.origin === "primary");
    const detail = events.filter((e) => e.origin === "detail");

    assert.ok(primary.length >= 43, `主事件只有 ${primary.length}`);
    assert.ok(detail.length > 50, `明细事件只有 ${detail.length}`);
    assert.equal(events.length, primary.length + detail.length);
  });

  it("事件 id 唯一（列表 key 与「已提醒」标记都依赖它）", () => {
    const events = toEvents(result, metas, NOW);
    const ids = new Set(events.map((e) => e.id));
    assert.equal(ids.size, events.length);
  });

  it("所有事件的结束时间不早于开始时间", () => {
    for (const e of toEvents(result, metas, NOW)) {
      assert.ok(e.endAt >= e.startAt, `${e.id} 的 endAt < startAt`);
    }
  });
});

describe("真实快照 —— 游戏状态", () => {
  it("每款游戏都产出状态，且失败态与 core 的三态一致", () => {
    const views = toGameViews(result, metas, NOW);
    assert.equal(views.length, Object.keys(result.games ?? {}).length);

    const umaGlobal = views.find((v) => v.id === "uma-global");
    assert.equal(umaGlobal?.eventState, "down");

    const kedr = views.find((v) => v.id === "kedr");
    assert.equal(kedr?.gachaState, "nomatch");
  });
});
