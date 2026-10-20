/**
 * 平台无关的 HTTP 抽象。
 *
 * `core-bridge` 不自己发请求：**谁来发、怎么发**由各端壳决定
 * （预览用浏览器 fetch / Node 测试用 Node fetch / 将来 RN 用原生模块）。
 * 这里只定义"能设任意 header 的请求"这一能力本身 —— 而这正是 core 需要的全部。
 */

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export type HttpClient = (request: HttpRequest) => Promise<HttpResponse>;

/** 与 dsh-gacha-calendar / 浏览器扩展一致的桌面 UA。部分源站（wiki.gg 等）会校验它。 */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 默认单请求超时（上游刷新总预算是 20s，单请求 15s 留出余量） */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** 默认响应体上限，防御异常大页面把移动端内存打爆 */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export function createAbortError(message = "timeout"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  const message = (err as { message?: unknown }).message;
  return name === "AbortError" || (typeof message === "string" && /abort/i.test(message));
}

/**
 * 网络层失败 → core 能识别的错误形状。
 *
 * ⚠️ 这是最容易踩的坑：core 的 `normErr` 只认几种消息形状
 * （`AbortError` / `http-<code>` / `bad-json` / 含 "network error" 等），
 * 其它一律压成泛化的「抓取异常」，用户看不出是网断了还是源站挂了。
 */
export function toNetworkError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  return new Error(`network error: ${raw}`);
}

/** 带超时的请求执行器；同时兼顾客端传入的 signal。 */
export async function requestWithTimeout(
  http: HttpClient,
  request: HttpRequest,
  timeoutMs: number
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = (): void => controller.abort();
  if (request.signal) {
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", forwardAbort, { once: true });
  }
  try {
    return await http({ ...request, signal: controller.signal });
  } catch (err) {
    if (isAbortError(err) || controller.signal.aborted) throw createAbortError();
    throw toNetworkError(err);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", forwardAbort);
  }
}
