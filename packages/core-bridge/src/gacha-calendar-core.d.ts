/**
 * `gacha-calendar-core` 的类型声明。
 *
 * 上游包**不带类型**（只有一个 `core.mjs`），这里按实际使用到的 API 手写声明。
 * 依据：上游仓库 `src/client/engine-api.js` 的返回对象与 `engine-head.js` 的环境契约。
 * 上游升级后若方法有增减，`test/engine.contract.test.ts` 会先挂，提醒同步这份声明。
 */
declare module "gacha-calendar-core" {
  export interface CoreAltSource {
    label: string;
    value: string;
  }

  export interface CoreGameMeta {
    id: string;
    name: string;
    icon: string;
    source: string;
    eventSource: string;
    altSources: CoreAltSource[];
    eventAltSources: CoreAltSource[];
    custom: boolean;
    hidden: boolean;
    defaults: Record<string, string>;
  }

  export type CoreFail = { kind: "nomatch"; reason?: string } | { kind: "down"; reason?: string };

  export interface CoreGameRecord {
    name: string;
    banner?: string;
    roles?: string;
    bannerDates?: string;
    bannerDatesRaw?: string;
    bannerHover?: string;
    event?: string;
    eventDates?: string;
    eventDatesRaw?: string;
    eventHover?: string;
    gachaFail?: CoreFail | null;
    eventFail?: CoreFail | null;
    gachaStale?: boolean;
    eventStale?: boolean;
    okAt?: number;
  }

  export interface CoreResult {
    schemaVersion: number;
    refreshedAt: number;
    parserVersions: Record<string, number>;
    games: Record<string, CoreGameRecord>;
  }

  export interface CoreSelfCheckSide {
    state: "ok" | "nomatch" | "unconfigured" | "down";
    reason: string;
    text: string;
  }

  export interface CoreSelfCheck {
    at: number;
    total: number;
    summary: { ok: number; nomatch: number; unconfigured: number; down: number };
    problems: string[];
    games: Record<
      string,
      { name: string; parserVersion?: number; custom: boolean; gacha: CoreSelfCheckSide; event: CoreSelfCheckSide }
    >;
  }

  export interface CoreResponseLike {
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }

  export interface CoreTransport {
    fetchRaw(
      url: string,
      opts?: { signal?: AbortSignal; headers?: Record<string, string> }
    ): Promise<CoreResponseLike>;
    fetchViaProxy(
      url: string,
      opts?: { referer?: string; headers?: Record<string, string>; body?: unknown }
    ): Promise<string>;
  }

  export interface CoreStorage {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  }

  export interface CoreTimer {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(id: unknown): void;
  }

  export interface CoreEngineOptions {
    transport: CoreTransport;
    storage: CoreStorage;
    now?: () => number;
    timer?: CoreTimer;
  }

  export interface CoreEngine {
    schemaVersion: number;
    listGames(): Promise<CoreGameMeta[]>;
    getCached(): Promise<CoreResult>;
    refresh(): Promise<CoreResult>;
    selfCheck(options?: { timeoutMs?: number }): Promise<CoreSelfCheck>;
    __test: Record<string, unknown>;
  }

  export function createEngine(options: CoreEngineOptions): CoreEngine;
}
