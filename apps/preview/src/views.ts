/**
 * 四个视图：今天 / 日程 / 游戏 / 数据。
 *
 * 视觉上的两个关键决定：
 *  1. **按「游戏 + 结束时刻」归组**。实测同一款游戏常有 6–8 条活动在同一秒结束，
 *     逐条渲染会变成一堵重复的墙；归组后一张卡代表"这款游戏这批东西什么时候结束"，
 *     点开才展开明细。
 *  2. **颜色只用来标识游戏，不用来铺满背景**。危险色只出现在倒计时数字上，
 *     否则整个页面都是红的， urgency 反而失效。
 */
import {
  bucket,
  formatEventWindow,
  formatRelative,
  formatRemaining,
  formatTzBadge,
  formatUntil,
  instantToWall,
  planReminders,
  toEvents,
  toGameViews,
  type GameMetaLike,
  type GameView,
  type Precision,
  type ResultLike,
  type ScheduleEvent
} from "../../../packages/schedule/src/index.ts";
import { ICONS, gameColor } from "./theme.ts";
import { PLATFORM_ORDER, PLATFORMS, type Platform } from "./design.ts";
import { h, type Child } from "./ui.ts";

export interface ViewContext {
  result: ResultLike;
  metas: GameMetaLike[];
  now: number;
  refreshedAt: number | null;
  /** 快照的生成时刻（CI 抓取时间）；实时模式下为 null */
  snapshotGeneratedAt: number | null;
  source: "live" | "snapshot";
  refreshing: boolean;
  error: string | null;
  gameColors: Record<string, string>;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  platform: Platform;
  onPlatform: (platform: Platform) => void;
  /** 只有本地开发服务器才有抓取代理 */
  canLiveRefresh: boolean;
  canInstall: boolean;
  installed: boolean;
  onInstall: () => void;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/** 同款游戏 + 同一结束时刻 → 一组 */
interface EventGroup {
  key: string;
  gameId: string;
  gameName: string;
  endAt: number;
  tzMin: number;
  kinds: Set<ScheduleEvent["kind"]>;
  precision: Precision;
  events: ScheduleEvent[];
}

function groupEvents(events: readonly ScheduleEvent[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const event of events) {
    const key = `${event.gameId}|${event.endAt}`;
    const existing = map.get(key);
    if (existing) {
      existing.events.push(event);
      existing.kinds.add(event.kind);
      if (event.precision === "day") existing.precision = "day";
    } else {
      map.set(key, {
        key,
        gameId: event.gameId,
        gameName: event.gameName,
        endAt: event.endAt,
        tzMin: event.tzMin,
        kinds: new Set([event.kind]),
        precision: event.precision,
        events: [event]
      });
    }
  }
  for (const group of map.values()) group.events.sort((a, b) => a.startAt - b.startAt);
  return [...map.values()].sort((a, b) => a.endAt - b.endAt);
}

const KIND_TEXT: Record<ScheduleEvent["kind"], string> = { gacha: "卡池", event: "活动" };

/** 「第一批标题 等 N 项」 */
function groupTitle(group: EventGroup): string {
  const first = group.events[0];
  if (!first) return "";
  const primary = group.events.find((e) => e.origin === "primary") ?? first;
  if (group.events.length === 1) return primary.title;
  return `${primary.title} 等 ${group.events.length} 项`;
}

function gameDot(color: string, size = 7): HTMLElement {
  return h("span", { class: "game-dot", style: { background: color, width: `${size}px`, height: `${size}px` } });
}

/** 一张组卡片 */
function groupCard(group: EventGroup, ctx: ViewContext, tone: "ending" | "upcoming" | "normal"): HTMLElement {
  const color = gameColor(group.gameId, ctx.gameColors);
  const isMulti = group.events.length > 1;
  const expanded = ctx.expanded.has(group.key);
  const remain = group.endAt - ctx.now;

  const remainTone =
    tone === "ending" ? "urgent" : remain <= 24 * HOUR ? "soon" : remain <= 3 * DAY ? "near" : "";

  const badges: Child[] = [];
  for (const kind of group.kinds) badges.push(h("span", { class: `badge ${kind}` }, KIND_TEXT[kind]));
  if (isMulti) badges.push(h("span", { class: "badge count" }, `${group.events.length} 项`));

  const head = h(
    "div",
    { class: "card-head" },
    gameDot(color),
    h("span", { class: "game" }, group.gameName),
    ...badges,
    isMulti ? h("span", { class: `chev ${expanded ? "open" : ""}`, html: ICONS.chevron }) : null
  );

  const title = h("div", { class: "card-title" }, groupTitle(group));

  const foot = h(
    "div",
    { class: "card-foot" },
    h("span", { class: "range" }, formatEventWindow(group.events[0]!)),
    h("span", { class: `remain ${remainTone}` }, formatRemaining(remain, group.precision))
  );

  const body = h("div", { class: "card-body" }, head, title, foot);

  if (expanded) {
    const list = h("ul", { class: "sublist" });
    for (const event of group.events) {
      // 组内所有事件同一时刻结束，倒计时必然相同 —— 在这里重复只会变成噪声，
      // 改成显示"它是什么"（卡池/活动）与精度例外情况。
      list.append(
        h(
          "li",
          {},
          h("span", { class: "sl-title" }, event.title),
          h("span", { class: "sl-kind" }, event.kindLabel),
          event.precision === "day" ? h("span", { class: "sl-tag" }, "仅日期") : null
        )
      );
    }
    body.append(list);
  }

  const card = h(
    "article",
    {
      class: `card ${isMulti ? "multi" : ""} ${expanded ? "expanded" : ""}`.trim(),
      ...(isMulti ? { onClick: () => ctx.onToggle(group.key) } : {})
    },
    h("span", { class: "stripe", style: { background: color } }),
    body
  );

  if (tone === "ending") card.dataset["tone"] = "ending";
  return card;
}

function section(
  title: string,
  events: readonly ScheduleEvent[],
  ctx: ViewContext,
  tone: "ending" | "upcoming" | "normal",
  emptyHint: string
): HTMLElement {
  const groups = groupEvents(events);
  const head = h(
    "div",
    { class: "sec-head" },
    h("span", { class: `sec-mark ${tone}` }),
    h("h2", { class: "sec-title" }, title),
    h("span", { class: "sec-count" }, String(events.length)),
    h("span", { class: "sec-rule" })
  );
  const wrap = h("section", { class: "section" }, head);
  if (groups.length === 0) {
    wrap.append(h("div", { class: "empty" }, emptyHint));
    return wrap;
  }
  for (const group of groups) wrap.append(groupCard(group, ctx, tone));
  return wrap;
}

function todayLabel(now: number): string {
  const d = new Date(now);
  const weekday = WEEKDAYS[d.getDay()] ?? "";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekday}`;
}

export function renderToday(ctx: ViewContext): HTMLElement {
  const events = toEvents(ctx.result, ctx.metas, ctx.now);
  const b = bucket(events, ctx.now);
  const wrap = h("div", {});
  if (b.ending.length === 0 && b.ongoing.length === 0 && b.upcoming.length === 0) {
    wrap.append(h("div", { class: "empty" }, "当前没有可展示的事件：可能抓取全部失败，或本期数据尚未公布。"));
    return wrap;
  }
  wrap.append(
    section("即将结束", b.ending, ctx, "ending", "72 小时内没有要结束的卡池 / 活动"),
    section("进行中", b.ongoing, ctx, "normal", "暂无进行中的卡池 / 活动"),
    section("即将开启", b.upcoming, ctx, "upcoming", "14 天内没有新开启的卡池 / 活动")
  );
  return wrap;
}

export function renderCalendar(ctx: ViewContext): HTMLElement {
  const events = toEvents(ctx.result, ctx.metas, ctx.now);
  const alive = events.filter((e) => e.endAt >= ctx.now && e.endAt - ctx.now <= 30 * DAY);

  const byDay = new Map<string, ScheduleEvent[]>();
  for (const e of alive) {
    const w = instantToWall(e.endAt, e.tzMin);
    const key = `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
    const list = byDay.get(key);
    if (list) list.push(e);
    else byDay.set(key, [e]);
  }

  const wrap = h("div", {});
  wrap.append(h("div", { class: "note" }, "按结束日排列，同一游戏同刻结束的合并成一行。"));

  const keys = [...byDay.keys()].sort();
  if (keys.length === 0) {
    wrap.append(h("div", { class: "empty" }, "未来 30 天内没有结束事件。"));
    return wrap;
  }

  for (const key of keys) {
    const list = (byDay.get(key) ?? []).sort((a, b) => a.endAt - b.endAt);
    const first = list[0]!;
    const w = instantToWall(first.endAt, first.tzMin);
    const weekday = WEEKDAYS[new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay()] ?? "";
    const groups = groupEvents(list);

    wrap.append(
      h(
        "div",
        { class: "day-head" },
        h("span", { class: "day-num" }, String(w.d).padStart(2, "0")),
        h("span", { class: "day-meta" }, `${w.mo}月 · ${weekday}`),
        h("span", { class: "day-when" }, formatUntil(first.endAt, ctx.now)),
        h("span", { class: "day-count" }, `${list.length} 项`)
      )
    );

    for (const group of groups) {
      const color = gameColor(group.gameId, ctx.gameColors);
      const isMulti = group.events.length > 1;
      wrap.append(
        h(
          "div",
          { class: "cal-row" },
          h("span", { class: "cal-time" }, group.precision === "day" ? "—" : formatClock(group.endAt, group.tzMin)),
          gameDot(color, 6),
          h("span", { class: "cal-name" }, isMulti ? `${groupTitle(group)}` : group.events[0]!.title),
          h("span", { class: "cal-game", title: group.gameName }, group.gameName)
        )
      );
    }
  }
  return wrap;
}

function formatClock(ts: number, tzMin: number): string {
  const w = instantToWall(ts, tzMin);
  return `${String(w.h).padStart(2, "0")}:${String(w.mi).padStart(2, "0")}`;
}

const STATE_TEXT: Record<GameView["gachaState"], string> = {
  ok: "正常",
  nomatch: "未公布",
  down: "失败",
  empty: "无数据"
};

export function renderGames(ctx: ViewContext): HTMLElement {
  const views = toGameViews(ctx.result, ctx.metas, ctx.now);
  const events = toEvents(ctx.result, ctx.metas, ctx.now);
  const primaryByGame = new Map<string, ScheduleEvent[]>();
  for (const e of events) {
    if (e.origin !== "primary") continue;
    const list = primaryByGame.get(e.gameId);
    if (list) list.push(e);
    else primaryByGame.set(e.gameId, [e]);
  }

  const wrap = h("div", {});
  const okCount = views.filter((v) => v.gachaState === "ok" || v.eventState === "ok").length;
  wrap.append(h("div", { class: "note" }, `${views.length} 款游戏 · ${okCount} 款有当期数据`));

  for (const view of views) {
    const color = gameColor(view.id, ctx.gameColors);
    const gacha = (primaryByGame.get(view.id) ?? []).find((e) => e.kind === "gacha");
    const current = gacha ? gacha.title : (view.gachaFail?.reason ?? "当期数据未获取到");
    const state = view.gachaState === "ok" || view.gachaState === "nomatch" ? view.gachaState : view.gachaState;

    wrap.append(
      h(
        "div",
        { class: "game-row" },
        h("span", { class: "game-bar", style: { background: color } }),
        h(
          "div",
          { class: "game-body" },
          h("div", { class: "game-name-row" }, h("span", { class: "game-name" }, view.name), h("span", { class: `state-pill ${state}` }, STATE_TEXT[view.gachaState])),
          h("div", { class: "game-current" }, current)
        ),
        gacha
          ? h(
              "div",
              { class: "game-side" },
              h("span", { class: "game-remain" }, formatRemaining(gacha.endAt - ctx.now, gacha.precision))
            )
          : null
      )
    );
  }
  return wrap;
}

export function renderData(ctx: ViewContext): HTMLElement {
  const events = toEvents(ctx.result, ctx.metas, ctx.now);
  const primary = events.filter((e) => e.origin === "primary");
  const detail = events.filter((e) => e.origin === "detail");
  const views = toGameViews(ctx.result, ctx.metas, ctx.now);
  const reminders = planReminders(events, ctx.now, { leadMinutes: 60, horizonDays: 7, maxPerGame: 1 });

  const failures: string[] = [];
  for (const v of views) {
    if (v.gachaFail) failures.push(`${v.name} · 卡池 · ${v.gachaFail.kind === "nomatch" ? "本期未公布" : `失败（${v.gachaFail.reason ?? "未知"}）`}`);
    if (v.eventFail) failures.push(`${v.name} · 活动 · ${v.eventFail.kind === "nomatch" ? "本期未公布" : `失败（${v.eventFail.reason ?? "未知"}）`}`);
  }

  const wrap = h("div", {});
  wrap.append(
    h(
      "div",
      { class: "stat-grid" },
      statCard(String(events.length), "事件总数"),
      statCard(String(primary.length), "当期主事件"),
      statCard(String(detail.length), "明细展开"),
      statCard(String(new Set(events.map((e) => e.gameId)).size), "覆盖游戏")
    )
  );

  wrap.append(
    h(
      "section",
      { class: "section" },
      h("div", { class: "sec-head" }, h("span", { class: "sec-mark" }), h("h2", { class: "sec-title" }, "抓取状态"), h("span", { class: "sec-rule" })),
      kv("数据源", ctx.source === "live" ? "实时抓取" : "内置快照"),
      kv("更新时间", ctx.refreshedAt ? formatRelative(ctx.refreshedAt, ctx.now) : "尚未更新"),
      kv("异常条目", failures.length > 0 ? `${failures.length} 项` : "无")
    )
  );

  if (failures.length > 0) {
    const box = h("section", { class: "section" }, h("div", { class: "sec-head" }, h("span", { class: "sec-mark" }), h("h2", { class: "sec-title" }, "失败明细"), h("span", { class: "sec-count" }, String(failures.length)), h("span", { class: "sec-rule" })));
    for (const line of failures.slice(0, 12)) box.append(h("div", { class: "fail-item" }, line));
    wrap.append(box);
  }

  const remBox = h(
    "section",
    { class: "section" },
    h("div", { class: "sec-head" }, h("span", { class: "sec-mark" }), h("h2", { class: "sec-title" }, "提醒计划"), h("span", { class: "sec-count" }, String(reminders.length)), h("span", { class: "sec-rule" }))
  );
  remBox.append(h("div", { class: "note" }, "纯本地计算，壳只需把每条注册成系统通知，不需要推送服务器。"));
  for (const r of reminders.slice(0, 6)) {
    remBox.append(
      h(
        "div",
        { class: "reminder" },
        h("span", { class: "rem-when" }, formatUntil(r.at, ctx.now)),
        h("span", { class: "rem-text" }, `${r.gameName} · ${r.kind === "gacha" ? "卡池" : "活动"}即将结束`)
      )
    );
  }
  if (reminders.length === 0) remBox.append(h("div", { class: "empty" }, "未来 7 天内没有需要提醒的分钟精度事件。"));
  wrap.append(remBox);

  // ── 界面规范对照（这一个是预览用的控件，不是产品功能）──
  const spec = PLATFORMS[ctx.platform];
  const platSection = h(
    "section",
    { class: "section" },
    h(
      "div",
      { class: "sec-head" },
      h("span", { class: "sec-mark" }),
      h("h2", { class: "sec-title" }, "界面规范"),
      h("span", { class: "sec-count" }, spec.unitNote),
      h("span", { class: "sec-rule" })
    )
  );

  const grid = h("div", { class: "plat-grid" });
  for (const platform of PLATFORM_ORDER) {
    const ps = PLATFORMS[platform];
    grid.append(
      h(
        "button",
        { class: `plat-btn ${platform === ctx.platform ? "active" : ""}`, onClick: () => ctx.onPlatform(platform) },
        ps.label,
        h("small", {}, ps.unitNote)
      )
    );
  }
  platSection.append(grid);
  platSection.append(
    h("div", { class: "note" }, "同一份数据按三端官方规范渲染。真实 App 跟随系统自动选择，这里是规范对照。")
  );

  const table = h("dl", { class: "spec-table" });
  const rows: Array<[string, string]> = [
    ["卡片标题", `${spec.type.cardTitle.size} / ${spec.type.cardTitle.lineHeight} / w${spec.type.cardTitle.weight}`],
    ["次要文本", `${spec.type.gameName.size}`],
    ["倒计时", `${spec.type.remain.size} / w${spec.type.remain.weight}`],
    ["底部标签", `${spec.type.tabLabel.size}`],
    ["卡片圆角", `${spec.metric.cardRadius}`],
    ["卡片间距", `${spec.metric.cardGap}`],
    ["底部导航", `${spec.metric.tabbarHeight}${spec.metric.tabbarInset > 0 ? " · 悬浮胶囊" : ""}`],
    ["触控目标", `${spec.metric.touchMin}`]
  ];
  for (const [key, value] of rows) {
    table.append(h("dt", {}, key));
    table.append(h("dd", {}, value));
  }
  platSection.append(table);
  wrap.append(platSection);

  // ── 应用形态（PWA 安装 / 数据来源）──
  const appSection = h(
    "section",
    { class: "section" },
    h(
      "div",
      { class: "sec-head" },
      h("span", { class: "sec-mark" }),
      h("h2", { class: "sec-title" }, "应用"),
      h("span", { class: "sec-rule" })
    )
  );
  appSection.append(
    kv("运行形态", ctx.installed ? "独立窗口（已安装）" : "浏览器标签页"),
    kv("数据更新", ctx.canLiveRefresh ? "打开时实时抓取" : "由 CI 定时刷新后重新部署"),
    kv("快照生成", ctx.snapshotGeneratedAt ? formatRelative(ctx.snapshotGeneratedAt, ctx.now) : "—")
  );
  if (ctx.canInstall) {
    appSection.append(
      h("button", { class: "action-btn", onClick: ctx.onInstall }, "安装到桌面")
    );
    appSection.append(
      h("div", { class: "note" }, "装到桌面后以独立窗口打开，支持离线查看上次数据。")
    );
  }
  wrap.append(appSection);

  return wrap;
}

function statCard(value: string, label: string): HTMLElement {
  return h("div", { class: "stat" }, h("div", { class: "stat-n" }, value), h("div", { class: "stat-k" }, label));
}

function kv(key: string, value: string): HTMLElement {
  return h("div", { class: "kv" }, h("span", { class: "kv-k" }, key), h("span", { class: "kv-v" }, value));
}

/** 顶栏上的平台切换按钮（短名，因为只有一格的宽度） */
const PLATFORM_SHORT: Record<Platform, string> = { ios: "iOS", material: "M3", harmony: "鸿蒙" };

export function renderTopbar(ctx: ViewContext, onRefresh: () => void): HTMLElement {
  const refreshButton = ctx.canLiveRefresh
    ? h(
        "button",
        {
          class: `icon-btn ${ctx.refreshing ? "spinning" : ""}`,
          onClick: onRefresh,
          ...(ctx.refreshing ? { disabled: "disabled" } : {}),
          "aria-label": "刷新"
        },
        h("span", { class: "ico", html: ICONS.refresh })
      )
    : null;

  /** 在三种官方规范之间轮换 —— 真实 App 会跟随系统，这里是为了对照 */
  const platIndex = PLATFORM_ORDER.indexOf(ctx.platform);
  const nextPlatform = PLATFORM_ORDER[(platIndex + 1) % PLATFORM_ORDER.length]!;
  const platButton = h(
    "button",
    {
      class: "icon-btn",
      onClick: () => ctx.onPlatform(nextPlatform),
      title: `当前按 ${PLATFORMS[ctx.platform].label} 规范渲染，点击切换到 ${PLATFORMS[nextPlatform].label}`,
      "aria-label": "切换平台设计规范"
    },
    PLATFORM_SHORT[ctx.platform]
  );

  const meta = h(
    "div",
    { class: "topbar-meta" },
    h("span", { class: "today" }, todayLabel(ctx.now)),
    h("span", { class: "sep" }, "·"),
    h("span", { class: `src ${ctx.source}` }, ctx.source === "live" ? "实时" : "快照"),
    h("span", { class: "sep" }, "·"),
    h("span", { class: "updated" }, ctx.refreshedAt ? `更新于 ${formatRelative(ctx.refreshedAt, ctx.now)}` : "尚未更新")
  );

  return h(
    "header",
    { class: "topbar" },
    h(
      "div",
      { class: "topbar-row" },
      h("div", { class: "brand" }, "二游日历", h("span", { class: "tag" }, "预览")),
      platButton,
      refreshButton
    ),
    meta,
    ctx.error ? h("div", { class: "banner-tip error" }, ctx.error) : null
  );
}
