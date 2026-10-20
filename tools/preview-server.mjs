#!/usr/bin/env node
/**
 * 预览服务器（零依赖，只用 node:http）。
 *
 * 为什么不用 Vite：本项目刻意**不引入打包器/框架**——
 * 三端壳还没定（RN / Capacitor / 原生 WebView 皆可能），
 * 预览只负责验证"数据层 + 信息架构"，用原生 ESM + import map 就够，
 * 也让 `npm run dev` 在任何机器上都没有构建链依赖。
 *
 * 三个职责：
 *  1. 托管 `apps/preview` 与 `build/`（tsc 产物）
 *  2. 把 `gacha-calendar-core` 以 /vendor/core.mjs 暴露给 import map
 *  3. `/__gacha_proxy` —— **仅开发期**的抓取代理（浏览器有 CORS，
 *     真机没有；见 packages/core-bridge/src/transport.ts 顶部说明）
 *
 * ⚠️ `/__gacha_proxy` 是一个不受限的出站通道，只监听 127.0.0.1，**绝不能**用于生产。
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4321);

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PROXY_TIMEOUT_MS = 20_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, { "content-type": contentType, "cache-control": "no-store", ...extraHeaders });
  res.end(body);
}

/** 把 URL 路径安全地映射到 ROOT 下的文件；越界返回 null */
function resolveStatic(pathname, prefix) {
  const rel = pathname.slice(prefix.length);
  const target = normalize(join(ROOT, prefix, rel));
  if (!target.startsWith(join(ROOT, prefix) + sep) && target !== join(ROOT, prefix)) return null;
  return target;
}

function serveFile(res, filePath) {
  if (!filePath || !existsSync(filePath)) return send(res, 404, "not found");
  const stat = statSync(filePath);
  if (stat.isDirectory()) return send(res, 404, "not found");
  res.writeHead(200, {
    "content-type": MIME[extname(filePath)] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store"
  });
  createReadStream(filePath).pipe(res);
  return undefined;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
}

function parseHeadersParam(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return {};
  }
}

async function handleProxy(req, res, url) {
  const target = url.searchParams.get("url");
  if (!target) return send(res, 400, "missing url");

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return send(res, 400, "bad url");
  }
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return send(res, 400, "unsupported protocol");
  }

  const headers = {
    "User-Agent": url.searchParams.get("ua") || DEFAULT_UA,
    Referer: url.searchParams.get("referer") || `${targetUrl.origin}/`,
    Origin: targetUrl.origin,
    Accept: "*/*",
    ...parseHeadersParam(url.searchParams.get("headers"))
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const upstream = await fetch(targetUrl, {
      method: req.method === "POST" ? "POST" : "GET",
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: "follow",
      signal: controller.signal
    });
    const text = await upstream.text();
    // 目标站状态码用响应头透传，客户端据此还原成 core 认识的 `http-<code>`
    return send(res, 200, text, "text/plain; charset=utf-8", { "x-gacha-status": String(upstream.status) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAbort = /abort/i.test(message);
    return send(res, 200, isAbort ? "timeout" : `network error: ${message}`, "text/plain; charset=utf-8", {
      "x-gacha-status": "0"
    });
  } finally {
    clearTimeout(timer);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || HOST}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === "/__gacha_proxy") return await handleProxy(req, res, url);
    if (pathname === "/__fixture") {
      const fixture = join(ROOT, "fixtures", "sample-result.json");
      if (!existsSync(fixture)) return send(res, 404, "[]", MIME[".json"]);
      return send(res, 200, readFileSync(fixture, "utf8"), MIME[".json"]);
    }
    if (pathname === "/vendor/core.mjs") {
      return serveFile(res, join(ROOT, "node_modules", "gacha-calendar-core", "core.mjs"));
    }
    if (pathname.startsWith("/build/")) return serveFile(res, resolveStatic(pathname, "/build"));
    if (pathname === "/" || pathname === "/index.html") {
      return serveFile(res, join(ROOT, "apps", "preview", "index.html"));
    }
    // 预览自己的静态资源（styles.css / 图标等）
    return serveFile(res, resolveStatic(pathname, "/apps/preview"));
  } catch (err) {
    return send(res, 500, `server error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  二游日历 · 浏览器预览`);
  console.log(`  → http://${HOST}:${PORT}\n`);
  console.log(`  数据源：实时（经 /__gacha_proxy 开发代理）/ 快照（fixtures）`);
  console.log(`  停止：Ctrl+C\n`);
});
