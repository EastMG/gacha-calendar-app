/**
 * 预览 / PWA 入口：装配数据层 → 渲染 → 交互。
 *
 * ## 三层数据来源（按优先级）
 *
 * 1. `./data/latest.json` —— 构建期快照（GitHub Actions 定时抓取）。
 *    **同源**，没有 CORS 问题，离线也有一份可用数据。
 * 2. `/__gacha_proxy` —— 开发服务器的抓取代理。**只有本地开发能实时刷新**，
 *    因为浏览器受 CORS 约束，静态托管不可能直连 28 个源站。
 * 3. `/__fixture` —— 开发模式的兜底。
 *
 * 所以「实时」这个能力只在开发模式出现；线上 PWA 的时效性由 CI 的重新部署保证。
 */
import {
  createAppEngine,
  createLocalStorage,
  readGameColors
} from "../../../packages/core-bridge/src/index.ts";
import type { GameMetaLike, ResultLike } from "../../../packages/schedule/src/index.ts";
import { createProxyHttpClient } from "./http-browser.ts";
import { applyTheme, PLATFORM_ORDER, type Platform } from "./design.ts";
import { ICONS } from "./theme.ts";
import { clear, h } from "./ui.ts";
import { renderCalendar, renderData, renderGames, renderToday, renderTopbar, type ViewContext } from "./views.ts";

type Tab = "today" | "calendar" | "games" | "data";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "today", label: "今天" },
  { id: "calendar", label: "日程" },
  { id: "games", label: "游戏" },
  { id: "data", label: "数据" }
];

const PLATFORM_KEY = "preview.platform";

/**
 * 抓取代理只在**开发服务器**上存在；静态托管（GitHub Pages）没有。
 *
 * 不能用 hostname 猜 —— 产物模式同样可能跑在 127.0.0.1，那样会误判并打出一片 404。
 * 也不要去探测 `/__gacha_proxy` 本身，那必然在控制台留下一条 404。
 * 改为看开发服务器在响应头上打的标记。
 */
let canLiveRefresh = false;

async function detectProxy(): Promise<boolean> {
  try {
    const response = await fetch("./manifest.webmanifest", { cache: "no-store" });
    return response.headers.get("x-gacha-proxy") === "1";
  } catch {
    return false;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readPlatform(): Platform {
  const stored = globalThis.localStorage?.getItem(PLATFORM_KEY);
  return PLATFORM_ORDER.includes(stored as Platform) ? (stored as Platform) : "ios";
}

interface SnapshotPayload extends ResultLike {
  refreshedAt: number;
  meta?: { generatedAt?: string; okCount?: number; total?: number };
}

interface AppState {
  tab: Tab;
  result: SnapshotPayload | null;
  metas: GameMetaLike[];
  source: "live" | "snapshot";
  refreshedAt: number | null;
  /** 快照的生成时间（CI 抓取时刻），与 refreshedAt 可能不同 */
  snapshotGeneratedAt: number | null;
  refreshing: boolean;
  error: string | null;
  gameColors: Record<string, string>;
  platform: Platform;
  canInstall: boolean;
  installed: boolean;
}

const state: AppState = {
  tab: "today",
  result: null,
  metas: [],
  source: "snapshot",
  refreshedAt: null,
  snapshotGeneratedAt: null,
  refreshing: false,
  error: null,
  gameColors: {},
  platform: readPlatform(),
  canInstall: false,
  installed: globalThis.matchMedia?.("(display-mode: standalone)").matches ?? false
};

const expanded = new Set<string>();
const scrollMemory = new Map<Tab, number>();

const storage = createLocalStorage();
const { engine } = createAppEngine({ http: createProxyHttpClient(), storage });

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/** 依次尝试构建期快照与开发兜底端点 */
async function loadBundledData(): Promise<SnapshotPayload | null> {
  const candidates = ["./data/latest.json", "/__fixture"];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) continue;
      const payload = (await response.json()) as SnapshotPayload;
      if (payload.games && Object.keys(payload.games).length > 0) return payload;
    } catch {
      /* 换下一个 */
    }
  }
  return null;
}

function countOk(result: ResultLike): number {
  return Object.values(result.games ?? {}).filter((g) => g && (g.banner || g.event)).length;
}

async function refresh(): Promise<void> {
  if (state.refreshing) return;
  if (!canLiveRefresh) {
    state.error = null;
    render();
    return;
  }
  state.refreshing = true;
  state.error = null;
  render();
  try {
    const fresh = await engine.refresh();
    if (countOk(fresh) > 0) {
      state.result = { ...fresh } as SnapshotPayload;
      state.refreshedAt = fresh.refreshedAt;
      state.source = "live";
      state.snapshotGeneratedAt = null;
    } else {
      state.error = "实时抓取全部失败，已保留快照数据。";
    }
  } catch (error) {
    state.error = `刷新失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    state.refreshing = false;
    render();
  }
}

function currentView(ctx: ViewContext): HTMLElement {
  switch (state.tab) {
    case "today":
      return renderToday(ctx);
    case "calendar":
      return renderCalendar(ctx);
    case "games":
      return renderGames(ctx);
    case "data":
      return renderData(ctx);
  }
}

function renderTabbar(): HTMLElement {
  const bar = h("nav", { class: "tabbar" });
  for (const tab of TABS) {
    bar.append(
      h(
        "button",
        {
          class: `tab ${state.tab === tab.id ? "active" : ""}`,
          onClick: () => {
            if (state.tab === tab.id) return;
            state.tab = tab.id;
            render();
          }
        },
        h("span", { class: "ico", html: ICONS[tab.id] }),
        h("span", {}, tab.label)
      )
    );
  }
  return bar;
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;

  const previousView = app.querySelector(".view");
  if (previousView) scrollMemory.set(state.tab, previousView.scrollTop);

  clear(app);
  applyTheme(app, state.platform);

  const ctx: ViewContext = {
    result: state.result ?? {},
    metas: state.metas,
    now: Date.now(),
    refreshedAt: state.refreshedAt,
    snapshotGeneratedAt: state.snapshotGeneratedAt,
    source: state.source,
    refreshing: state.refreshing,
    error: state.error,
    gameColors: state.gameColors,
    expanded,
    onToggle: (key: string) => {
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      render();
    },
    platform: state.platform,
    onPlatform: (platform: Platform) => {
      if (state.platform === platform) return;
      state.platform = platform;
      globalThis.localStorage?.setItem(PLATFORM_KEY, platform);
      render();
    },
    canLiveRefresh,
    canInstall: state.canInstall && !state.installed,
    installed: state.installed,
    onInstall: () => {
      void (async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        state.canInstall = false;
        render();
      })();
    }
  };

  app.append(renderTopbar(ctx, () => void refresh()));

  const main = h("main", { class: "view" });
  main.append(state.result ? currentView(ctx) : h("div", { class: "empty" }, "正在装载数据…"));
  app.append(main);
  app.append(renderTabbar());

  const remembered = scrollMemory.get(state.tab) ?? 0;
  if (remembered > 0) main.scrollTop = remembered;
}

/** 只有真正存在 sw.js 时才注册 —— 开发模式没有这个文件，避免控制台报错 */
async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const probe = await fetch("./sw.js", { method: "HEAD", cache: "no-store" });
    if (!probe.ok) return;
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    /* 注册失败不影响使用 */
  }
}

function wireInstallPrompt(): void {
  globalThis.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    state.canInstall = true;
    render();
  });
  globalThis.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    state.canInstall = false;
    state.installed = true;
    render();
  });
}

async function boot(): Promise<void> {
  wireInstallPrompt();
  canLiveRefresh = await detectProxy();

  try {
    const metas = await engine.listGames();
    state.metas = metas.map((m) => ({ id: m.id, name: m.name }));
  } catch (error) {
    state.error = `引擎初始化失败：${error instanceof Error ? error.message : String(error)}`;
  }

  state.gameColors = await readGameColors(storage).catch(() => ({}));

  // 1) 优先用开发模式下的上次缓存（立即出图）
  let painted = false;
  if (canLiveRefresh) {
    try {
      const cached = await engine.getCached();
      if (cached.games && Object.keys(cached.games).length > 0) {
        state.result = cached;
        state.refreshedAt = cached.refreshedAt;
        state.source = "live";
        painted = true;
      }
    } catch {
      /* 缓存坏了就用快照 */
    }
  }

  // 2) 构建期快照（线上唯一来源）
  if (!painted) {
    const snapshot = await loadBundledData();
    if (snapshot) {
      state.result = snapshot;
      state.refreshedAt = snapshot.refreshedAt;
      state.snapshotGeneratedAt = snapshot.meta?.generatedAt ? Date.parse(snapshot.meta.generatedAt) : null;
      state.source = "snapshot";
    } else {
      state.error = "没有可用数据：构建产物缺少 data/latest.json。";
    }
  }

  render();

  // 3) 开发模式才自动实时刷新
  if (canLiveRefresh) void refresh();

  // 4) 每 30 秒重画，让倒计时走动
  globalThis.setInterval(() => {
    if (!state.refreshing) render();
  }, 30_000);

  void registerServiceWorker();
}

void boot();
