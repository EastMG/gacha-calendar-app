#!/usr/bin/env python3
"""生成 PWA 图标。

图形直接沿用 App 内的视觉语言：**一张带左侧色条的卡片**（事件卡就是这么画的），
再加两条文字占位线。纯几何绘制，不依赖字体（避免中文字体缺失导致方块）。

输出到 apps/preview/icons/：
  icon-192.png / icon-512.png / icon-180.png（apple-touch）/ favicon-32.png
  icon-maskable-512.png（安卓自适应图标：图形收进内 80% 安全区）

用法：python tools/make-icons.py
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw

BG = (15, 17, 19)          # #0F1113  与 manifest background_color 一致
CARD = (238, 241, 247)     # #EEF1F7  卡片
STRIPE = (108, 140, 255)   # #6C8CFF  强调色（同 Material 皮肤的 accent）
TEXT_LINE = (120, 130, 150)  # 次要线条

SS = 4  # 超采样倍率，缩小时获得抗锯齿


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_mark(img: Image.Image, size: int, scale: float) -> None:
    """在 size×size 画布上居中绘制图形；scale 控制图形占画布的比例。"""
    draw = ImageDraw.Draw(img)
    s = size * scale
    left = (size - s) / 2
    top = (size - s) / 2

    # 卡片本体（略竖长，像一张日程卡）
    card_w = s * 0.72
    card_h = s * 0.86
    cx = left + (s - card_w) / 2
    cy = top + (s - card_h) / 2
    radius = card_w * 0.18
    rounded_rect(draw, (cx, cy, cx + card_w, cy + card_h), radius, CARD)

    # 左侧色条：App 里每张事件卡的标识方式
    stripe_w = card_w * 0.11
    draw.rounded_rectangle(
        (cx, cy, cx + stripe_w + radius * 0.35, cy + card_h),
        radius=radius * 0.5,
        fill=STRIPE,
    )
    # 用卡片色把色条右侧削直，避免圆角糊到卡片外
    draw.rectangle((cx + stripe_w, cy + radius * 0.4, cx + stripe_w + radius, cy + card_h - radius * 0.4), fill=CARD)

    # 两条"文字"占位线
    line_x0 = cx + stripe_w + card_w * 0.16
    line_h = card_h * 0.085
    line_r = line_h / 2
    draw.rounded_rectangle(
        (line_x0, cy + card_h * 0.26, cx + card_w * 0.82, cy + card_h * 0.26 + line_h),
        radius=line_r,
        fill=TEXT_LINE,
    )
    draw.rounded_rectangle(
        (line_x0, cy + card_h * 0.46, cx + card_w * 0.60, cy + card_h * 0.46 + line_h),
        radius=line_r,
        fill=TEXT_LINE,
    )
    # 一条"倒计时"短条，用强调色
    draw.rounded_rectangle(
        (line_x0, cy + card_h * 0.66, cx + card_w * 0.58, cy + card_h * 0.66 + line_h * 1.05),
        radius=line_h * 0.52,
        fill=STRIPE,
    )


def make_icon(size: int, scale: float, corner: bool = True) -> Image.Image:
    """生成 size×size 图标。corner=True 时画圆角底板（用于非 maskable 场景）。"""
    big = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(big)
    if corner:
        radius = size * SS * 0.22
        draw.rounded_rectangle((0, 0, size * SS, size * SS), radius=radius, fill=BG)
    else:
        draw.rectangle((0, 0, size * SS, size * SS), fill=BG)

    if corner:
        draw_mark(big, size * SS, scale)
        return big.resize((size, size), Image.LANCZOS)

    # maskable：整块实底 + 图形收进安全区，合成后不透明
    draw_mark(big, size * SS, scale)
    return big.resize((size, size), Image.LANCZOS)


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    out = root / "apps" / "preview" / "icons"
    out.mkdir(parents=True, exist_ok=True)

    targets = [
        ("icon-192.png", 192, 1.0, True),
        ("icon-512.png", 512, 1.0, True),
        ("icon-180.png", 180, 1.0, True),      # apple-touch-icon（iOS 会自己切圆角，所以给方形底）
        ("favicon-32.png", 32, 1.08, True),
        ("icon-maskable-512.png", 512, 0.78, False),  # 图形收进内 78%，落在安全区内
    ]
    for name, size, scale, corner in targets:
        img = make_icon(size, scale, corner)
        img.save(out / name, "PNG", optimize=True)
        print(f"  {name:26} {size}x{size}  {(out / name).stat().st_size:>6} bytes")

    # iOS 苹果图标：给方形不透明底（iOS 会自己加圆角），避免透明边出现黑边
    ios = Image.new("RGBA", (180 * SS, 180 * SS), BG + (255,))
    draw_mark(ios, 180 * SS, 1.0)
    ios.resize((180, 180), Image.LANCZOS).convert("RGB").save(out / "icon-180.png", "PNG", optimize=True)
    print(f"  {'icon-180.png (重写为不透明)':26} 180x180")


if __name__ == "__main__":
    main()
