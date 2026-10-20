/**
 * 视觉主题：游戏配色 + 图标。
 *
 * 配色优先用用户自己设过的 `gameColors`（桌面端插件同一个键），
 * 没设过则用 id 的稳定哈希从一组柔和色里取 —— 同一款游戏在任何页面永远是同一个颜色，
 * 列表因此变得"可扫"。
 */

/** 柔和但足够区分的色板（暗色背景上都能读） */
const PALETTE = [
  "#6c8cff",
  "#46d39a",
  "#ffb454",
  "#ff7a92",
  "#a78bfa",
  "#4dd0e1",
  "#f0a6c0",
  "#9ccc65",
  "#f59e0b",
  "#8b9dff"
] as const;

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 取某款游戏的主题色：用户设置优先，否则按 id 稳定取色 */
export function gameColor(gameId: string, overrides?: Readonly<Record<string, string>>): string {
  const custom = overrides?.[gameId];
  if (custom) return custom;
  const index = hashString(gameId) % PALETTE.length;
  return PALETTE[index] ?? PALETTE[0];
}

/** 同色但更暗/更透，用于背景与边框 */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.trim();
  if (!normalized.startsWith("#") || (normalized.length !== 7 && normalized.length !== 4)) {
    return normalized;
  }
  const expand =
    normalized.length === 4
      ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
      : normalized;
  const r = Number.parseInt(expand.slice(1, 3), 16);
  const g = Number.parseInt(expand.slice(3, 5), 16);
  const b = Number.parseInt(expand.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const stroke =
  'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

/** 底部标签栏图标（内联 SVG，不依赖图标字体或外链） */
export const ICONS = {
  today: `<svg viewBox="0 0 24 24" ${stroke}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>`,
  games: `<svg viewBox="0 0 24 24" ${stroke}><rect x="3" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2.2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2.2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2.2"/></svg>`,
  data: `<svg viewBox="0 0 24 24" ${stroke}><path d="M4 20V11M10 20V4.5M16 20v-6.5M22 20H2"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" ${stroke}><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${stroke}><path d="M6 9l6 6 6-6"/></svg>`
} as const;
