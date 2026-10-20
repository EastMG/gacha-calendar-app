/**
 * core 需要的 storage 适配器。
 *
 * ## 一个容易静默丢缓存的坑
 *
 * core 的 `lastData` **本身就是 JSON 字符串**（`JSON.stringify(games)` 存进去的）。
 * 如果适配层再套一层字符串化，`getCached()` 会拿到双重编码的串 → 解析失败 → 回落到空缓存，
 * 表现是"每次打开都要重新抓一遍，且看不到上次内容"，但**不报错**。
 *
 * 这里的做法是：对值做一次 `JSON.stringify` / `JSON.parse` 的**类型保真往返**。
 * 对 JSON 安全值（string / number / boolean / null / 数组 / 普通对象）往返后与原值全等，
 * 所以 `lastData` 这种"字符串里装 JSON"的值也会原样还原。
 */
import type { CoreStorage } from "gacha-calendar-core";

export interface KVStorage extends CoreStorage {}

/** 内存实现：Node 测试与"离线演示"用，进程退出即丢。 */
export function createMemoryStorage(seed?: Record<string, unknown>): KVStorage {
  const map = new Map<string, unknown>(Object.entries(seed ?? {}));
  return {
    async get(key: string): Promise<unknown> {
      return map.get(key);
    },
    async set(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    }
  };
}

/**
 * `localStorage` 实现（浏览器预览 / PWA）。
 *
 * 前缀避免与同域其它应用撞键。
 */
export function createLocalStorage(prefix = "gacha:"): KVStorage {
  return {
    async get(key: string): Promise<unknown> {
      const raw = globalThis.localStorage?.getItem(prefix + key);
      if (raw === null || raw === undefined) return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      if (value === undefined) {
        globalThis.localStorage?.removeItem(prefix + key);
        return;
      }
      globalThis.localStorage?.setItem(prefix + key, JSON.stringify(value));
    }
  };
}
