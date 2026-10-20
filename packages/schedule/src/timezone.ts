/**
 * 源站时区表 + 墙钟换算。
 *
 * ## 为什么不用 `Intl` / IANA 时区名
 *
 * `gacha-calendar-core` 内部用 `Intl.DateTimeFormat({ timeZone })` 来换算源站墙钟。
 * 这在 Node / 浏览器里没问题，但在移动端的 JS 引擎上是**静默风险**：
 *
 * - Hermes 不打包 ICU，而是投影平台能力（Android=ICU4J / iOS=Foundation）；
 *   鸿蒙 RNOH 侧是否启用 **未确认**。
 * - ICU 缺失时 `Intl` 不一定抛错，可能**静默退化成设备本地时区** →
 *   日服/国际服的起止时间整体偏 8-9 小时，且界面看起来完全正常。
 *
 * 而本项目覆盖的 28 款游戏只用到 **3 个时区，且全部是固定偏移、无夏令时**：
 * 国服 `UTC+8`、日服 `UTC+9`、国际服/UTC 源 `UTC+0`。
 * 因此这里用**纯整数运算**做换算 —— 与 `Intl` 逐毫秒等价，但不依赖任何引擎特性。
 *
 * ## 这条选择的代价与约束
 *
 * 一旦将来接入**有夏令时的时区**（例如欧美服按本地时区而非固定 GMT 偏移），
 * 固定偏移就不再成立，必须改用带 tzdata 的方案。届时请在本文件顶部显式说明，
 * 并补一条会失败的测试来提醒后来者。
 */

/** 时区偏移，单位=分钟（东为正）。例：UTC+8 → 480 */
export type TzMinutes = number;

export const TZ_UTC: TzMinutes = 0;
export const TZ_CN: TzMinutes = 480;
export const TZ_JP: TzMinutes = 540;

/** 未知游戏（例如用户自定义条目）的兜底时区：按国服算。 */
export const DEFAULT_TZ: TzMinutes = TZ_CN;

/**
 * 逐款游戏的源站时区。
 *
 * 来源：`dsh-gacha-calendar` 的 `src/client/30-game-*.js` 里各 `registerSource({ tz })`，
 * 以及迁移简报 §5 的逐款实测表。**上游新增游戏时必须同步补这里**，
 * `test/tz-coverage.test.ts` 会在漏配时报错。
 */
export const GAME_TZ: Readonly<Record<string, TzMinutes>> = {
  // ── 国服 / 简中（UTC+8）────────────────────────────────────────────
  fgo: TZ_CN,
  bandori: TZ_CN,
  "ournotes-global": TZ_CN,
  "uma-cn": TZ_CN,
  "ba-cn": TZ_CN,
  r1999: TZ_CN,
  wuhuamixin: TZ_CN,
  zspms: TZ_CN,
  czn: TZ_CN,
  kedr: TZ_CN,
  genshin: TZ_CN,
  hsr: TZ_CN,
  zzz: TZ_CN,
  bh3: TZ_CN,
  arknights: TZ_CN,
  endfield: TZ_CN,
  wuwa: TZ_CN,
  p5x: TZ_CN,
  nte: TZ_CN,
  pjsk: TZ_CN,
  gf2: TZ_CN,
  stellasora: TZ_CN,

  // ── 日服（UTC+9）──────────────────────────────────────────────────
  ournotes: TZ_JP,
  "uma-jp": TZ_JP,
  "ba-jp": TZ_JP,
  /** 嘟嘟脸恶作剧在 core 里写的是固定偏移 `+540`，等价于 UTC+9 */
  ddlezj: TZ_JP,

  // ── 国际服 / UTC 源（UTC+0）──────────────────────────────────────
  "ba-global": TZ_UTC,
  "uma-global": TZ_UTC
};

/** 取某款游戏的源站时区；未知游戏回落 `DEFAULT_TZ`。 */
export function gameTz(gameId: string, overrides?: Readonly<Record<string, TzMinutes>>): TzMinutes {
  const fromOverride = overrides?.[gameId];
  if (fromOverride !== undefined) return fromOverride;
  const known = GAME_TZ[gameId];
  return known ?? DEFAULT_TZ;
}

export interface WallClock {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}

/**
 * 源站墙钟 (y, mo, d, h, mi) + 固定偏移 → 绝对毫秒。
 *
 * 用 `Date.UTC` 而不是 `new Date(y, mo-1, ...)`：后者吃**设备本地时区**，
 * 会让同一份数据在不同手机上算出不同结果。
 */
export function wallToInstant(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tzMin: TzMinutes
): number {
  return Date.UTC(y, mo - 1, d, h, mi, 0, 0) - tzMin * 60_000;
}

/** 绝对毫秒 → 源站墙钟。 */
export function instantToWall(ts: number, tzMin: TzMinutes): WallClock {
  const d = new Date(ts + tzMin * 60_000);
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes()
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** `MM-DD HH:mm` */
export function formatWall(ts: number, tzMin: TzMinutes): string {
  const w = instantToWall(ts, tzMin);
  return `${pad(w.mo)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)}`;
}

/** `YYYY-MM-DD HH:mm` */
export function formatWallYear(ts: number, tzMin: TzMinutes): string {
  const w = instantToWall(ts, tzMin);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)}`;
}

/** `UTC+8` / `UTC+9` / `UTC` */
export function tzLabel(tzMin: TzMinutes): string {
  if (tzMin === 0) return "UTC";
  const sign = tzMin > 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${pad(m)}`;
}

/** 该时区此刻的年份（用于"展示串没有年份"的推断） */
export function yearInTz(ts: number, tzMin: TzMinutes): number {
  return new Date(ts + tzMin * 60_000).getUTCFullYear();
}
