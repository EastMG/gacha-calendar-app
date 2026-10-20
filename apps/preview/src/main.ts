/**
 * 预览入口：装配数据层 → 渲染 → 交互。
 *
 * 这里**没有任何框架**：一个 render() 把状态画成 DOM，标签栏切换即重画。
 * 目的不是做成产品 UI，而是让"数据层 + 信息架构"今天就能在浏览器里被验证。
 */
import {
  createAppEngine,
  createLocalStorage
} from "../../../packages/core-bridge/src/index.ts";
import type { GameMetaLike, ResultLike } from "../../../packages/schedule/src/index.ts";
import { createProxyHttpClient } from "./http-browser.ts";
import { clear, h } from "./ui.ts";
import { renderCalendar, renderData, renderGames, renderToday, renderTopbar, type ViewContext } from "./views.ts";

type Tab = "today" | "calendar" | "games" | "data";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "today", label: "今天", icon: "◉" },
  { id: "calendar", label: "日程", icon: "▤" },
  { id: "games", label: "游戏", icon: "▦" },
  { id: "data", label: "数据", icon: "◍" }
];

interface AppState {
  tab: Tab;
  result: ResultLike | null;
  metas: GameMetaLike[];
  source: "live" | "snapshot";
  refreshedAt: number | null;
  refreshing: boolean;
  error: string | null;
}

const state: AppState = {
  tab: "today",
  result: null,
  metas: [],
  source: "snapshot",
  refreshedAt: null,
  refreshing: false,
  error: null
};

const scrollMemory = new Map<Tab, number>();

const { engine } = createAppEngine({
  http: createProxyHttpClient(),
  storage: createLocalStorage()
});

/** 读内置快照（离线也能看到完整版式） */
async function loadSnapshot(): Promise<ResultLike & { refreshedAt: number }> {
  const response = await fetch("/__fixture");
  if (!response.ok) throw new Error(`快照不可用（HTTP ${response.status}）`);
  return (await response.json()) as ResultLike & { refreshedAt: number };
}

function countOk(result: ResultLike): number {
  return Object.values(result.games ?? {}).filter((g) => g && (g.banner || g.event)).length;
}

/** 实时刷新：失败不影响已显示的快照，只把原因写进顶栏 */
async function refresh(): Promise<void> {
  if (state.refreshing) return;
  state.refreshing = true;
  state.error = null;
  render();
  try {
    const fresh = await engine.refresh();
    const ok = countOk(fresh);
    if (ok > 0) {
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
        h("span", { class: "ico" }, tab.icon),
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

  const now = Date.now();
  const ctx: ViewContext = {
    result: state.result ?? {},
    metas: state.metas,
    now,
    refreshedAt: state.refreshedAt,
    source: state.source,
    refreshing: state.refreshing,
    error: state.error
  };

  app.append(renderTopbar(ctx, () => void refresh()));

  const main = h("main", { class: "view" });
  if (!state.result) {
    main.append(h("div", { class: "hint" }, "正在装载数据…"));
  } else {
    main.append(currentView(ctx));
  }
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

  // 1) 优先用上次缓存（立即出图）
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
    /* 缓存坏了就忽略，下面用快照兜底 */
  }

  // 2) 没有缓存则用内置快照
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

  // 3) 后台实时刷新（不阻塞首屏）
  void refresh();

  // 4) 每 30 秒重画一次，让倒计时走动
  globalThis.setInterval(() => {
    if (!state.refreshing) render();
  }, 30_000);
}

void boot();
