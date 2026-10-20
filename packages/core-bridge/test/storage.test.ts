/**
 * storage 契约测试 —— 守住"缓存静默丢失"这个最隐蔽的坑。
 *
 * core 的 `lastData` 本身就是一段 JSON 字符串；如果适配层再套一层字符串化，
 * `getCached()` 会拿到双重编码的串而解析失败 → 回落到空缓存，
 * 表现是"每次打开都要重抓、且看不到上次内容"，但**不报错**。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorage } from "../src/storage.ts";

describe("createMemoryStorage", () => {
  it("未写入的键返回 undefined", async () => {
    const s = createMemoryStorage();
    assert.equal(await s.get("order"), undefined);
  });

  it("按原类型往返（数组 / 数字 / null）", async () => {
    const s = createMemoryStorage();
    await s.set("order", ["genshin", "hsr"]);
    await s.set("refreshMinutes", 1440);
    await s.set("lastRefresh", 0);
    assert.deepEqual(await s.get("order"), ["genshin", "hsr"]);
    assert.equal(await s.get("refreshMinutes"), 1440);
    assert.equal(await s.get("lastRefresh"), 0);
  });

  it("「字符串里装 JSON」的值不会被二次编码（lastData 场景）", async () => {
    const s = createMemoryStorage();
    const lastData = JSON.stringify({ genshin: { banner: "虚星临渡" } });
    await s.set("lastData", lastData);
    const got = await s.get("lastData");
    assert.equal(typeof got, "string");
    assert.equal(got, lastData);
    // 关键：仍然能被解析回原对象
    assert.deepEqual(JSON.parse(got as string), { genshin: { banner: "虚星临渡" } });
  });

  it("支持用 seed 预置状态（离线演示 / 测试）", async () => {
    const s = createMemoryStorage({ hidden: ["bh3"] });
    assert.deepEqual(await s.get("hidden"), ["bh3"]);
  });
});
