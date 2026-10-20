/**
 * transport 契约测试。
 *
 * 这里守的是"最容易静默失败"的几件事：
 *  · `fetchViaProxy` 必须返回**字符串**（返回对象不会报错，但会让每款游戏都变成「抓取异常」）
 *  · 非 2xx 必须抛 `http-<code>`（core 的 normErr 靠这个形状把 403/567 如实透给用户）
 *  · 默认带 UA 与 Referer，且**允许覆盖**（bwiki 缺 Referer 回 567；wiki.gg 反拦浏览器 UA）
 *  · 超时必须抛 AbortError 形状，而不是一个泛化错
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTransport } from "../src/transport.ts";
import type { HttpClient, HttpRequest } from "../src/http.ts";

interface Captured {
  request: HttpRequest;
}

function fakeHttp(
  handler: (req: HttpRequest) => { status: number; text: string } | Promise<{ status: number; text: string }>
): { http: HttpClient; captured: Captured[] } {
  const captured: Captured[] = [];
  const http: HttpClient = async (request) => {
    captured.push({ request });
    return handler(request);
  };
  return { http, captured };
}

describe("transport.fetchRaw", () => {
  it("返回类 Response 形状，带默认 UA 与 Accept", async () => {
    const { http, captured } = fakeHttp(() => ({ status: 200, text: '{"ok":1}' }));
    const transport = createTransport({ http });

    const res = await transport.fetchRaw("https://example.com/api");
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '{"ok":1}');
    assert.deepEqual(await res.json(), { ok: 1 });

    const headers = captured[0]!.request.headers;
    assert.ok(headers["User-Agent"]?.includes("Mozilla/5.0"), "必须带默认桌面 UA");
    assert.equal(headers.Accept, "*/*");
  });

  it("调用方给的 UA 优先（wiki.gg 要求非浏览器 UA）", async () => {
    const { http, captured } = fakeHttp(() => ({ status: 200, text: "" }));
    const transport = createTransport({ http });
    await transport.fetchRaw("https://example.com", { headers: { "user-agent": "gacha-calendar-app/1.0" } });
    const uaEntry = Object.entries(captured[0]!.request.headers).find(([k]) => k.toLowerCase() === "user-agent");
    assert.equal(uaEntry?.[1], "gacha-calendar-app/1.0");
  });

  it("非 2xx 不抛错，而是把 ok/status 如实交给 core", async () => {
    const { http } = fakeHttp(() => ({ status: 403, text: "forbidden" }));
    const transport = createTransport({ http });
    const res = await transport.fetchRaw("https://example.com");
    assert.equal(res.ok, false);
    assert.equal(res.status, 403);
  });

  it("json() 解析失败抛 bad-json（不要漏出原生 SyntaxError）", async () => {
    const { http } = fakeHttp(() => ({ status: 200, text: "<html>not json</html>" }));
    const transport = createTransport({ http });
    const res = await transport.fetchRaw("https://example.com");
    await assert.rejects(() => res.json(), /bad-json/);
  });
});

describe("transport.fetchViaProxy", () => {
  it("返回目标站原始 body **字符串**（不是对象）", async () => {
    const { http } = fakeHttp(() => ({ status: 200, text: '{"content":"x"}' }));
    const transport = createTransport({ http });
    const body = await transport.fetchViaProxy("https://example.com/api", { referer: "https://example.com/" });
    assert.equal(typeof body, "string");
    assert.equal(body, '{"content":"x"}');
  });

  it("把 referer 透传到请求头（部分源站校验它）", async () => {
    const { http, captured } = fakeHttp(() => ({ status: 200, text: "" }));
    const transport = createTransport({ http });
    await transport.fetchViaProxy("https://bbs.example.com/api", { referer: "https://zzz.example.com/" });
    assert.equal(captured[0]!.request.headers.Referer, "https://zzz.example.com/");
  });

  it("非 2xx 抛 http-<code>（core 的 normErr 靠这个形状显示「HTTP 403」）", async () => {
    const { http } = fakeHttp(() => ({ status: 403, text: "blocked" }));
    const transport = createTransport({ http });
    await assert.rejects(() => transport.fetchViaProxy("https://example.com"), /^Error: http-403$/);
  });

  it("有 body 时用 POST 并原样带上 body", async () => {
    const { http, captured } = fakeHttp(() => ({ status: 200, text: "{}" }));
    const transport = createTransport({ http });
    await transport.fetchViaProxy("https://example.com/api", { body: '{"a":1}' });
    assert.equal(captured[0]!.request.method, "POST");
    assert.equal(captured[0]!.request.body, '{"a":1}');
  });

  it("无 body 时用 GET", async () => {
    const { http, captured } = fakeHttp(() => ({ status: 200, text: "" }));
    const transport = createTransport({ http });
    await transport.fetchViaProxy("https://example.com/api");
    assert.equal(captured[0]!.request.method, "GET");
    assert.equal(captured[0]!.request.body, undefined);
  });

  it("对象 body 会被 JSON 序列化（core 可能传对象）", async () => {
    const { http, captured } = fakeHttp(() => ({ status: 200, text: "" }));
    const transport = createTransport({ http });
    await transport.fetchViaProxy("https://example.com/api", { body: { a: 1 } });
    assert.equal(captured[0]!.request.body, '{"a":1}');
  });

  it("响应体超过上限时拒绝（防移动端内存被打爆）", async () => {
    const { http } = fakeHttp(() => ({ status: 200, text: "x".repeat(2048) }));
    const transport = createTransport({ http, maxBytes: 1024 });
    await assert.rejects(() => transport.fetchViaProxy("https://example.com"), /response too large/);
  });
});

describe("错误形状", () => {
  it("网络失败 → 消息含 network error（core 据此显示「网络不通」）", async () => {
    const http: HttpClient = async () => {
      throw new TypeError("fetch failed");
    };
    const transport = createTransport({ http });
    await assert.rejects(
      () => transport.fetchViaProxy("https://example.com"),
      (err: Error) => /network error/i.test(err.message)
    );
  });

  it("超时 → AbortError（core 据此显示「超时」而不是泛化的「抓取异常」）", async () => {
    // 模拟一个只认 signal 的请求器：永不返回，等被 abort
    const http: HttpClient = (request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    const transport = createTransport({ http, timeoutMs: 20 });
    await assert.rejects(
      () => transport.fetchViaProxy("https://example.com"),
      (err: Error) => err.name === "AbortError"
    );
  });
});
