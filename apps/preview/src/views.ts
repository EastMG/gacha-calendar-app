/**
 * 四个视图：今天 / 日程 / 游戏 / 数据。
 *
 * 信息架构不是凭空定的：
 *  · 「今天」用三段聚合（即将结束 / 进行中 / 即将开启）—— 回答"我这两天会错过什么"
 *  · 「日程」按**结束日**分组 —— 回答"哪天有东西结束"（当前数据里"未来开始"为 0，
 *    而"何时结束"永远有内容，这是这类 App 真正被高频查看的信息）
 *  · 「游戏」按款列出当期状态与失败原因
 *  · 「数据」把刷新时间、抓取统计、失败明细、提醒计划摊开 —— "数据健康"页
 */
import {
  bucket,
  formatDayLabel,
  formatEventWindow,
  formatRemaining,
  formatTzBadge,
  formatUntil,
  formatUpdatedAt,
  instantToWall,
  planReminders,
  toEvents,
  toGameViews,
  type GameMetaLike,
  type GameView,
  type ResultLike,
  type ScheduleEvent
} from "../../../packages/schedule/src/index.ts";
import { h, type Child } from "./ui.ts";

export interface ViewContext {
  result: ResultLike;
  metas: GameMetaLike[];
  now: number;
  refreshedAt: number | null;
  source: "live" | "snapshot";
  refreshing: boolean;
  error: string | null;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** 事件卡片 */
function eventCard(event: ScheduleEvent, now: number, tone: "ending" | "upcoming" | "normal"): HTMLElement {
  const remain = event.endAt - now;
  const total = event.endAt - event.startAt;
  const progress = total > 0 ? Math.min(100, Math.max(0, ((now - event.startAt) / total) * 100)) : 100;

  const remainClass =
    tone === "ending" ? "remain urgent" : remain <= 24 * HOUR ? "remain soon" : "remain";

  const badges: Child[] = [
    h("span", { class: `badge ${event.kind}` }, event.kindLabel),
    // 非国服源要标出时区，否则用户会把日服/国际服时间当成本地时间
    event.tzMin === 480 ? null : h("span", { class: "badge tz" }, formatTzBadge(event.tzMin)),
    event.precision === "day" ? h("span", { class: "badge tz", title: "源站只公布日期" }, "仅日期") : null,
    event.stale ? h("span", { class: "badge stale" }, "沿用旧数据") : null,
    event.origin === "detail" ? h("span", { class: "badge detail-src" }, "明细") : null
  ];

  return h(
    "article",
    { class: `card ${tone === "normal" ? "" : tone} ${event.origin === "detail" ? "detail" : ""}`.trim() },
    h(
      "div",
      { class: "card-top" },
      h("span", { class: "game-name" }, event.gameName),
      ...badges
    ),
    h("div", { class: "card-title" }, event.title),
    h("div", { class: "card-row" }, h("span", {}, formatEventWindow(event)), h("span", { class: remainClass }, formatRemaining(remain, event.precision))),
    h("div", { class: "progress" }, h("i", { style: { width: `${progress.toFixed(1)}%` } }))
  );
}

function section(title: string, count: number, tone: string, cards: Child[], emptyHint?: string): HTMLElement {
  return h(
    "section",
    { class: "section" },
    h(
      "div",
      { class: "section-head" },
      h("div", { class: `section-title ${tone}` }, title),
      h("span", { class: "section-count" }, String(count))
    ),
    ...(cards.length > 0 ? cards : [h("div", { class: "hint" }, emptyHint ?? "暂无")])
  );
}

export function renderToday(ctx: ViewContext): HTMLElement {
  const events = toEvents(ctx.result, ctx.metas, ctx.now);
  const b = bucket(events, ctx.now);

  const wrap = h("div", {});
  if (b.ending.length === 0 && b.ongoing.length === 0 && b.upcoming.length === 0) {
    wrap.append(h("div", { class: "hint" }, "当前没有可展示的事件：可能抓取全部失败，或本期数据尚未公布。"));
    return wrap;
  }

  wrap.append(
    section(
      "即将结束",
      b.ending.length,
      "ending",
      b.ending.slice(0, 12).map((e) => eventCard(e, ctx.now, "ending")),
      "72 小时内没有要结束的卡池/活动"
    ),
    section(
      "进行中",
      b.ongoing.length,
      "",
      b.ongoing.slice(0, 30).map((e) => eventCard(e, ctx.now, "normal"))
    ),
    section(
      "即将开启",
      b.upcoming.length,
      "upcoming",
      b.upcoming.slice(0, 12).map((e) => eventCard(e, ctx.now, "upcoming")),
      "14 天内没有新开启的卡池/活动"
    )
  );
  return wrap;
}

/** 日程：按**结束日**分组 */
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
  wrap.append(
    h(
      "div",
      { class: "banner-tip" },
      "按「结束日」排列：这几天分别有什么会结束。真实 App 里这里会是月历视图，当前预览先验证数据与时区口径。"
    )
  );

  const keys = [...byDay.keys()].sort();
  if (keys.length === 0) {
    wrap.append(h("div", { class: "hint" }, "未来 30 天内没有结束事件。"));
    return wrap;
  }

  for (const key of keys) {
    const list = (byDay.get(key) ?? []).sort((a, b) => a.endAt - b.endAt);
    const w = instantToWall(list[0]!.endAt, list[0]!.tzMin);
    wrap.append(
      h(
        "div",
        { class: "day-head" },
        h("div", { class: "day-title" }, formatDayLabel(key)),
        h("div", { class: "day-week" }, formatUntil(list[0]!.endAt, ctx.now)),
        h("div", { class: "day-count" }, `${list.length} 项结束`)
      )
    );
    for (const e of list) {
      const hh = String(w.h).padStart(2, "0");
      const mm = String(w.mi).padStart(2, "0");
      wrap.append(
        h(
          "div",
          { class: "cal-row" },
          h("span", { class: "time" }, e.precision === "day" ? "全天" : `${hh}:${mm}`),
          h("span", { class: "name" }, `${e.kindLabel} · ${e.title}`),
          h("span", { class: "gname" }, e.gameName)
        )
      );
    }
  }
  return wrap;
}

function stateLabel(view: GameView): string {
  if (view.gachaState === "down" || view.eventState === "down") return "抓取失败";
  if (view.gachaState === "ok" || view.eventState === "ok") return "正常";
  if (view.gachaState === "nomatch" || view.eventState === "nomatch") return "未公布";
  return "无数据";
}

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
  wrap.append(h("div", { class: "banner-tip" }, `共 ${views.length} 款游戏。绿=正常，黄=本期未公布，红=抓取失败，灰=无数据。`));

  for (const view of views) {
    const list = primaryByGame.get(view.id) ?? [];
    const gacha = list.find((e) => e.kind === "gacha");
    const current = gacha ? gacha.title : (view.gachaFail?.reason ?? "—");
    const dotClass = view.gachaState === "ok" ? "ok" : view.gachaState === "down" ? "down" : view.gachaState === "nomatch" ? "nomatch" : "empty";

    wrap.append(
      h(
        "div",
        { class: "game-row" },
        h("span", { class: `state ${dotClass}` }),
        h("div", { class: "body" }, h("div", { class: "nm" }, view.name), h("div", { class: "cur" }, current)),
        h("div", { class: "side" }, stateLabel(view))
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
    if (v.gachaFail) failures.push(`${v.name} · 卡池：${v.gachaFail.kind === "nomatch" ? "本期未公布" : `失败（${v.gachaFail.reason ?? "未知"}）`}`);
    if (v.eventFail) failures.push(`${v.name} · 活动：${v.eventFail.kind === "nomatch" ? "本期未公布" : `失败（${v.eventFail.reason ?? "未知"}）`}`);
  }

  const wrap = h("div", {});
  wrap.append(
    h(
      "div",
      { class: "stat-grid" },
      h("div", { class: "stat" }, h("div", { class: "n" }, String(events.length)), h("div", { class: "k" }, "事件总数")),
      h("div", { class: "stat" }, h("div", { class: "n" }, String(primary.length)), h("div", { class: "k" }, "当期主事件")),
      h("div", { class: "stat" }, h("div", { class: "n" }, String(detail.length)), h("div", { class: "k" }, "明细展开")),
      h("div", { class: "stat" }, h("div", { class: "n" }, String(new Set(events.map((e) => e.gameId)).size)), h("div", { class: "k" }, "覆盖游戏"))
    )
  );

  wrap.append(
    h(
      "section",
      { class: "section" },
      h("div", { class: "section-head" }, h("div", { class: "section-title" }, "抓取状态")),
      h("div", { class: "kv" }, h("span", { class: "k" }, "数据源"), h("span", { class: "v" }, ctx.source === "live" ? "实时抓取" : "内置快照")),
      h("div", { class: "kv" }, h("span", { class: "k" }, "更新时间"), h("span", { class: "v" }, formatUpdatedAt(ctx.refreshedAt, ctx.now))),
      h(
        "div",
        { class: "kv" },
        h("span", { class: "k" }, "异常条目"),
        h("span", { class: "v" }, failures.length > 0 ? `${failures.length} 项` : "无")
      )
    )
  );

  if (failures.length > 0) {
    const box = h("section", { class: "section" }, h("div", { class: "section-head" }, h("div", { class: "section-title" }, "失败明细")));
    for (const line of failures.slice(0, 12)) box.append(h("div", { class: "fail-item" }, line));
    wrap.append(box);
  }

  const remBox = h(
    "section",
    { class: "section" },
    h(
      "div",
      { class: "section-head" },
      h("div", { class: "section-title" }, "提醒计划"),
      h("span", { class: "section-count" }, String(reminders.length))
    )
  );
  remBox.append(
    h("div", { class: "banner-tip" }, "由 planReminders() 纯计算得出：壳只需把每条注册成本地通知，不需要任何推送服务器。")
  );
  for (const r of reminders.slice(0, 6)) {
    remBox.append(
      h(
        "div",
        { class: "reminder" },
        h("span", { class: "t" }, formatUntil(r.at, ctx.now)),
        h("span", {}, ` · ${r.gameName} ${r.kind === "gacha" ? "卡池" : "活动"}即将结束`)
      )
    );
  }
  if (reminders.length === 0) remBox.append(h("div", { class: "hint" }, "未来 7 天内没有需要提醒的分钟精度事件。"));
  wrap.append(remBox);

  return wrap;
}

/** 顶部状态行 */
export function renderTopbar(ctx: ViewContext, onRefresh: () => void): HTMLElement {
  const sourceLabel = ctx.source === "live" ? "实时" : "快照";
  const meta = h(
    "div",
    { class: "meta" },
    h("span", { class: `dot ${ctx.source}` }),
    h("span", {}, formatUpdatedAt(ctx.refreshedAt, ctx.now)),
    h("span", {}, "·"),
    h("span", {}, sourceLabel)
  );

  const button = h(
    "button",
    {
      class: "btn primary",
      onClick: onRefresh,
      ...(ctx.refreshing ? { disabled: "disabled" } : {})
    },
    ctx.refreshing ? h("span", { class: "spin" }, "◌") : "刷新"
  );

  return h(
    "header",
    { class: "topbar" },
    h(
      "div",
      { class: "topbar-row" },
      h("div", { class: "brand" }, "二游日历", h("span", { class: "tag" }, "预览")),
      button
    ),
    meta,
    ctx.error ? h("div", { class: "banner-tip error", style: { marginTop: "10px", marginBottom: "0" } }, ctx.error) : null
  );
}
