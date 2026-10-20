/**
 * 通用 `fetch` 版 HttpClient。
 *
 * 适用于**没有 CORS 限制**的 JS 运行时：Node、React Native、鸿蒙原生 HTTP 桥。
 * 浏览器里不要直接用它 —— 浏览器要给 `Referer` 赋值会被静默丢弃，
 * 且跨域会被 CORS 拦掉（预览因此改走 dev 代理，见 `apps/preview/src/http-browser.ts`）。
 */
import { DEFAULT_USER_AGENT, type HttpClient } from "./http.ts";

export interface FetchClientOptions {
  userAgent?: string;
  /** 允许调用方改写 URL（例如预览里改写成 dev 代理地址） */
  rewriteUrl?: (url: string, kind: "raw" | "proxy") => string;
  kind?: "raw" | "proxy";
}

/** 用全局 `fetch` 实现 HttpClient。 */
export function createFetchHttpClient(options: FetchClientOptions = {}): HttpClient {
  const { userAgent = DEFAULT_USER_AGENT, rewriteUrl, kind = "raw" } = options;
  return async (request) => {
    const url = rewriteUrl ? rewriteUrl(request.url, kind) : request.url;
    const headers: Record<string, string> = { ...request.headers };
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "user-agent")) {
      headers["User-Agent"] = userAgent;
    }
    const res = await fetch(url, {
      method: request.method,
      headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      redirect: "follow",
      ...(request.signal ? { signal: request.signal } : {})
    });
    return { status: res.status, text: await res.text() };
  };
}
