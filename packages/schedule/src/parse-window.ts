/**
 * 把"给人看的日期串"解析成绝对时刻区间。
 *
 * core 输出两类文本：
 *  - **归一化展示串**（`bannerDates` / `eventDates`）：`10-13 18:00 ~ 11-03 14:59`
 *    —— 绝大多数是这个形状，但**没有年份**。
 *  - **源站原始串**（`*DatesRaw`）：各站自己的一套写法，例如
 *    `10/13 12:00 ～ 10/26 11:59`、`2026年10月13日 版本更新后~2026年11月3日 08:59`。
 *
 * 移动端要做倒计时、日历、提醒，必须拿到**绝对时刻**，而不是字符串。
 */
import { gameTz, instantToWall, wallToInstant, yearInTz, type TzMinutes } from "./timezone.ts";

/** `minute` = 有具体时刻，可倒计时；`day` = 只知道日期，**绝不显示到分钟** */
export type Precision = "minute" | "day";

export interface Window {
  startAt: number;
  endAt: number;
  precision: Precision;
}

/** 带命中原文的解析结果：`matched` 用于从明细行里剥掉日期、只留标题 */
export interface DetailedWindow extends Window {
  matched: string;
}

interface Side {
  /** null = 文本里没有年份，需要推断 */
  y: number | null;
  mo: number;
  d: number;
  h: number;
  mi: number;
  hasTime: boolean;
}

function num(v: string | undefined): number {
  if (v === undefined) throw new Error("正则分组缺失");
  return Number(v);
}

function pad2(v: string | number): string {
  return String(v).padStart(2, "0");
}

/** `2026年10月13日` / `10月13日` / `10/13` → `2026-10-13` / `10-13` */
export function normalizeDateText(input: string): string {
  return input
    .replace(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, (_m, y, mo, d) => `${y}-${pad2(mo)}-${pad2(d)}`)
    .replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, (_m, mo, d) => `${pad2(mo)}-${pad2(d)}`)
    .replace(/(\d{1,2})\/(\d{1,2})(?=\s|$)/g, (_m, mo, d) => `${pad2(mo)}-${pad2(d)}`)
    .replace(/版本更新后|更新后|维护后|开服后|预计|北京时间|服务器时间/g, " ")
    .replace(/[（(][^）)]*[）)]/g, " ");
}

const RE_FULL =
  /(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?\s*[^0-9]{0,10}?[~～〜至]\s*[^0-9]{0,10}?(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/;

const RE_SHORT =
  /(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\s*[^0-9]{0,10}?[~～〜至]\s*[^0-9]{0,10}?(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/;

interface RawMatch {
  sides: [Side, Side];
  matched: string;
}

function matchFull(text: string): RawMatch | null {
  const m = text.match(RE_FULL);
  if (!m) return null;
  const h1 = m[4];
  const h2 = m[9];
  return {
    matched: m[0],
    sides: [
      {
        y: num(m[1]),
        mo: num(m[2]),
        d: num(m[3]),
        h: h1 === undefined ? 0 : num(h1),
        mi: m[5] === undefined ? 0 : num(m[5]),
        hasTime: h1 !== undefined
      },
      {
        y: num(m[6]),
        mo: num(m[7]),
        d: num(m[8]),
        h: h2 === undefined ? 0 : num(h2),
        mi: m[10] === undefined ? 0 : num(m[10]),
        hasTime: h2 !== undefined
      }
    ]
  };
}

function matchShort(text: string): RawMatch | null {
  const m = text.match(RE_SHORT);
  if (!m) return null;
  const h1 = m[3];
  const h2 = m[7];
  return {
    matched: m[0],
    sides: [
      {
        y: null,
        mo: num(m[1]),
        d: num(m[2]),
        h: h1 === undefined ? 0 : num(h1),
        mi: m[4] === undefined ? 0 : num(m[4]),
        hasTime: h1 !== undefined
      },
      {
        y: null,
        mo: num(m[5]),
        d: num(m[6]),
        h: h2 === undefined ? 0 : num(h2),
        mi: m[8] === undefined ? 0 : num(m[8]),
        hasTime: h2 !== undefined
      }
    ]
  };
}

/**
 * 推断缺失的年份：在 `now` 前后一年的三个候选里取**离现在最近**的那个。
 *
 * 这是"展示串没有年份"这一事实下唯一可行的近似：卡池/活动基本都围绕当期，
 * 落在邻年是为了处理跨年区间（`12-28 ~ 01-05`）。
 */
function inferYear(nowMs: number, side: Side, tzMin: TzMinutes): number {
  const nowYear = yearInTz(nowMs, tzMin);
  let bestYear = nowYear;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const y of [nowYear - 1, nowYear, nowYear + 1]) {
    const t = wallToInstant(y, side.mo, side.d, side.h, side.mi, tzMin);
    const dist = Math.abs(t - nowMs);
    if (dist < bestDist) {
      bestDist = dist;
      bestYear = y;
    }
  }
  return bestYear;
}

function toWindow(raw: RawMatch, tzMin: TzMinutes, nowMs: number): DetailedWindow | null {
  const [a, b] = raw.sides;
  // 日期字段不合法（例如 13 月）→ 直接判失败，别产出离谱的数据
  if (a.mo < 1 || a.mo > 12 || b.mo < 1 || b.mo > 12) return null;
  if (a.d < 1 || a.d > 31 || b.d < 1 || b.d > 31) return null;

  const startYear = a.y ?? inferYear(nowMs, a, tzMin);
  const startAt = wallToInstant(startYear, a.mo, a.d, a.h, a.mi, tzMin);

  let endAt: number;
  if (b.y !== null) {
    endAt = wallToInstant(b.y, b.mo, b.d, b.h, b.mi, tzMin);
  } else {
    // 先按起始年算；结束早于开始说明跨年，推到下一年
    endAt = wallToInstant(startYear, b.mo, b.d, b.h, b.mi, tzMin);
    if (endAt <= startAt) {
      endAt = wallToInstant(startYear + 1, b.mo, b.d, b.h, b.mi, tzMin);
    }
  }

  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return null;
  if (endAt < startAt) return null;

  const precision: Precision = a.hasTime && b.hasTime ? "minute" : "day";
  return { startAt, endAt, precision, matched: raw.matched };
}

/**
 * 解析时间区间并返回命中的原文片段。
 *
 * @param text   `bannerDates` / `eventDates`，也可以直接传源站原文
 * @param tzMin  该游戏的源站时区（见 `timezone.ts`）
 * @param nowMs  当前时刻，用于推断缺失的年份
 */
export function parseWindowDetailed(
  text: string | null | undefined,
  tzMin: TzMinutes,
  nowMs: number
): DetailedWindow | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const normalized = normalizeDateText(trimmed);

  for (const candidate of [trimmed, normalized]) {
    const full = matchFull(candidate);
    if (full) {
      const w = toWindow(full, tzMin, nowMs);
      if (w) return w;
    }
  }
  for (const candidate of [trimmed, normalized]) {
    const short = matchShort(candidate);
    if (short) {
      const w = toWindow(short, tzMin, nowMs);
      if (w) return w;
    }
  }
  return null;
}

/** 只要区间、不要命中原文的便捷版本。 */
export function parseWindow(
  text: string | null | undefined,
  tzMin: TzMinutes,
  nowMs: number
): Window | null {
  const w = parseWindowDetailed(text, tzMin, nowMs);
  if (!w) return null;
  return { startAt: w.startAt, endAt: w.endAt, precision: w.precision };
}

/** 按游戏 id 自动取时区。 */
export function parseWindowForGame(
  gameId: string,
  text: string | null | undefined,
  nowMs: number,
  overrides?: Readonly<Record<string, TzMinutes>>
): Window | null {
  return parseWindow(text, gameTz(gameId, overrides), nowMs);
}

/**
 * 把区间按源站时区渲染回墙钟文本 —— 用于**往返自检**。
 * 若解析正确，渲染结果必须与原始展示串逐字符一致（原串带年份则一并带上）。
 */
export function formatWindow(window: Window, tzMin: TzMinutes, withYear = false): string {
  const fmt = (ts: number): string => {
    const w = instantToWall(ts, tzMin);
    const hm = `${pad2(w.h)}:${pad2(w.mi)}`;
    return withYear ? `${w.y}-${pad2(w.mo)}-${pad2(w.d)} ${hm}` : `${pad2(w.mo)}-${pad2(w.d)} ${hm}`;
  };
  return `${fmt(window.startAt)} ~ ${fmt(window.endAt)}`;
}
