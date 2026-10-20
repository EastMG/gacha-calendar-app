/**
 * 提醒规划 —— **纯计算**，不碰任何平台通知 API。
 *
 * 为什么单独抽出来：三端壳还没定（RN / Capacitor / 原生都有可能），
 * 而"哪些卡池该在什么时候提醒我"这件事与平台无关。
 * 壳只需要拿到 `Reminder[]`，再翻译成 iOS `UNNotificationRequest` /
 * Android `AlarmManager` / 鸿蒙 `reminderAgentManager` 即可。
 *
 * 另一条产品判断：**不做自建推送**。调研的 15 个同类项目里 0 个自建推送，
 * 全是本地通知 / ICS 订阅 / IM Bot —— 自建推送要服务器、要备案、要处理卸载与静默，
 * 收益却不比本地通知高。
 */
import type { ScheduleEvent } from "./events.ts";

export interface Reminder {
  eventId: string;
  gameId: string;
  gameName: string;
  kind: ScheduleEvent["kind"];
  /** 提醒触发时刻（绝对毫秒），由壳注册成本地通知 */
  at: number;
  /** 通知标题，例如「原神 · 卡池即将结束」 */
  title: string;
  /** 通知正文，例如「「虚星临渡」107期角色活动祈愿 还剩 1 小时」 */
  body: string;
}

export interface PlanReminderOptions {
  /** 提前多少分钟提醒，默认 60 */
  leadMinutes?: number;
  /** 离现在不足这么多分钟的事件不排提醒（避免立刻炸一堆通知），默认 5 */
  minLeadMinutes?: number;
  /** 只规划未来这么多天内的事件，默认 7 */
  horizonDays?: number;
  /** 每款游戏最多排几条，默认 2（防刷屏） */
  maxPerGame?: number;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

function describeRemaining(ms: number): string {
  if (ms <= 0) return "已结束";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3_600_000);
  const mi = Math.floor((ms % 3_600_000) / MINUTE);
  if (d > 0) return `还剩 ${d} 天 ${h} 小时`;
  if (h > 0) return `还剩 ${h} 小时 ${mi} 分`;
  return `还剩 ${mi} 分`;
}

/**
 * 规划提醒。
 *
 * 只对 `precision === "minute"` 的事件排提醒：日期精度的事件**不知道确切时刻**，
 * 给它排"提前 1 小时"的通知等于编造时间。
 *
 * 默认给"即将结束"排提醒（错过就没了），这是玩家最在意的。
 */
export function planReminders(
  events: readonly ScheduleEvent[],
  nowMs: number,
  options: PlanReminderOptions = {}
): Reminder[] {
  const { leadMinutes = 60, minLeadMinutes = 5, horizonDays = 7, maxPerGame = 2 } = options;
  const horizon = horizonDays * DAY;
  const perGame = new Map<string, number>();
  const out: Reminder[] = [];

  const candidates = events
    .filter((e) => {
      if (e.precision !== "minute") return false;
      if (e.endAt <= nowMs) return false; // 已结束
      const untilEnd = e.endAt - nowMs;
      if (untilEnd > horizon) return false; // 太远
      const leadMs = Math.min(leadMinutes * MINUTE, Math.max(0, untilEnd - minLeadMinutes * MINUTE));
      // 立刻就要结束的事件（< minLead）不排，避免一启动就弹一堆
      return leadMs >= minLeadMinutes * MINUTE || untilEnd > minLeadMinutes * MINUTE;
    })
    .sort((a, b) => a.endAt - b.endAt);

  for (const e of candidates) {
    const count = perGame.get(e.gameId) ?? 0;
    if (count >= maxPerGame) continue;
    const untilEnd = e.endAt - nowMs;
    const leadMs = Math.min(leadMinutes * MINUTE, Math.max(0, untilEnd - minLeadMinutes * MINUTE));
    const at = Math.max(nowMs, e.endAt - leadMs);
    if (at - nowMs < 0) continue;
    perGame.set(e.gameId, count + 1);
    out.push({
      eventId: e.id,
      gameId: e.gameId,
      gameName: e.gameName,
      kind: e.kind,
      at,
      title: `${e.gameName} · ${e.kindLabel}即将结束`,
      body: `${e.title} ${describeRemaining(untilEnd)}`
    });
  }

  return out.sort((a, b) => a.at - b.at);
}
