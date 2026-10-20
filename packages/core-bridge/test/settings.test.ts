/**
 * 配置读取测试。
 *
 * 重点是 `gameColors` 这种"上游存的是 JSON 字符串"的键：
 * 读错了不会报错，只会让用户的主题色静默失效。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorage } from "../src/storage.ts";
import { readGameColors, readJsonSetting } from "../src/settings.ts";

describe("readJsonSetting", () => {
  it("缺省返回 fallback", async () => {
    const storage = createMemoryStorage();
    assert.deepEqual(await readJsonSetting(storage, "gameColors", {}), {});
  });

  it("兼容「JSON 字符串」形态（上游实际存法）", async () => {
    const storage = createMemoryStorage({ gameColors: '{"genshin":"#ff0000"}' });
    assert.deepEqual(await readJsonSetting(storage, "gameColors", {}), { genshin: "#ff0000" });
  });

  it("兼容「已解析对象」形态", async () => {
    const storage = createMemoryStorage({ gameColors: { genshin: "#00ff00" } });
    assert.deepEqual(await readJsonSetting(storage, "gameColors", {}), { genshin: "#00ff00" });
  });

  it("坏 JSON 回落到 fallback，不抛错", async () => {
    const storage = createMemoryStorage({ gameColors: "{not json" });
    assert.deepEqual(await readJsonSetting(storage, "gameColors", {}), {});
  });
});

describe("readGameColors", () => {
  it("只保留字符串值，过滤噪声", async () => {
    const storage = createMemoryStorage({
      gameColors: JSON.stringify({ genshin: "#6c8cff", hsr: 123, "": "#fff" })
    });
    const colors = await readGameColors(storage);
    assert.deepEqual(colors, { genshin: "#6c8cff", "": "#fff" });
  });

  it("空配置返回空对象", async () => {
    const colors = await readGameColors(createMemoryStorage());
    assert.deepEqual(colors, {});
  });
});
