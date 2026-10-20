/**
 * 与 `gacha-calendar-core` 的**接口契约测试**（离线，不联网）。
 *
 * 作用：上游升级后若方法名 / 返回形状变了，这里先挂，
 * 提醒同步 `src/gacha-calendar-core.d.ts` 的类型声明与门面代码。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAppEngine } from "../src/engine.ts";
import { createMemoryStorage } from "../src/storage.ts";
import type { HttpClient } from "../src/http.ts";

/** 不联网的假 HTTP：任何请求都当成 404，只为验证装配正确 */
const offlineHttp: HttpClient = async () => ({ status: 404, text: "" });

const FIXED_NOW = Date.UTC(2026, 9, 20, 10, 0, 0);

function makeEngine(): ReturnType<typeof createAppEngine> {
  return createAppEngine({
    http: offlineHttp,
    storage: createMemoryStorage(),
    now: () => FIXED_NOW
  });
}

describe("createAppEngine —— 引擎契约", () => {
  it("暴露 core 约定的 5 个成员", () => {
    const { engine } = makeEngine();
    for (const key of ["schemaVersion", "listGames", "getCached", "refresh", "selfCheck"] as const) {
      assert.ok(key in engine, `缺少 ${key}`);
    }
    assert.equal(engine.schemaVersion, 1, "schemaVersion 应为 1");
  });

  it("listGames() 返回 28 款游戏的元数据，字段齐全", async () => {
    const { engine } = makeEngine();
    const games = await engine.listGames();
    assert.equal(games.length, 28);

    const genshin = games.find((g) => g.id === "genshin");
    assert.ok(genshin, "必须含原神");
    assert.equal(genshin!.name, "原神");
    assert.ok(typeof genshin!.icon === "string" && genshin!.icon.length > 0);
    assert.equal(typeof genshin!.source, "string");
    assert.equal(Array.isArray(genshin!.altSources), true);
    assert.equal(typeof genshin!.hidden, "boolean");
  });

  it("getCached() 在无缓存时返回空 games，而不是抛错", async () => {
    const { engine } = makeEngine();
    const cached = await engine.getCached();
    assert.equal(cached.schemaVersion, 1);
    assert.deepEqual(cached.games, {});
  });

  it("三族分区游戏都在（国服/日服/国际服必须能区分）", async () => {
    const { engine } = makeEngine();
    const ids = new Set((await engine.listGames()).map((g) => g.id));
    for (const id of ["ba-cn", "ba-global", "ba-jp", "uma-cn", "uma-jp", "uma-global", "bandori", "ournotes"]) {
      assert.ok(ids.has(id), `缺少分区条目 ${id}`);
    }
  });

  it("注入的 now() 被真正使用（refreshedAt 必须等于注入值）", async () => {
    const { engine: eng } = makeEngine();
    // 离线假 HTTP 会让每一侧都失败，但 refresh 仍会用注入的时钟盖时间戳 ——
    // 这正是"刷新时间必须可复现"的验证点。
    const result = await eng.refresh();
    assert.equal(result.refreshedAt, FIXED_NOW);
  });
});
