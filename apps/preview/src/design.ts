/**
 * 设计 token —— 三端官方规范的落地版。
 *
 * 每个数值都能追到官方出处，分级标注见 `docs/DESIGN.md`：
 *   [A] Apple HIG 原文数值          [M] Material 3 正文/token
 *   [H] HarmonyOS Design 官方规范   [E] 工程决定（三家都没规定）
 *
 * ## 为什么是「共享底座 + 三端皮肤」
 *
 * 三家的**结构性规范**高度一致（左右边距 16、触控目标 44–48、分组列表、底部 4 tab），
 * 但**观感差异**集中在四件事上：字号体系、圆角、底部导航形态、暗色分层机制。
 * 所以底座统一，皮肤只覆盖这四类 token —— 不是三套 UI。
 *
 * ## 数字一律 tabular
 *
 * Apple 官方明确 SF Pro **默认比例数字**，倒计时逐位变宽会抖动；
 * Material / HarmonyOS 都没有数字宽度规范。
 * 因此「等宽数字」是本项目的工程决定 [E]，但对倒计时是必须的。
 */

export type Platform = "ios" | "material" | "harmony";

export interface TypeToken {
  size: number;
  lineHeight: number;
  weight: number;
  /** 字距，px；Material 的 label 系会用到 */
  tracking?: number;
}

export interface ColorToken {
  /** 应用底色 */
  bg: string;
  /** 页面/容器底色 */
  surface: string;
  /** 卡片底色 */
  card: string;
  /** 卡片内部再嵌一层（展开明细等） */
  cardAlt: string;
  line: string;
  text: string;
  /** 次要文本（游戏名、时间区间） */
  textSecondary: string;
  /** 三级文本（计数、单位、辅助说明） */
  textTertiary: string;
  /** 强调色：用于可读文本/图标，须满足文本对比度 */
  accent: string;
  /** 强调色的低透明度底（胶囊、选中态） */
  accentSoft: string;
  danger: string;
  warn: string;
  ok: string;
}

export interface MetricToken {
  sideMargin: number;
  cardRadius: number;
  cardGap: number;
  cardPaddingY: number;
  cardPaddingX: number;
  /** 底部导航总高（不含安全区） */
  tabbarHeight: number;
  /** 底部导航左右内缩（鸿蒙悬浮胶囊用） */
  tabbarInset: number;
  tabbarRadius: number;
  /** 最小触控目标 */
  touchMin: number;
  /** 图标按钮直径 */
  iconButton: number;
  /** 展开/收起等动效时长 ms */
  motionFast: number;
}

export interface PlatformSpec {
  id: Platform;
  label: string;
  /** 设计稿单位说明，界面上展示用 */
  unitNote: string;
  color: ColorToken;
  type: {
    brand: TypeToken;
    cardTitle: TypeToken;
    gameName: TypeToken;
    range: TypeToken;
    remain: TypeToken;
    sectionTitle: TypeToken;
    badge: TypeToken;
    tabLabel: TypeToken;
  };
  metric: MetricToken;
}

/** 共享底座：三家在这一点上是一致的 */
export const SHARED = {
  /** 左右边距 16：iOS 16pt / M3 16dp / HarmonyOS 16vp */
  sideMargin: 16,
  /** 触控目标：iOS 44pt、M3 48dp、HarmonyOS 48vp 推荐 → 取 48 覆盖三家 */
  touchMin: 48,
  /** 8px 栅格（M3 space100=8dp；HarmonyOS 间距档位同为 8 的倍数） */
  space: [2, 4, 8, 12, 16, 24, 32] as const,
  /** 主次文本间距：HarmonyOS 官方明文 2vp，另两家无对应项 */
  tightGap: 2
} as const;

/* ─────────────────────────── iOS ─────────────────────────── */
/**
 * 字号来自 HIG Dynamic Type 的 Large 默认档：
 * LargeTitle 34/41、Title1 28/34、Title2 22/28、Title3 20/25、
 * Headline 17/22(Semibold)、Body 17/22、Callout 16/21、
 * Subhead 15/20、Footnote 13/18、Caption1 12/16、Caption2 11/13。
 * 触控 44×44pt；暗色分层系统色 gray6 #1C1C1E / gray5 #2C2C2E / gray4 #3A3A3C。
 * 注意：现行 HIG 已把 tab bar 高度、列表行高、圆角档位移出正文（见 docs/DESIGN.md）。
 */
const IOS: PlatformSpec = {
  id: "ios",
  label: "iOS",
  unitNote: "pt（Dynamic Type · Large 档）",
  color: {
    bg: "#000000",
    surface: "#0B0B0D",
    card: "#1C1C1E",
    cardAlt: "#2C2C2E",
    line: "#38383A",
    text: "#FFFFFF",
    textSecondary: "#D1D1D6",
    textTertiary: "#AEAEB2",
    accent: "#0A84FF",
    accentSoft: "rgba(10, 132, 255, 0.16)",
    danger: "#FF6961",
    warn: "#FFD60A",
    ok: "#30D158"
  },
  type: {
    brand: { size: 22, lineHeight: 28, weight: 700 }, // Title2
    cardTitle: { size: 17, lineHeight: 22, weight: 600 }, // Headline
    gameName: { size: 13, lineHeight: 18, weight: 600 }, // Footnote
    range: { size: 13, lineHeight: 18, weight: 400 }, // Footnote
    remain: { size: 15, lineHeight: 20, weight: 600 }, // Subhead (强调用字重，不放大字号)
    sectionTitle: { size: 13, lineHeight: 18, weight: 600 }, // Footnote
    badge: { size: 11, lineHeight: 13, weight: 600 }, // Caption2（iOS 字号下限）
    tabLabel: { size: 10, lineHeight: 12, weight: 500 }
  },
  metric: {
    sideMargin: 16,
    cardRadius: 12,
    cardGap: 8,
    cardPaddingY: 12,
    cardPaddingX: 13,
    tabbarHeight: 58,
    tabbarInset: 0,
    tabbarRadius: 0,
    touchMin: 44,
    iconButton: 44,
    motionFast: 200
  }
};

/* ───────────────────────── Material 3 ───────────────────────── */
/**
 * [M] 列表标题 = body-large 16sp/24/400/ls0.5；副标题 body-medium 14/20；
 *     label-small 11/16/500、label-medium 12/16/500。
 *     触控 ≥48dp；state layer hover 8% / press 10%。
 *     底部导航：64dp（flexible，官方推荐）或 80dp（baseline，不再推荐）——
 *     本实现取 64dp，图标 24dp，active indicator 56×32 full 圆角。
 *     圆角：card 12dp。
 *     暗色 surface-container 层级 tone 4/10/12/17/22，**越高越亮**。
 */
const MATERIAL: PlatformSpec = {
  id: "material",
  label: "Material 3",
  unitNote: "dp/sp（M3 token 值）",
  color: {
    bg: "#0F1113",
    surface: "#0F1113",
    card: "#1B1E23", // surface-container（tone 12）
    cardAlt: "#252A30", // surface-container-high（tone 17）
    line: "#33383F",
    text: "#E6E1E5", // on-surface
    textSecondary: "#CFC9D6", // on-surface-variant 提亮以满足小字对比
    textTertiary: "#A9A3AF",
    accent: "#A8C7FA", // M3 dark primary
    accentSoft: "rgba(168, 199, 250, 0.16)",
    danger: "#FFB4AB",
    warn: "#FFD8A8",
    ok: "#A6D8B4"
  },
  type: {
    brand: { size: 22, lineHeight: 28, weight: 400 }, // headline-small
    cardTitle: { size: 16, lineHeight: 24, weight: 500, tracking: 0.15 }, // body-large + emphasized
    gameName: { size: 12, lineHeight: 16, weight: 500 }, // label-medium
    range: { size: 12, lineHeight: 16, weight: 400 }, // body-small
    remain: { size: 14, lineHeight: 20, weight: 500 }, // body-medium emphasized
    sectionTitle: { size: 14, lineHeight: 20, weight: 500 }, // title-small
    badge: { size: 11, lineHeight: 16, weight: 500, tracking: 0.5 }, // label-small
    tabLabel: { size: 12, lineHeight: 16, weight: 500 } // label-medium
  },
  metric: {
    sideMargin: 16,
    cardRadius: 12,
    cardGap: 8,
    cardPaddingY: 12,
    cardPaddingX: 12,
    tabbarHeight: 64,
    tabbarInset: 0,
    tabbarRadius: 0,
    touchMin: 48,
    iconButton: 48,
    motionFast: 250
  }
};

/* ──────────────────── HarmonyOS（鸿蒙） ──────────────────── */
/**
 * [H] 边距 16vp；卡片间距 12vp；主次文本 2vp；圆角 4/8/16/20/32（层级越高越大）；
 *     底部 Tab 平铺 48vp / **悬浮胶囊 56vp**、图标 24vp、文字 10vp；
 *     点击热区 ≥48vp 推荐、不得小于 40vp；
 *     字号 Body_L 16 / Body_M 14 / Body_S 12 / Caption_L 12 / Caption_M 10。
 *     暗色**用明度表达层级、不靠投影**；正文对比 >5:1，且不得 >17.6:1。
 */
const HARMONY: PlatformSpec = {
  id: "harmony",
  label: "鸿蒙",
  unitNote: "vp/fp（HarmonyOS Design）",
  color: {
    bg: "#000000",
    surface: "#0A0A0B",
    card: "#17181A",
    cardAlt: "#22242A",
    line: "#2C2F35",
    text: "#F2F3F5",
    textSecondary: "#CDD1D9",
    textTertiary: "#AEB4BF",
    accent: "#5B9BFF", // 官方锚点 #007DFF 提亮到可做正文色
    accentSoft: "rgba(91, 155, 255, 0.16)",
    danger: "#FF7A7D",
    warn: "#FFB768",
    ok: "#3FD9A4"
  },
  type: {
    brand: { size: 24, lineHeight: 32, weight: 500 }, // Title_S 20 与 Title_M 24 之间取大
    cardTitle: { size: 16, lineHeight: 22, weight: 500 }, // Body_L
    gameName: { size: 12, lineHeight: 18, weight: 400 }, // Body_S
    range: { size: 12, lineHeight: 18, weight: 400 }, // Body_S
    remain: { size: 14, lineHeight: 20, weight: 500 }, // Body_M
    sectionTitle: { size: 14, lineHeight: 20, weight: 500 }, // Body_M
    badge: { size: 10, lineHeight: 14, weight: 400 }, // Caption_M（官方 10fp）
    tabLabel: { size: 10, lineHeight: 14, weight: 400 } // 底部 Tab 文字 10vp
  },
  metric: {
    sideMargin: 16,
    cardRadius: 16, // 官网：卡片/内容容器 16
    cardGap: 12, // 官网：卡片之间 12vp
    cardPaddingY: 12,
    cardPaddingX: 14,
    tabbarHeight: 56, // 悬浮式 56vp
    tabbarInset: 12,
    tabbarRadius: 20,
    touchMin: 48,
    iconButton: 48,
    motionFast: 200
  }
};

export const PLATFORMS: Record<Platform, PlatformSpec> = {
  ios: IOS,
  material: MATERIAL,
  harmony: HARMONY
};

export const PLATFORM_ORDER: Platform[] = ["ios", "material", "harmony"];

/* ─────────────────────── 对比度工具 ─────────────────────── */

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 解析 #RRGGBB → 相对亮度 */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`不支持的颜色格式：${hex}`);
  const value = m[1]!;
  const r = srgbToLinear(Number.parseInt(value.slice(0, 2), 16));
  const g = srgbToLinear(Number.parseInt(value.slice(2, 4), 16));
  const b = srgbToLinear(Number.parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度 */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/* ─────────────────────── 应用主题 ─────────────────────── */

/** 把 token 写进 CSS 变量，CSS 只负责结构 */
export function applyTheme(element: HTMLElement, platform: Platform): void {
  const spec = PLATFORMS[platform];
  const set = (name: string, value: string | number): void => {
    element.style.setProperty(name, String(value));
  };

  for (const [key, value] of Object.entries(spec.color)) {
    set(`--c-${kebab(key)}`, value);
  }

  for (const [key, token] of Object.entries(spec.type)) {
    const name = kebab(key);
    set(`--t-${name}-size`, `${token.size}px`);
    set(`--t-${name}-lh`, `${token.lineHeight}px`);
    set(`--t-${name}-weight`, token.weight);
    set(`--t-${name}-tracking`, `${token.tracking ?? 0}px`);
  }

  for (const [key, value] of Object.entries(spec.metric)) {
    set(`--m-${kebab(key)}`, `${value}px`);
  }

  element.dataset["platform"] = platform;
}

function kebab(input: string): string {
  return input.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
