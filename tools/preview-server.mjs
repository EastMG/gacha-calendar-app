#!/usr/bin/env node
/**
 * 本地服务器（零依赖，只用 node:http）。
 *
 * 两种模式，**目录结构与线上完全一致**，避免"本地好、部署坏"：
 *
 *   node tools/preview-server.mjs           开发模式
 *     · 文档根 = apps/preview
 *     · /build/ 与 /vendor/ 指向真实构建产物 / node_modules
 *     · 额外提供 /__gacha_proxy（浏览器抓取补偿）与 /__fixture
 *
 *   node tools/preview-server.mjs --dist    产物模式（验 PWA 用）
 *     · 文档根 = dist（由 tools/build-pwa.mjs 生成）
 *     · 没有代理，Service Worker 可正常注册
 *
 * ⚠️ `/__gacha_proxy` 是不受限的出站通道，只监听 127.0.0.1，**绝不能用于生产**。
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST_MODE = process.argv.includes("--dist");
const DOC_ROOT = DIST_MODE ? resolve(ROOT, "dist") : resolve(ROOT, "apps", "preview");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || (DIST_MODE ? 4322 : 4321));

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PROXY_TIMEOUT_MS = 20_000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

/** 不缓存的路径：PWA 更新要靠它们立刻生效 */
function cacheControlFor(pathname) {
  if (pathname === "/" || pathname.endsWith(".html")) return "no-cache";
  if (pathname.endsWith("/sw.js")) return "no-cache";
  if (pathname.endsWith(".json")) return "no-cache";
  return "no-store";
}

function send(res, status, body, contentType = "text/plain; charset=utf-8", extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
    ...devMarker(),
    ...extraHeaders
  });
  res.end(body);
}

/**
 * 开发模式在响应头上打标记，前端据此判断"有没有抓取代理"。
 * 用响应头而不是探测 `/__gacha_proxy`：后者必然产生一条 404 控制台噪音。
 */
function devMarker() {
  return DIST_MODE ? {} : { "x-gacha-proxy": "1" };
}

function within(root, target) {
  const base = root.endsWith(sep) ? root : root + sep;
  return target === root || target.startsWith(base);
}

/** URL 路径 → 磁盘路径（按模式映射），越界返回 null */
function mapToFile(pathname) {
  if (!DIST_MODE) {
    if (pathname.startsWith("/build/")) {
      const target = normalize(join(ROOT, pathname));
      return within(resolve(ROOT, "build"), target) ? target : null;
    }
    if (pathname === "/vendor/core.mjs") {
      return resolve(ROOT, "node_modules", "gacha-calendar-core", "core.mjs");
    }
  }
  const target = normalize(join(DOC_ROOT, pathname === "/" ? "/index.html" : pathname));
  return within(DOC_ROOT, target) ? target : null;
}

function serveFile(res, pathname) {
  const filePath = mapToFile(pathname);
  if (!filePath || !existsSync(filePath)) return send(res, 404, "not found");
  const stat = statSync(filePath);
  if (stat.isDirectory()) return serveFile(res, join(pathname, "index.html"));
  res.writeHead(200, {
    "content-type": MIME[extname(filePath)] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": cacheControlFor(pathname),
    ...devMarker()
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
    if (!DIST_MODE) {
      if (pathname === "/__gacha_proxy") return await handleProxy(req, res, url);
      if (pathname === "/__fixture") {
        const fixture = join(DOC_ROOT, "data", "latest.json");
        if (!existsSync(fixture)) return send(res, 404, "{}", MIME[".json"]);
        return serveFile(res, "/data/latest.json");
      }
    }
    return serveFile(res, pathname);
  } catch (err) {
    return send(res, 500, `server error: ${err instanceof Error ? err.message : String(err)}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  二游日历 · ${DIST_MODE ? "产物模式（PWA）" : "开发模式"}`);
  console.log(`  → http://${HOST}:${PORT}\n`);
  if (DIST_MODE) {
    console.log(`  文档根：dist/      （Service Worker 可注册，可测离线）`);
  } else {
    console.log(`  文档根：apps/preview/   + /build/  /vendor/  /__gacha_proxy`);
  }
  console.log(`  停止：Ctrl+C\n`);
});
