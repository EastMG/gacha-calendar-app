/**
 * 首页三段聚合 —— 参考同类开源项目（eventide 等）得到的信息架构：
 *
 *   「即将结束」≤72h  → 用户最需要立刻行动的
 *   「进行中」        → 主内容
 *   「即将开启」≤14d  → 可提前规划
 *
 * 注意：**不要**做"28 张游戏卡片横向滑动"，那是桌面思维；
 * 移动端首屏应该回答"我这两天会错过什么"。
 */
import { instantToWall } from "./timezone.ts";
import type { ScheduleEvent } from "./events.ts";

export interface BucketOptions {
  /** 剩余时间少于这个小时数算「即将结束」 */
  endingWithinHours?: number;
  /** 开始时间在这个天数内算「即将开启」 */
  upcomingWithinDays?: number;
}

export interface Buckets {
  ending: ScheduleEvent[];
  ongoing: ScheduleEvent[];
  upcoming: ScheduleEvent[];
  ended: ScheduleEvent[];
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function bucket(events: readonly ScheduleEvent[], nowMs: number, options: BucketOptions = {}): Buckets {
  const { endingWithinHours = 72, upcomingWithinDays = 14 } = options;
  const ending: ScheduleEvent[] = [];
  const ongoing: ScheduleEvent[] = [];
  const upcoming: ScheduleEvent[] = [];
  const ended: ScheduleEvent[] = [];

  for (const e of events) {
    if (e.endAt < nowMs) {
      ended.push(e);
    } else if (e.startAt > nowMs) {
      if (e.startAt - nowMs <= upcomingWithinDays * DAY) upcoming.push(e);
    } else if (e.endAt - nowMs <= endingWithinHours * HOUR) {
      ending.push(e);
    } else {
      ongoing.push(e);
    }
  }

  ending.sort((a, b) => a.endAt - b.endAt);
  ongoing.sort((a, b) => a.endAt - b.endAt);
  upcoming.sort((a, b) => a.startAt - b.startAt);
  ended.sort((a, b) => b.endAt - a.endAt);

  return { ending, ongoing, upcoming, ended };
}

export interface DayGroup {
  /** `YYYY-MM-DD`（按**该事件源站时区**取日） */
  key: string;
  /** 该组的代表时区（组内第一条事件的源站时区） */
  tzMin: number;
  events: ScheduleEvent[];
}

/**
 * 按天分组，供日历/时间轴视图使用。
 *
 * 分组用**事件自己的源站时区**取日：这样"卡片上显示的日期"与"它落在哪一天"永远一致。
 * 若改用设备本地时区，日服 00:30 开盘的卡池会被排到前一天，与卡片上的日期对不上。
 */
export function groupByDay(events: readonly ScheduleEvent[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const e of events) {
    const w = instantToWall(e.startAt, e.tzMin);
    const key = `${w.y}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
    const group = map.get(key);
    if (group) group.events.push(e);
    else map.set(key, { key, tzMin: e.tzMin, events: [e] });
  }
  const groups = [...map.values()];
  for (const g of groups) g.events.sort((a, b) => a.startAt - b.startAt);
  groups.sort((a, b) => a.key.localeCompare(b.key));
  return groups;
}

/** 按游戏分组（用于"游戏"页） */
export function groupByGame(events: readonly ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>();
  for (const e of events) {
    const list = map.get(e.gameId);
    if (list) list.push(e);
    else map.set(e.gameId, [e]);
  }
  for (const list of map.values()) list.sort((a, b) => b.endAt - a.endAt);
  return map;
}

/** 与"今天"相差的天数（按给定时刻的源站时区日界线算整数天） */
export function daysFromNow(startAt: number, nowMs: number, tzMin: number): number {
  const a = instantToWall(startAt, tzMin);
  const b = instantToWall(nowMs, tzMin);
  const da = Date.UTC(a.y, a.mo - 1, a.d);
  const db = Date.UTC(b.y, b.mo - 1, b.d);
  return Math.round((da - db) / DAY);
}
