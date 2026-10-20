/**
 * Service Worker 模板 —— 由 tools/build-pwa.mjs 注入版本号与预缓存清单后
 * 输出为 dist/sw.js。
 *
 * ## 策略（为什么不是简单的"全部 cache-first"）
 *
 * 1. **应用外壳**：install 时预缓存，装完就能离线打开。
 * 2. **导航请求**：网络优先、离线回退缓存 —— 这样重新部署后用户刷新能立刻拿到新版，
 *    断网时也不会白屏。
 * 3. **数据文件 `data/latest.json`**：网络优先、失败回退缓存。
 *    数据由 GitHub Actions 定时重抓并重新部署，必须优先拿新的；
 *    但离线时仍要能显示上次的结果。
 * 4. **其它静态资源**：cache-first（文件名带构建哈希时最理想；这里没做哈希，
 *    所以每次部署靠版本号变化让旧缓存整体失效）。
 *
 * 跨域请求一律不拦 —— 浏览器本来就会按 CORS 处理，SW 插手只会让错误更难查。
 */
const VERSION = "__VERSION_TOKEN__";
const PRECACHE = __PRECACHE_TOKEN__;
const CACHE = `gacha-shell-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll 是原子的：任何一个 URL 404 都会让 install 失败，
      // 所以预缓存清单由构建脚本按 dist 实际文件生成，不允许手写。
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

/** 网络优先，失败回退缓存 */
async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(fallbackKey ?? request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(fallbackKey ?? request);
    if (cached) return cached;
    throw new Error("offline and no cache");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 开发服务器上的抓取代理不属于生产形态，直接放行
  if (url.pathname.startsWith("/__")) return;

  // 页面导航
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(request, new URL("./index.html", self.registration.scope).href);
        } catch {
          return new Response("离线且无缓存，请连网后重试。", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" }
          });
        }
      })()
    );
    return;
  }

  // 数据文件：时效性优先
  if (url.pathname.endsWith("/data/latest.json")) {
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(request);
        } catch {
          return new Response("{}", { status: 503, headers: { "content-type": "application/json" } });
        }
      })()
    );
    return;
  }

  // 其它同源静态资源：缓存优先
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    })()
  );
});
