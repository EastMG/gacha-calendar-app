/**
 * `@gacha/core-bridge` —— `gacha-calendar-core` 的平台适配层。
 *
 * 三端壳（RN / Capacitor / 原生 WebView / 鸿蒙 ArkTS）只需要提供三样东西：
 *
 * ```ts
 * const { engine } = createAppEngine({
 *   http:    (req) => myNativeHttp(req),   // 能设任意 header 的请求器
 *   storage: myKeyValueStore,              // 异步 KV
 *   now:     () => Date.now()              // 可省略
 * });
 * ```
 *
 * 设计前提（已用真实网络验证）：**移动端不需要自建代理服务器**。
 * `fetchViaProxy` 只是"能设任意 header 的跨域 GET/POST"，其存在理由是浏览器的
 * CORS 与 Referer 禁改头，真机走原生 HTTP 时这两条都不成立。
 */
export * from "./http.ts";
export * from "./transport.ts";
export * from "./storage.ts";
export * from "./settings.ts";
export * from "./fetch-client.ts";
export * from "./engine.ts";
