/**
 * 读取 core 的配置项。
 *
 * `gameColors` 这一类键在上游是**以 JSON 字符串**存的（不是对象），
 * 直接 `JSON.parse` 会和"已经是对象"的实现打架，因此这里对两种形态都兼容。
 */
import type { KVStorage } from "./storage.ts";

/** 读取一个可能是「JSON 字符串」也可能是「已解析值」的配置 */
export async function readJsonSetting<T>(storage: KVStorage, key: string, fallback: T): Promise<T> {
  let raw: unknown;
  try {
    raw = await storage.get(key);
  } catch {
    return fallback;
  }
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * 读取用户为各游戏设置的主题色。
 *
 * 与桌面端插件 / 浏览器扩展共用同一个键，因此用户在那边挑的颜色会跟到这里 ——
 * 这是"同一份配置多端互通"的一个具体好处，而不是新造一套。
 */
export async function readGameColors(storage: KVStorage): Promise<Record<string, string>> {
  const parsed = await readJsonSetting<Record<string, unknown>>(storage, "gameColors", {});
  const out: Record<string, string> = {};
  for (const [gameId, value] of Object.entries(parsed ?? {})) {
    if (typeof value === "string" && /^#?[0-9a-zA-Z(),.\s%]+$/.test(value)) out[gameId] = value;
  }
  return out;
}
