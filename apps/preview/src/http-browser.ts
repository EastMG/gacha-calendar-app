/**
 * 浏览器专用的 HttpClient —— 走 `/__gacha_proxy` 开发代理。
 *
 * 为什么浏览器必须绕这一道：`Referer` 属于浏览器禁止脚本设置的头，
 * 且 28 个源站里只有 4 个回了 `access-control-allow-origin`。
 * **真机不需要**（原生 HTTP 没有 CORS，也没有禁改头）—— 这正是
 * `packages/core-bridge/src/transport.ts` 里"移动端不需要自建代理"的由来。
 */
import type { HttpClient, HttpRequest } from "../../../packages/core-bridge/src/http.ts";

const PASSTHROUGH_SKIP = new Set(["referer", "user-agent", "accept"]);

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

export function createProxyHttpClient(endpoint = "/__gacha_proxy"): HttpClient {
  return async (request: HttpRequest) => {
    const url = new URL(endpoint, globalThis.location.origin);
    url.searchParams.set("url", request.url);

    const referer = findHeader(request.headers, "referer");
    if (referer) url.searchParams.set("referer", referer);
    const userAgent = findHeader(request.headers, "user-agent");
    if (userAgent) url.searchParams.set("ua", userAgent);

    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (!PASSTHROUGH_SKIP.has(key.toLowerCase())) extra[key] = value;
    }
    if (Object.keys(extra).length > 0) url.searchParams.set("headers", JSON.stringify(extra));

    const response = await fetch(url, {
      method: request.method,
      ...(request.method === "POST" && request.body !== undefined ? { body: request.body } : {}),
      ...(request.signal ? { signal: request.signal } : {})
    });

    const text = await response.text();
    const status = Number(response.headers.get("x-gacha-status") ?? "0");

    if (status === 0) {
      // 代理本身失败：区分超时与网络错，让 core 的 normErr 归到对应文案
      if (text.trim() === "timeout") {
        const err = new Error("timeout");
        err.name = "AbortError";
        throw err;
      }
      throw new TypeError(`network error: ${text.slice(0, 200)}`);
    }

    return { status, text };
  };
}
