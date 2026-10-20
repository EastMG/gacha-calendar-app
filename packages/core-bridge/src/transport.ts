/**
 * core 需要的 transport 适配器。
 *
 * ## core 只要求两件事
 *
 * ```
 * fetchRaw(url, { signal, headers })                        → 类 Response（ok / status / text() / json()）
 * fetchViaProxy(url, { referer, headers, body })            → 目标站【原始 body 字符串】
 * ```
 *
 * `fetchViaProxy` 必须返回**字符串**而不是对象 —— 返回错形状不会报契约错误，
 * 只会让每一款游戏静默变成「抓取异常」（浏览器扩展在这里踩过坑）。
 *
 * ## 为什么移动端一个原生 fetch 就够
 *
 * 代理层存在的三个理由（CORS / Referer 是禁改头 / 少数站点校验 UA）**全部是浏览器限制**。
 * 真机走原生 HTTP 时这三条都不成立，所以 `fetchRaw` 与 `fetchViaProxy` 可以由
 * **同一个能设任意 header 的请求器**实现。已用真实网络验证：28 款里没有一款需要服务端中转。
 */
import type { CoreResponseLike, CoreTransport } from "gacha-calendar-core";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  requestWithTimeout,
  type HttpClient
} from "./http.ts";

export interface TransportOptions {
  /** 平台提供的"能设任意 header 的请求器" */
  http: HttpClient;
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function buildHeaders(
  base: Record<string, string> | undefined,
  userAgent: string,
  referer?: string
): Record<string, string> {
  const headers: Record<string, string> = { Accept: "*/*", ...(base ?? {}) };
  // 默认桌面 UA，但**允许调用方覆盖**：wiki.gg 明确拦浏览器 UA，需要换成非浏览器串
  if (!hasHeader(headers, "user-agent")) headers["User-Agent"] = userAgent;
  // 默认带 Referer：bwiki 全系在缺 Referer 时回 HTTP 567（WAF 挑战页，不是 JSON）
  if (referer && !hasHeader(headers, "referer")) headers.Referer = referer;
  return headers;
}

function makeResponseLike(status: number, body: string, maxBytes: number): CoreResponseLike {
  if (body.length > maxBytes) throw new Error("response too large");
  return {
    ok: status >= 200 && status < 300,
    status,
    async text(): Promise<string> {
      return body;
    },
    async json(): Promise<unknown> {
      try {
        return JSON.parse(body);
      } catch {
        // 统一 `bad-json`，别把原生 SyntaxError 漏出去（会被归成泛化的「抓取异常」）
        throw new Error("bad-json");
      }
    }
  };
}

export function createTransport(options: TransportOptions): CoreTransport {
  const {
    http,
    userAgent = DEFAULT_USER_AGENT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES
  } = options;

  return {
    async fetchRaw(url, opts) {
      const headers = buildHeaders(opts?.headers, userAgent);
      const res = await requestWithTimeout(
        http,
        { url, method: "GET", headers, ...(opts?.signal ? { signal: opts.signal } : {}) },
        timeoutMs
      );
      return makeResponseLike(res.status, res.text, maxBytes);
    },

    async fetchViaProxy(url, opts) {
      const headers = buildHeaders(opts?.headers, userAgent, opts?.referer);
      const rawBody = opts?.body;
      const body =
        rawBody === undefined || rawBody === null
          ? undefined
          : typeof rawBody === "string"
            ? rawBody
            : JSON.stringify(rawBody);
      const res = await requestWithTimeout(
        http,
        { url, method: body === undefined ? "GET" : "POST", headers, ...(body === undefined ? {} : { body }) },
        timeoutMs
      );
      // 必须抛成 `http-<code>`：core 的 normErr 才能把 403/404/567 如实透给用户
      if (res.status < 200 || res.status >= 300) throw new Error(`http-${res.status}`);
      if (res.text.length > maxBytes) throw new Error("response too large");
      return res.text;
    }
  };
}
