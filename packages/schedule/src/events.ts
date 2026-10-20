/**
 * 把 core 的 `Result JSON` 派生成**扁平的、可排序可提醒的**事件列表。
 *
 * 两个数据来源：
 *  1. **主事件** —— `banner`/`bannerDates` 与 `event`/`eventDates`，即桌面端显示的那一行。
 *  2. **明细事件** —— `*Hover` 里的多行明细，每行常常自带自己的时间区间。
 *     桌面端只拿它做鼠标悬停提示；移动端把它铺开就是**真正的日程表**。
 *     实测 28 款能从中多抽出约 2-4 倍的事件（43 条主记录 → 145 条事件）。
 */
import { gameTz, type TzMinutes } from "./timezone.ts";
import { normalizeDateText, parseWindowDetailed, type Precision } from "./parse-window.ts";

export type EventKind = "gacha" | "event";

/** core 的三态失败语义（`null` = 正常） */
export type FailInfo = { kind: "nomatch"; reason?: string } | { kind: "down"; reason?: string };

/** core `Result JSON` 里单条游戏的记录（只列本层用到的字段） */
export interface GameRecordLike {
  name?: string;
  banner?: string;
  roles?: string;
  bannerDates?: string;
  bannerDatesRaw?: string;
  bannerHover?: string;
  event?: string;
  eventDates?: string;
  eventDatesRaw?: string;
  eventHover?: string;
  gachaFail?: FailInfo | null;
  eventFail?: FailInfo | null;
  gachaStale?: boolean;
  eventStale?: boolean;
}

export interface ResultLike {
  schemaVersion?: number;
  refreshedAt?: number;
  games?: Record<string, GameRecordLike>;
}

export interface GameMetaLike {
  id: string;
  name: string;
}

export interface ScheduleEvent {
  /** 稳定 id：同一条事件重复派生时保持不变，便于做"已读/已提醒"标记 */
  id: string;
  gameId: string;
  gameName: string;
  kind: EventKind;
  kindLabel: string;
  title: string;
  detail: string;
  startAt: number;
  endAt: number;
  precision: Precision;
  /** 该事件的起止时间是按**源站时区**记录的 */
  tzMin: TzMinutes;
  /** `primary` = 当期主事件；`detail` = 明细里额外抽出的事件 */
  origin: "primary" | "detail";
  fail: FailInfo | null;
  /** true = 这列沿用上次缓存（本轮没抓到新数据） */
  stale: boolean;
  /** 源站原始日期文本，排错用 */
  rawDates: string;
}

export const KIND_LABEL: Record<EventKind, string> = {
  gacha: "卡池",
  event: "活动"
};

/** 明细行里剥掉日期片段、留下标题 */
function stripDateFragment(line: string, matched: string): string {
  const idx = line.indexOf(matched);
  let head: string;
  if (idx > 0) {
    head = line.slice(0, idx);
  } else if (idx === 0) {
    head = line.slice(matched.length);
  } else {
    // 归一化后才匹配上的（原文写法不同）→ 退化成整体清理
    head = normalizeDateText(line);
  }
  return head
    .replace(/[\s｜|:：,，、]+$/u, "")
    .replace(/^[\s｜|:：,，、]+/u, "")
    .trim();
}

/** 从 `*Hover` 多行明细里抽出额外事件 */
export function parseDetailLines(
  hover: string | null | undefined,
  tzMin: TzMinutes,
  nowMs: number
): Array<{ title: string; startAt: number; endAt: number; precision: Precision }> {
  if (!hover || typeof hover !== "string") return [];
  const out: Array<{ title: string; startAt: number; endAt: number; precision: Precision }> = [];
  for (const rawLine of hover.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const w = parseWindowDetailed(line, tzMin, nowMs);
    if (!w) continue;
    const title = stripDateFragment(line, w.matched);
    if (!title) continue;
    out.push({ title, startAt: w.startAt, endAt: w.endAt, precision: w.precision });
  }
  return out;
}

function parseSide(
  rec: GameRecordLike,
  kind: EventKind,
  tzMin: TzMinutes,
  nowMs: number
): { startAt: number; endAt: number; precision: Precision; rawDates: string } | null {
  const dates = kind === "gacha" ? rec.bannerDates : rec.eventDates;
  const raw = kind === "gacha" ? rec.bannerDatesRaw : rec.eventDatesRaw;
  const first = parseWindowDetailed(dates, tzMin, nowMs);
  if (first) {
    return { startAt: first.startAt, endAt: first.endAt, precision: first.precision, rawDates: raw ?? "" };
  }
  // 展示串解析不了时，退回源站原文（长得很不一样，但经常更全）
  const second = parseWindowDetailed(raw, tzMin, nowMs);
  if (second) {
    return { startAt: second.startAt, endAt: second.endAt, precision: second.precision, rawDates: raw ?? "" };
  }
  return null;
}

export interface ToEventsOptions {
  /** 逐款覆盖源站时区（自定义条目用得到） */
  tzOverrides?: Readonly<Record<string, TzMinutes>>;
  /** 是否展开 `*Hover` 明细，默认 true */
  expandDetails?: boolean;
}

/**
 * `Result JSON` + 游戏元数据 → 扁平事件列表。
 *
 * 只产出**有可用时间区间**的事件：时间解析不出来的记录不会伪造时间，
 * 而是留在 `gameStates` 里由调用方呈现为"无数据"，避免倒计时凭空乱跳。
 */
export function toEvents(
  result: ResultLike,
  metas: readonly GameMetaLike[],
  nowMs: number,
  options: ToEventsOptions = {}
): ScheduleEvent[] {
  const { tzOverrides, expandDetails = true } = options;
  const metaById = new Map(metas.map((m) => [m.id, m]));
  const events: ScheduleEvent[] = [];
  /**
   * 按 id 去重：上游 `*Hover` 明细里**存在完全重复的行**
   * （实测原神「绮星盛会」同一区间连写两遍），直接铺开会得到重复卡片。
   */
  const seen = new Set<string>();
  const add = (event: ScheduleEvent): void => {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    events.push(event);
  };

  for (const [gameId, rec] of Object.entries(result.games ?? {})) {
    if (!rec) continue;
    const metaName = metaById.get(gameId)?.name ?? rec.name ?? gameId;
    const tzMin = gameTz(gameId, tzOverrides);

    for (const kind of ["gacha", "event"] as const) {
      const title = kind === "gacha" ? rec.banner : rec.event;
      const detail = kind === "gacha" ? rec.roles : "";
      const hover = kind === "gacha" ? rec.bannerHover : rec.eventHover;
      const fail = (kind === "gacha" ? rec.gachaFail : rec.eventFail) ?? null;
      const stale = kind === "gacha" ? !!rec.gachaStale : !!rec.eventStale;

      const side = parseSide(rec, kind, tzMin, nowMs);
      const primaryKeys = new Set<string>();

      if (side) {
        const id = `${gameId}:${kind}:${side.startAt}`;
        primaryKeys.add(`${title ?? ""}@${side.startAt}`);
        add({
          id,
          gameId,
          gameName: metaName,
          kind,
          kindLabel: KIND_LABEL[kind],
          title: title || (kind === "gacha" ? "当期卡池" : "当期活动"),
          detail: detail ?? "",
          startAt: side.startAt,
          endAt: side.endAt,
          precision: side.precision,
          tzMin,
          origin: "primary",
          fail,
          stale,
          rawDates: side.rawDates
        });
      }

      if (!expandDetails) continue;
      for (const line of parseDetailLines(hover, tzMin, nowMs)) {
        const key = `${line.title}@${line.startAt}`;
        if (primaryKeys.has(key)) continue;
        if (line.title === title && side && line.startAt === side.startAt) continue;
        add({
          id: `${gameId}:${kind}:d:${line.startAt}:${line.title}`,
          gameId,
          gameName: metaName,
          kind,
          kindLabel: KIND_LABEL[kind],
          title: line.title,
          detail: "",
          startAt: line.startAt,
          endAt: line.endAt,
          precision: line.precision,
          tzMin,
          origin: "detail",
          fail: null,
          stale,
          rawDates: ""
        });
      }
    }
  }

  return events;
}

/** 单款游戏的展示状态（用于"游戏"列表页与"数据健康"页） */
export type GameState = "ok" | "nomatch" | "down" | "empty";

export interface GameView {
  id: string;
  name: string;
  gachaFail: FailInfo | null;
  eventFail: FailInfo | null;
  gachaState: GameState;
  eventState: GameState;
  stale: boolean;
  hasDates: boolean;
}

/**
 * 判定单款游戏两侧的展示状态。
 *
 * 注意一个上游契约缺口：`Result JSON` **无法表达"该侧未配置来源"**
 * （那种情况会被算成成功），只有 `selfCheck()` 里的 `unconfigured` 才知道。
 * 这里把"既没有失败、也没有任何内容"归一成 `empty`，界面上显示为"无当期数据"，
 * 不冒充成功也不误报失败。
 */
export function toGameViews(
  result: ResultLike,
  metas: readonly GameMetaLike[],
  nowMs: number,
  options: ToEventsOptions = {}
): GameView[] {
  const { tzOverrides } = options;
  const metaById = new Map(metas.map((m) => [m.id, m]));
  const views: GameView[] = [];

  for (const [gameId, rec] of Object.entries(result.games ?? {})) {
    if (!rec) continue;
    const tzMin = gameTz(gameId, tzOverrides);
    const stateOf = (kind: EventKind): { state: GameState; hasDates: boolean } => {
      const fail = (kind === "gacha" ? rec.gachaFail : rec.eventFail) ?? null;
      const side = parseSide(rec, kind, tzMin, nowMs);
      if (fail) return { state: fail.kind === "down" ? "down" : "nomatch", hasDates: !!side };
      if (side) return { state: "ok", hasDates: true };
      return { state: "empty", hasDates: false };
    };
    const gacha = stateOf("gacha");
    const event = stateOf("event");
    views.push({
      id: gameId,
      name: metaById.get(gameId)?.name ?? rec.name ?? gameId,
      gachaFail: rec.gachaFail ?? null,
      eventFail: rec.eventFail ?? null,
      gachaState: gacha.state,
      eventState: event.state,
      stale: !!rec.gachaStale || !!rec.eventStale,
      hasDates: gacha.hasDates || event.hasDates
    });
  }

  return views;
}
