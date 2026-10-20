/**
 * 预览入口：装配数据层 → 渲染 → 交互。
 *
 * 这里**没有任何框架**：一个 render() 把状态画成 DOM，标签栏切换即重画。
 * 目的不是做成产品 UI，而是让"数据层 + 信息架构"今天就能在浏览器里被验证。
 */
import {
  createAppEngine,
  createLocalStorage,
  readGameColors
} from "../../../packages/core-bridge/src/index.ts";
import type { GameMetaLike, ResultLike } from "../../../packages/schedule/src/index.ts";
import { createProxyHttpClient } from "./http-browser.ts";
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

interface AppState {
  tab: Tab;
  result: ResultLike | null;
  metas: GameMetaLike[];
  source: "live" | "snapshot";
  refreshedAt: number | null;
  refreshing: boolean;
  error: string | null;
  gameColors: Record<string, string>;
}

const state: AppState = {
  tab: "today",
  result: null,
  metas: [],
  source: "snapshot",
  refreshedAt: null,
  refreshing: false,
  error: null,
  gameColors: {}
};

/** 展开状态单独存：30 秒重画一次时不希望用户刚展开的卡又收回去 */
const expanded = new Set<string>();
const scrollMemory = new Map<Tab, number>();

const storage = createLocalStorage();
const { engine } = createAppEngine({
  http: createProxyHttpClient(),
  storage
});

async function loadSnapshot(): Promise<ResultLike & { refreshedAt: number }> {
  const response = await fetch("/__fixture");
  if (!response.ok) throw new Error(`快照不可用（HTTP ${response.status}）`);
  return (await response.json()) as ResultLike & { refreshedAt: number };
}

function countOk(result: ResultLike): number {
  return Object.values(result.games ?? {}).filter((g) => g && (g.banner || g.event)).length;
}

async function refresh(): Promise<void> {
  if (state.refreshing) return;
  state.refreshing = true;
  state.error = null;
  render();
  try {
    const fresh = await engine.refresh();
    if (countOk(fresh) > 0) {
      state.result = fresh;
      state.refreshedAt = fresh.refreshedAt;
      state.source = "live";
    } else {
      state.error = "实时抓取全部失败。预览的实时模式依赖 npm run dev 提供的开发代理。";
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

  const ctx: ViewContext = {
    result: state.result ?? {},
    metas: state.metas,
    now: Date.now(),
    refreshedAt: state.refreshedAt,
    source: state.source,
    refreshing: state.refreshing,
    error: state.error,
    gameColors: state.gameColors,
    expanded,
    onToggle: (key: string) => {
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      render();
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

async function boot(): Promise<void> {
  try {
    const metas = await engine.listGames();
    state.metas = metas.map((m) => ({ id: m.id, name: m.name }));
  } catch (error) {
    state.error = `引擎初始化失败：${error instanceof Error ? error.message : String(error)}`;
  }

  // 用户在各端设过的主题色（与桌面插件同一个键）
  state.gameColors = await readGameColors(storage).catch(() => ({}));

  let painted = false;
  try {
    const cached = await engine.getCached();
    if (cached.games && Object.keys(cached.games).length > 0) {
      state.result = cached;
      state.refreshedAt = cached.refreshedAt;
      state.source = "live";
      painted = true;
    }
  } catch {
    /* 缓存坏了就忽略 */
  }

  if (!painted) {
    try {
      const snapshot = await loadSnapshot();
      state.result = snapshot;
      state.refreshedAt = snapshot.refreshedAt;
      state.source = "snapshot";
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    }
  }

  render();
  void refresh();

  globalThis.setInterval(() => {
    if (!state.refreshing) render();
  }, 30_000);
}

void boot();
