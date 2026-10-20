/**
 * 展示层格式化。全部为纯函数，不读系统时钟、不读设备时区
 * —— 需要"现在"的地方一律显式传 `nowMs`，这样测试可完全复现。
 */
import { instantToWall, tzLabel, type TzMinutes } from "./timezone.ts";
import type { Precision } from "./parse-window.ts";
import type { ScheduleEvent } from "./events.ts";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * 剩余时间。
 *
 * `day` 精度的事件**只显示天数**：源站只公布到日期时，显示"剩 3 小时 12 分"
 * 是在编造精度，用户会按它去卡点。
 */
export function formatRemaining(ms: number, precision: Precision = "minute"): string {
  if (ms <= 0) return "已结束";
  if (precision === "day") {
    const d = Math.ceil(ms / DAY);
    return d <= 1 ? "今天结束" : `剩 ${d} 天`;
  }
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const mi = Math.floor((ms % HOUR) / MINUTE);
  if (d > 0) return `剩 ${d} 天 ${h} 小时`;
  if (h > 0) return `剩 ${h} 小时 ${mi} 分`;
  const sec = Math.floor((ms % MINUTE) / 1000);
  return `剩 ${mi} 分 ${pad(sec)} 秒`;
}

/** 已开始多久 / 还有多久（用于"即将开启"条目） */
export function formatStartsIn(ms: number, precision: Precision = "minute"): string {
  if (ms <= 0) return "已开始";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const mi = Math.floor((ms % HOUR) / MINUTE);
  if (precision === "day") return d <= 0 ? "今天开始" : `${d} 天后开始`;
  if (d > 0) return `${d} 天 ${h} 小时后开始`;
  if (h > 0) return `${h} 小时 ${mi} 分后开始`;
  return `${mi} 分后开始`;
}

/** `刚刚` / `12 分钟前` / `3 小时前` / `2 天前` */
export function formatRelative(ts: number, nowMs: number): string {
  const diff = nowMs - ts;
  if (diff < 0) return "刚刚";
  if (diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  const d = Math.floor(diff / DAY);
  return d < 30 ? `${d} 天前` : `${Math.floor(d / 30)} 个月前`;
}

/**
 * 未来方向：距离某时刻还有多久。
 *
 * 提醒计划、日历分组的"还有几天"都要用它 ——
 * 不能拿 `formatRelative` 硬套，它对未来时间只会返回「刚刚」。
 */
export function formatUntil(ts: number, nowMs: number): string {
  const diff = ts - nowMs;
  if (diff <= MINUTE) return "即将触发";
  const d = Math.floor(diff / DAY);
  const h = Math.floor((diff % DAY) / HOUR);
  const mi = Math.floor((diff % HOUR) / MINUTE);
  if (d > 0) return `${d} 天后`;
  if (h > 0) return `${h} 小时 ${mi} 分后`;
  return `${mi} 分钟后`;
}

/** `10-13 18:00 ~ 11-03 14:59`（按事件源站时区） */
export function formatEventWindow(e: ScheduleEvent): string {
  const f = (ts: number): string => {
    const w = instantToWall(ts, e.tzMin);
    return `${pad(w.mo)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)}`;
  };
  return `${f(e.startAt)} ~ ${f(e.endAt)}`;
}

/** 同一天只写一次日期：`10-13 18:00 ~ 14:59` */
export function formatEventWindowCompact(e: ScheduleEvent): string {
  const s = instantToWall(e.startAt, e.tzMin);
  const t = instantToWall(e.endAt, e.tzMin);
  const sameDay = s.y === t.y && s.mo === t.mo && s.d === t.d;
  const start = `${pad(s.mo)}-${pad(s.d)} ${pad(s.h)}:${pad(s.mi)}`;
  if (sameDay) return `${start} ~ ${pad(t.h)}:${pad(t.mi)}`;
  return `${start} ~ ${pad(t.mo)}-${pad(t.d)} ${pad(t.h)}:${pad(t.mi)}`;
}

/** `10月22日 周四` */
export function formatDayLabel(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const wd = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()] ?? "";
  return `${mo}月${d}日 ${wd}`;
}

/** 时区标签，例如 `UTC+8` —— 跨服用户必须看得到，否则会把日服时间当成自己的 */
export function formatTzBadge(tzMin: TzMinutes): string {
  return tzLabel(tzMin);
}

/** 头部"数据更新于 …" */
export function formatUpdatedAt(refreshedAt: number | null | undefined, nowMs: number): string {
  if (!refreshedAt) return "尚未更新";
  return `数据更新于 ${formatRelative(refreshedAt, nowMs)}`;
}
