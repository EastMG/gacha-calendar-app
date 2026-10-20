/**
 * 引擎门面：把"传输层 + 存储 + 时钟"组装成 core 的 `createEngine`。
 *
 * 这一层存在的意义是**把平台差异收口到这里**：三端壳只提供
 * `{ http, storage, now? }`，其余（transport 契约、超时、UA、错误形状）全部复用。
 */
import { createEngine, type CoreEngine, type CoreStorage, type CoreTimer, type CoreTransport } from "gacha-calendar-core";
import { type HttpClient } from "./http.ts";
import { createTransport, type TransportOptions } from "./transport.ts";

export interface AppEngineOptions extends Omit<TransportOptions, "http"> {
  http: HttpClient;
  storage: CoreStorage;
  now?: () => number;
  timer?: CoreTimer;
}

export interface AppEngine {
  engine: CoreEngine;
  transport: CoreTransport;
}

/** 默认计时器：优先用全局 setTimeout（所有 JS 运行时都有）。 */
function defaultTimer(): CoreTimer {
  return {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>)
  };
}

export function createAppEngine(options: AppEngineOptions): AppEngine {
  const transportOptions: TransportOptions = { http: options.http };
  if (options.userAgent !== undefined) transportOptions.userAgent = options.userAgent;
  if (options.timeoutMs !== undefined) transportOptions.timeoutMs = options.timeoutMs;
  if (options.maxBytes !== undefined) transportOptions.maxBytes = options.maxBytes;

  const transport = createTransport(transportOptions);
  const engine = createEngine({
    transport,
    storage: options.storage,
    now: options.now ?? (() => Date.now()),
    timer: options.timer ?? defaultTimer()
  });

  return { engine, transport };
}

/**
 * core 会读写的全部配置键（来自上游 `engine-head.js` 的 `CONFIG_KEYS`）。
 *
 * 列在这里是为了对齐：新壳接入时应照抄键名，否则用户在上一个壳里的
 * 排序/隐藏/自定义条目不会跟过来。
 */
export const CORE_CONFIG_KEYS = [
  "order",
  "hidden",
  "shown",
  "removed",
  "customEntries",
  "customUrls",
  "customEventUrls",
  "gameColors",
  "autoRefresh",
  "refreshMinutes",
  "newPanel",
  "lastData",
  "lastRefresh",
  "lastSource",
  "lastVersion"
] as const;

export type CoreConfigKey = (typeof CORE_CONFIG_KEYS)[number];
