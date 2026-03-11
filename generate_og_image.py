from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "og-home-repair-slc-v2.jpg"
WIDTH = 1200
HEIGHT = 630


def get_font(size: int, bold: bool = False, serif: bool = False) -> ImageFont.FreeTypeFont:
    candidates = []
    if serif:
        candidates.extend(
            [
                "C:/Windows/Fonts/georgiab.ttf" if bold else "C:/Windows/Fonts/georgia.ttf",
                "C:/Windows/Fonts/timesbd.ttf" if bold else "C:/Windows/Fonts/times.ttf",
            ]
        )
    candidates.extend(
        [
            "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        ]
    )
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def blend(c1: tuple[int, int, int], c2: tuple[int, int, int], ratio: float) -> tuple[int, int, int]:
    return tuple(int(a + (b - a) * ratio) for a, b in zip(c1, c2))


def draw_gradient(canvas: Image.Image, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(canvas)
    for y in range(HEIGHT):
        mix = y / max(1, HEIGHT - 1)
        draw.line((0, y, WIDTH, y), fill=blend(top, bottom, mix))


def draw_glow(canvas: Image.Image, center: tuple[int, int], radius: int, color: tuple[int, int, int, int]) -> None:
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=36))
    canvas.alpha_composite(overlay)


def ridge_points(
    baseline: int,
    heights: list[int],
    offsets: list[int],
    lead: int = -120,
    tail: int = WIDTH + 120,
) -> list[tuple[int, int]]:
    step = WIDTH // (len(heights) - 1)
    points = [(lead, baseline)]
    for idx, height in enumerate(heights):
        x = idx * step + offsets[idx]
        points.append((x, baseline - height))
    points.extend([(tail, baseline), (lead, baseline)])
    return points


def draw_ridge(
    canvas: Image.Image,
    baseline: int,
    heights: list[int],
    offsets: list[int],
    fill: tuple[int, int, int, int],
    snow: bool = False,
) -> None:
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    points = ridge_points(baseline, heights, offsets)
    draw.polygon(points, fill=fill)
    if snow:
        for idx in range(2, len(heights) - 1, 2):
            peak_x, peak_y = points[idx]
            snow_cap = [
                (peak_x - 26, peak_y + 18),
                (peak_x - 6, peak_y + 4),
                (peak_x + 6, peak_y + 10),
                (peak_x + 22, peak_y + 26),
                (peak_x + 2, peak_y + 24),
            ]
            draw.polygon(snow_cap, fill=(242, 248, 255, 215))
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=1.2))
    canvas.alpha_composite(overlay)


def draw_text_block(canvas: Image.Image) -> None:
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    panel_box = (72, 320, 720, 554)
    draw.rounded_rectangle(panel_box, radius=34, fill=(250, 252, 255, 228), outline=(225, 233, 245, 255), width=2)
    draw.rounded_rectangle((108, 370, 240, 378), radius=999, fill=(244, 123, 52, 255))
    draw.text((108, 404), "Home Repair Services", font=get_font(52, bold=True, serif=True), fill=(17, 31, 58, 255))
    draw.text((108, 460), "in Salt Lake City", font=get_font(50, bold=False, serif=True), fill=(28, 51, 88, 255))
    canvas.alpha_composite(overlay)


def draw_foreground(canvas: Image.Image) -> None:
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.polygon(
        [
            (0, 530),
            (140, 502),
            (288, 520),
            (412, 496),
            (562, 524),
            (712, 490),
            (858, 524),
            (1012, 492),
            (1200, 530),
            (1200, 630),
            (0, 630),
        ],
        fill=(34, 57, 91, 255),
    )
    draw.rectangle((0, 572, WIDTH, HEIGHT), fill=(23, 39, 67, 255))
    canvas.alpha_composite(overlay)


def build_image() -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_gradient(canvas, (217, 232, 255), (255, 242, 229))
    draw_glow(canvas, (870, 174), 132, (255, 215, 165, 180))
    draw_ridge(canvas, 392, [72, 162, 118, 196, 128, 176, 108], [-120, 8, -24, 36, -20, 26, 160], (150, 171, 202, 255))
    draw_ridge(canvas, 452, [88, 224, 158, 242, 172, 214, 132], [-120, 4, -14, 28, -24, 22, 160], (92, 118, 156, 255), snow=True)
    draw_ridge(canvas, 516, [46, 128, 94, 154, 112, 138, 80], [-120, 12, -18, 16, -12, 24, 160], (63, 88, 122, 255))
    draw_foreground(canvas)
    draw_text_block(canvas)
    return canvas.convert("RGB")


def main() -> None:
    image = build_image()
    image.save(OUTPUT_PATH, quality=92, optimize=True, progressive=True)
    print(f"Saved {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
