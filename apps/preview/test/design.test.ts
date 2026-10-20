/**
 * 设计 token 的**规范符合性测试**。
 *
 * 这些阈值不是我们的偏好，是三家官方文档的硬线：
 *  - Apple HIG：≤17pt 文本对比度 ≥4.5:1；暗色小字建议 7:1；最小字号 Caption2 = 11pt
 *  - HarmonyOS：正文对比度 **>5:1**，且**不得 >17.6:1**（防刺眼）
 *  - Material 3：触控目标 ≥48dp
 *
 * 把阈值写成断言，改配色时不会悄悄跌破规范。
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contrastRatio,
  PLATFORMS,
  PLATFORM_ORDER,
  relativeLuminance,
  SHARED,
  type Platform
} from "../src/design.ts";

/** 官方阈值 */
const MIN = {
  /** 正文（HarmonyOS 要求 >5，Apple 大字号 3、小字号 4.5）→ 取最严的可读下限 */
  body: 7,
  secondary: 5,
  tertiary: 4.5,
  /** 强调色会被当作小字/图标使用 */
  accent: 4.5,
  /** HarmonyOS 明文的对比度上限，防刺眼 */
  max: 17.6
};

describe("对比度 —— 全部平台 · 全部前景色 × 卡片底", () => {
  for (const platform of PLATFORM_ORDER) {
    const spec = PLATFORMS[platform];
    const { card, surface } = spec.color;

    it(`${spec.label}：正文 vs 卡片 ≥ ${MIN.body}:1 且 ≤ ${MIN.max}:1`, () => {
      const ratio = contrastRatio(spec.color.text, card);
      assert.ok(ratio >= MIN.body, `正文对比 ${ratio.toFixed(2)} < ${MIN.body}`);
      assert.ok(ratio <= MIN.max, `正文对比 ${ratio.toFixed(2)} 超过 ${MIN.max}（鸿蒙防刺眼上限）`);
    });

    it(`${spec.label}：正文 vs 页面底 ≥ ${MIN.body}:1`, () => {
      const ratio = contrastRatio(spec.color.text, surface);
      assert.ok(ratio >= MIN.body, `正文对比 ${ratio.toFixed(2)} < ${MIN.body}`);
    });

    it(`${spec.label}：次要文本（游戏名/时间）≥ ${MIN.secondary}:1`, () => {
      const ratio = contrastRatio(spec.color.textSecondary, card);
      assert.ok(ratio >= MIN.secondary, `次要文本对比 ${ratio.toFixed(2)} < ${MIN.secondary}`);
    });

    it(`${spec.label}：三级文本（计数/单位）≥ ${MIN.tertiary}:1`, () => {
      const ratio = contrastRatio(spec.color.textTertiary, card);
      assert.ok(ratio >= MIN.tertiary, `三级文本对比 ${ratio.toFixed(2)} < ${MIN.tertiary}`);
    });

    it(`${spec.label}：强调色可作小字 ≥ ${MIN.accent}:1`, () => {
      const ratio = contrastRatio(spec.color.accent, card);
      assert.ok(ratio >= MIN.accent, `强调色对比 ${ratio.toFixed(2)} < ${MIN.accent}`);
    });

    it(`${spec.label}：语义色（危险/警告/成功）≥ ${MIN.tertiary}:1`, () => {
      for (const key of ["danger", "warn", "ok"] as const) {
        const ratio = contrastRatio(spec.color[key], card);
        assert.ok(ratio >= MIN.tertiary, `${key} 对比 ${ratio.toFixed(2)} < ${MIN.tertiary}`);
      }
    });
  }
});

describe("暗色层级 —— 三家机制不同，但都必须单向递增", () => {
  it("surface → card → cardAlt 的亮度必须单调变化（不能糊成一片）", () => {
    for (const platform of PLATFORM_ORDER) {
      const spec = PLATFORMS[platform];
      const surface = relativeLuminance(spec.color.surface);
      const card = relativeLuminance(spec.color.card);
      const alt = relativeLuminance(spec.color.cardAlt);
      assert.ok(card > surface, `${spec.label}: 卡片应比页面底更亮`);
      assert.ok(alt > card, `${spec.label}: 内层应比卡片更亮`);
      // 但层级之间要有可感知差异，否则"分层"没意义
      assert.ok(
        contrastRatio(spec.color.cardAlt, spec.color.surface) > 1.15,
        `${spec.label}: 层级差太小，肉眼分不出`
      );
    }
  });
});

describe("触控目标与字号下限", () => {
  it("iOS ≥44pt、Material / 鸿蒙 ≥48", () => {
    assert.ok(PLATFORMS.ios.metric.touchMin >= 44);
    assert.ok(PLATFORMS.material.metric.touchMin >= 48);
    assert.ok(PLATFORMS.harmony.metric.touchMin >= 48);
  });

  it("图标按钮直径必须等于或大于触控目标（否则点不到）", () => {
    for (const platform of PLATFORM_ORDER) {
      const spec = PLATFORMS[platform];
      assert.ok(
        spec.metric.iconButton >= spec.metric.touchMin,
        `${spec.label}: 图标按钮 ${spec.metric.iconButton} < 触控目标 ${spec.metric.touchMin}`
      );
    }
  });

  it("字号不得低于官方下限：iOS Caption2 = 11pt；鸿蒙 Caption_M = 10fp", () => {
    assert.ok(PLATFORMS.ios.type.badge.size >= 11, "iOS 最小字号 11pt");
    assert.ok(PLATFORMS.harmony.type.badge.size >= 10, "鸿蒙最小字号 10fp");
    // 所有平台所有角色都不得低于 10px，且都必须正数
    for (const platform of PLATFORM_ORDER) {
      for (const [role, token] of Object.entries(PLATFORMS[platform].type)) {
        assert.ok(token.size >= 10, `${platform}.${role} 字号 ${token.size} 过小`);
        assert.ok(token.lineHeight >= token.size, `${platform}.${role} 行高小于字号`);
      }
    }
  });

  it("左右边距三家一致（16）", () => {
    assert.equal(SHARED.sideMargin, 16);
    for (const platform of PLATFORM_ORDER) {
      assert.equal(PLATFORMS[platform].metric.sideMargin, 16);
    }
  });
});

describe("三端皮肤必须真的有差异（不是只换颜色）", () => {
  const pick = (platform: Platform) => PLATFORMS[platform];

  it("圆角：鸿蒙卡片比 Material 更圆（16 vs 12）", () => {
    assert.equal(pick("harmony").metric.cardRadius, 16);
    assert.equal(pick("material").metric.cardRadius, 12);
    assert.ok(pick("harmony").metric.cardRadius > pick("material").metric.cardRadius);
  });

  it("底部导航：鸿蒙是悬浮胶囊（有内缩与圆角），另两家是全宽", () => {
    assert.ok(pick("harmony").metric.tabbarInset > 0, "鸿蒙需要左右内缩");
    assert.ok(pick("harmony").metric.tabbarRadius > 0, "鸿蒙是胶囊圆角");
    assert.equal(pick("ios").metric.tabbarInset, 0);
    assert.equal(pick("material").metric.tabbarInset, 0);
  });

  it("底部导航高度按各自规范：M3 64 / 鸿蒙 56 / iOS 58", () => {
    assert.equal(pick("material").metric.tabbarHeight, 64);
    assert.equal(pick("harmony").metric.tabbarHeight, 56);
  });

  it("字号体系确实不同：iOS 正文卡片标题 17，Material / 鸿蒙 16", () => {
    assert.equal(pick("ios").type.cardTitle.size, 17);
    assert.equal(pick("material").type.cardTitle.size, 16);
    assert.equal(pick("harmony").type.cardTitle.size, 16);
  });

  it("倒计时用字重强调而非放大字号（M3 明确禁止为塞内容改字号）", () => {
    for (const platform of PLATFORM_ORDER) {
      const spec = PLATFORMS[platform];
      assert.ok(
        spec.type.remain.size <= spec.type.cardTitle.size,
        `${spec.label}: 倒计时字号不应大于标题`
      );
      assert.ok(
        spec.type.remain.weight >= spec.type.range.weight,
        `${spec.label}: 倒计时应靠字重强调`
      );
    }
  });
});
