from __future__ import annotations

import argparse
import copy
import json
import math
import os
import re
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
CONFIG_JS = ROOT / "script.js"
PHOTO_PATH = ROOT / "Me.png"
OUTPUT_PATH = ROOT / "card-share-light.jpg"

DEFAULT_STATE: dict[str, Any] = {
    "t": {
        "name": "801 Home Repair",
        "sub": "Rob K.  |  Independent handyman",
        "head": "Fast local handyman help",
        "head2": "floors, doors, repairs, turnovers",
        "phLabel": "CALL OR TEXT",
        "ph": "",
        "whyTitle": "Why people keep this card",
        "why": [
            "Fast response",
            "Clean work",
            "Clear estimates",
            "Easy to refer to family and friends",
        ],
        "jobsTitle": "Popular jobs",
        "jobs": [
            "Vinyl Plank",
            "Door Installs",
            "Deck/Stair Repairs",
            "Drywall Touchups",
            "Painting",
            "Custom Organization",
            "Turnover Work",
        ],
        "foot": "Serving Midvale + Salt Lake County",
    },
    "e": {
        "brand": {"x": 62, "y": 72, "s": 1.0},
        "photo": {"x": 592, "y": 64, "z": 206},
        "hero": {"x": 62, "y": 236, "s": 1.0},
        "phone": {"x": 62, "y": 354, "w": 736, "h": 132, "r": 22},
        "why": {"x": 62, "y": 538, "s": 1.0},
        "jobs": {"x": 62, "y": 782, "s": 1.0},
        "foot": {"x": 62, "y": 1006, "s": 1.0},
    },
}


def read_config_phone(default: str = "+18015550123") -> str:
    if not CONFIG_JS.exists():
        return default
    text = CONFIG_JS.read_text(encoding="utf-8")
    match = re.search(r'PHONE:\s*"([^"]+)"', text)
    return match.group(1).strip() if match else default


def to_display_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return phone


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    px = max(8, int(round(size)))
    candidates = [
        ("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        ("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
    ]
    for font_path in candidates:
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size=px)
    return ImageFont.load_default()


def make_circle_photo(source_path: Path, size: int) -> Image.Image:
    src = Image.open(source_path).convert("RGB")
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 3
    top = max(0, min(top, h - side))
    crop = src.crop((left, top, left + side, top + side)).resize((size, size), Image.Resampling.LANCZOS)

    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.ellipse((0, 0, size - 1, size - 1), fill=255)

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(crop, (0, 0))
    out.putalpha(mask)
    return out


def deep_merge(base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def sanitize_state(state: dict[str, Any]) -> None:
    text = state.get("t", {})
    for key in ("name", "sub", "head", "head2", "phLabel", "ph", "whyTitle", "jobsTitle", "foot"):
        text[key] = str(text.get(key, "")).strip()
    text["why"] = [str(x).strip() for x in text.get("why", []) if str(x).strip()]
    text["jobs"] = [str(x).strip() for x in text.get("jobs", []) if str(x).strip()]
    if not text["why"]:
        text["why"] = DEFAULT_STATE["t"]["why"][:]
    if not text["jobs"]:
        text["jobs"] = DEFAULT_STATE["t"]["jobs"][:]

    elems = state.get("e", {})
    for key in ("brand", "photo", "hero", "phone", "why", "jobs", "foot"):
        if key not in elems or not isinstance(elems[key], dict):
            elems[key] = copy.deepcopy(DEFAULT_STATE["e"][key])
    for key in ("brand", "hero", "why", "jobs", "foot"):
        elems[key]["s"] = max(0.6, min(1.8, float(elems[key].get("s", 1.0))))
    elems["photo"]["z"] = max(80, min(380, int(round(float(elems["photo"].get("z", 206))))))
    elems["phone"]["w"] = max(260, min(760, int(round(float(elems["phone"].get("w", 736))))))
    elems["phone"]["h"] = max(92, min(220, int(round(float(elems["phone"].get("h", 132))))))
    elems["phone"]["r"] = max(10, min(40, int(round(float(elems["phone"].get("r", 22))))))


def chip(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, scale: float) -> int:
    font = get_font(int(round(22 * scale)), bold=True)
    padding_x = int(round(14 * scale))
    padding_y = int(round(8 * scale))
    radius = int(round(16 * scale))
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    box_w = w + padding_x * 2
    box_h = h + padding_y * 2
    draw.rounded_rectangle((x, y, x + box_w, y + box_h), radius=radius, fill=(244, 247, 252), outline=(214, 224, 240), width=1)
    draw.text((x + padding_x, y + padding_y - 1), text, font=font, fill=(21, 32, 57))
    return int(round(box_w + 10 * scale))


def create_editor_image(phone_raw: str, layout: dict[str, Any] | None = None) -> Image.Image:
    state = copy.deepcopy(DEFAULT_STATE)
    if layout:
        deep_merge(state, layout)
    sanitize_state(state)

    text = state["t"]
    elems = state["e"]
    if not text["ph"]:
        text["ph"] = to_display_phone(phone_raw)

    w, h = 860, 1100
    canvas = Image.new("RGB", (w, h), (240, 246, 255))
    draw = ImageDraw.Draw(canvas)

    # Soft background accents.
    draw.ellipse((-120, -120, 390, 280), fill=(215, 230, 255))
    draw.ellipse((560, -80, 980, 280), fill=(255, 233, 213))

    # Main card shell.
    card_box = (28, 28, w - 28, h - 28)
    draw.rounded_rectangle(card_box, radius=34, fill=(255, 255, 255), outline=(217, 227, 241), width=2)

    # Brand.
    brand = elems["brand"]
    bx = int(round(float(brand.get("x", 62))))
    by = int(round(float(brand.get("y", 72))))
    bs = float(brand.get("s", 1.0))
    draw.text((bx, by), text["name"], font=get_font(45 * bs, bold=True), fill=(12, 25, 52))
    draw.text((bx + 2, by + int(round(53 * bs))), text["sub"], font=get_font(24 * bs), fill=(51, 66, 98))

    # Photo.
    if PHOTO_PATH.exists():
        photo = elems["photo"]
        pz = int(round(float(photo.get("z", 206))))
        px = int(round(float(photo.get("x", w - 62 - pz))))
        py = int(round(float(photo.get("y", 64))))
        p = make_circle_photo(PHOTO_PATH, pz)
        canvas.paste(p, (px, py), p)
        draw.ellipse((px, py, px + pz, py + pz), outline=(220, 230, 244), width=3)

    # Headline block.
    hero = elems["hero"]
    hx = int(round(float(hero.get("x", 62))))
    hy = int(round(float(hero.get("y", 236))))
    hs = float(hero.get("s", 1.0))
    if text["head"]:
        draw.text((hx, hy), text["head"], font=get_font(42 * hs, bold=True), fill=(12, 25, 52))
    if text["head2"]:
        draw.text((hx, hy + int(round(50 * hs))), text["head2"], font=get_font(31 * hs), fill=(46, 62, 96))

    # Phone box.
    phone = elems["phone"]
    px = int(round(float(phone.get("x", 62))))
    py = int(round(float(phone.get("y", 354))))
    pw = int(round(float(phone.get("w", 736))))
    ph = int(round(float(phone.get("h", 132))))
    pr = int(round(float(phone.get("r", 22))))
    phone_box = (px, py, px + pw, py + ph)
    draw.rounded_rectangle(phone_box, radius=pr, fill=(31, 80, 204))

    phone_label = text["phLabel"] or "CALL OR TEXT"
    phone_value = text["ph"] or to_display_phone(phone_raw)
    label_font = get_font(25, bold=True)
    value_font = get_font(54, bold=True)
    label_bbox = draw.textbbox((0, 0), phone_label, font=label_font)
    value_bbox = draw.textbbox((0, 0), phone_value, font=value_font)
    label_h = label_bbox[3] - label_bbox[1]
    value_h = value_bbox[3] - value_bbox[1]
    line_gap = 10
    total_h = label_h + line_gap + value_h
    top_y = py + ((ph - total_h) // 2)
    draw.text((px + 30, top_y - label_bbox[1]), phone_label, font=label_font, fill=(217, 233, 255))
    draw.text((px + 30, top_y + label_h + line_gap - value_bbox[1]), phone_value, font=value_font, fill=(255, 255, 255))

    # Why block.
    why = elems["why"]
    wx = int(round(float(why.get("x", 62))))
    wy = int(round(float(why.get("y", 538))))
    ws = float(why.get("s", 1.0))
    draw.text((wx, wy), text["whyTitle"], font=get_font(31 * ws, bold=True), fill=(34, 49, 78))

    line_y = wy + int(round(46 * ws))
    step = int(round(45 * ws))
    item_font = get_font(28 * ws)
    for line in text["why"]:
        dot_x1 = wx + int(round(4 * ws))
        dot_y1 = line_y + int(round(10 * ws))
        dot_x2 = wx + int(round(18 * ws))
        dot_y2 = line_y + int(round(24 * ws))
        draw.ellipse((dot_x1, dot_y1, dot_x2, dot_y2), fill=(243, 115, 29))
        draw.text((wx + int(round(30 * ws)), line_y), line, font=item_font, fill=(15, 26, 50))
        line_y += step

    # Jobs block.
    jobs = elems["jobs"]
    jx = int(round(float(jobs.get("x", 62))))
    jy = int(round(float(jobs.get("y", 782))))
    js = float(jobs.get("s", 1.0))
    draw.text((jx, jy), text["jobsTitle"], font=get_font(31 * js, bold=True), fill=(34, 49, 78))

    x = jx
    y = jy + int(round(46 * js))
    for job in text["jobs"]:
        advance = chip(draw, job, x, y, js)
        x += advance
        if x > w - int(round(270 * js)):
            x = jx
            y += int(round(58 * js))

    # Footer.
    foot = elems["foot"]
    fx = int(round(float(foot.get("x", 62))))
    fy = int(round(float(foot.get("y", h - 94))))
    fs = float(foot.get("s", 1.0))
    if text["foot"]:
        draw.text((fx, fy), text["foot"], font=get_font(24 * fs, bold=True), fill=(61, 77, 108))
    return canvas


def draw_hexagon(draw: ImageDraw.ImageDraw, cx: int, cy: int, radius: int, color: tuple[int, int, int], width: int = 3) -> None:
    points: list[tuple[int, int]] = []
    for i in range(6):
        angle = (i * 60) - 30
        rad = math.radians(angle)
        x = int(round(cx + radius * math.cos(rad)))
        y = int(round(cy + radius * math.sin(rad)))
        points.append((x, y))
    draw.polygon(points, outline=color, width=width)


def cover_crop(source: Image.Image, target_w: int, target_h: int, top_bias: float = 0.35) -> Image.Image:
    src = source.convert("RGB")
    sw, sh = src.size
    target_ratio = target_w / target_h
    src_ratio = sw / sh
    if src_ratio > target_ratio:
        nw = int(round(sh * target_ratio))
        nx = (sw - nw) // 2
        ny = 0
        crop = src.crop((nx, ny, nx + nw, ny + sh))
    else:
        nh = int(round(sw / target_ratio))
        nx = 0
        ny = int(round((sh - nh) * top_bias))
        ny = max(0, min(ny, sh - nh))
        crop = src.crop((nx, ny, nx + sw, ny + nh))
    return crop.resize((target_w, target_h), Image.Resampling.LANCZOS)


def create_template_image(phone_raw: str, layout: dict[str, Any] | None = None) -> Image.Image:
    state = copy.deepcopy(DEFAULT_STATE)
    if layout:
        deep_merge(state, layout)
    sanitize_state(state)

    text = state["t"]
    phone_value = (text["ph"] or to_display_phone(phone_raw)).strip()
    business_name = text["name"] or "801 Home Repair"
    subtitle = text["sub"] or "Rob | Independent Handyman"
    services = text["jobs"][:] if text["jobs"] else DEFAULT_STATE["t"]["jobs"][:]

    w, h = 860, 1100
    pad = 18
    card = (pad, pad, w - pad, h - pad)
    right = card[2]
    bottom = card[3]
    top_band_bottom = 300
    blue_top = 300

    canvas = Image.new("RGB", (w, h), (232, 240, 253))
    draw = ImageDraw.Draw(canvas)

    # Card background.
    draw.rounded_rectangle(card, radius=26, fill=(255, 255, 255), outline=(210, 222, 241), width=2)

    # Dark top band.
    dark = (45, 49, 57)
    draw.rounded_rectangle((card[0], card[1], right, top_band_bottom), radius=24, fill=dark)
    draw.rectangle((card[0], top_band_bottom - 24, right, top_band_bottom), fill=dark)

    # Blue panel.
    blue = (34, 150, 206)
    panel = [
        (card[0], blue_top),
        (388, blue_top),
        (518, bottom),
        (card[0], bottom),
    ]
    draw.polygon(panel, fill=blue)

    # Photo polygon on right.
    photo_poly = [
        (380, blue_top),
        (right, blue_top),
        (right, bottom),
        (518, bottom),
    ]
    if PHOTO_PATH.exists():
        src = Image.open(PHOTO_PATH).convert("RGB")
        photo_w = right - 380
        photo_h = bottom - blue_top
        photo = cover_crop(src, photo_w, photo_h, top_bias=0.34)
        layer = Image.new("RGB", (w, h), (0, 0, 0))
        layer.paste(photo, (380, blue_top))
        mask = Image.new("L", (w, h), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.polygon(photo_poly, fill=255)
        canvas.paste(layer, (0, 0), mask)

    # Decoration.
    draw_hexagon(draw, right - 84, 92, 34, (7, 160, 232), width=3)
    draw_hexagon(draw, 540, 490, 31, (11, 170, 235), width=3)
    draw_hexagon(draw, 582, 548, 22, (14, 155, 220), width=2)
    draw_hexagon(draw, 498, 570, 16, (20, 45, 62), width=2)
    draw.polygon([(right - 72, 326), (right - 30, 326), (right - 14, 360), (right - 56, 398), (right - 86, 360)], fill=(245, 248, 252))
    draw.polygon([(right - 18, 250), (right + 34, 250), (right + 4, 294)], fill=blue)

    # Header text.
    draw.text((66, 122), business_name, font=get_font(79, bold=True), fill=(10, 161, 231))
    draw.text((66, 198), subtitle, font=get_font(42, bold=True), fill=(236, 242, 249))

    # Services block with consistent font and spacing.
    sx = 60
    sy = 350
    services_title = "OUR SERVICES"
    draw.text((sx, sy), services_title, font=get_font(35, bold=True), fill=(255, 255, 255))

    max_width = 305
    service_size = 51
    while service_size > 28:
        font = get_font(service_size)
        widest = 0
        for item in services:
            box = draw.textbbox((0, 0), item, font=font)
            widest = max(widest, box[2] - box[0])
        if widest <= max_width:
            break
        service_size -= 1

    item_font = get_font(service_size)
    line_step = service_size + 20
    check_size = max(10, int(service_size * 0.44))
    text_x = sx + check_size + 14
    line_y = sy + 54

    for item in services:
        draw.line(
            [
                (sx + 2, line_y + int(check_size * 0.50)),
                (sx + int(check_size * 0.34), line_y + int(check_size * 0.86)),
                (sx + check_size, line_y + int(check_size * 0.02)),
            ],
            fill=(12, 42, 64),
            width=max(2, int(check_size * 0.18)),
        )
        draw.text((text_x, line_y), item, font=item_font, fill=(214, 237, 255))
        line_y += line_step

    # CTA button + phone.
    btn_x1, btn_y1, btn_x2, btn_y2 = 150, 866, 350, 920
    draw.rounded_rectangle((btn_x1, btn_y1, btn_x2, btn_y2), radius=27, fill=(44, 53, 67))
    btn_text = text["phLabel"] or "CALL OR TEXT"
    btn_font = get_font(34, bold=True)
    bb = draw.textbbox((0, 0), btn_text, font=btn_font)
    draw.text((btn_x1 + ((btn_x2 - btn_x1 - (bb[2] - bb[0])) // 2), btn_y1 + 9), btn_text, font=btn_font, fill=(255, 255, 255))

    draw.text((40, 958), phone_value, font=get_font(64, bold=True), fill=(214, 238, 255))

    return canvas


def save_jpeg_under_size(img: Image.Image, out_path: Path, max_kb: int = 200) -> tuple[int, int]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    best_bytes = None
    best_quality = None

    for quality in range(72, 34, -2):
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True, progressive=True, subsampling="4:2:0")
        data = buf.getvalue()
        if best_bytes is None or len(data) < len(best_bytes):
            best_bytes = data
            best_quality = quality
        if len(data) <= max_kb * 1024:
            best_bytes = data
            best_quality = quality
            break

    out_path.write_bytes(best_bytes or b"")
    size_kb = int(out_path.stat().st_size / 1024)
    return best_quality or 0, size_kb


def load_layout_file(path: Path) -> dict[str, Any]:
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate lightweight share card image.")
    parser.add_argument("--layout", type=Path, help="Path to editor JSON layout.")
    parser.add_argument("--out", type=Path, default=OUTPUT_PATH, help="Output JPEG path.")
    parser.add_argument("--max-kb", type=int, default=200, help="Target maximum file size in KB.")
    parser.add_argument("--phone", type=str, default="", help="Optional phone override.")
    parser.add_argument(
        "--style",
        type=str,
        default="template",
        choices=["template", "editor"],
        help="Visual style preset: template (flyer-style) or editor (old layout).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    phone = args.phone.strip() or read_config_phone()
    layout = load_layout_file(args.layout) if args.layout else None

    if args.style == "editor":
        img = create_editor_image(phone, layout=layout)
    else:
        img = create_template_image(phone, layout=layout)
    quality, size_kb = save_jpeg_under_size(img, args.out, max_kb=args.max_kb)
    print(f"Wrote {args.out.name} ({size_kb} KB, quality {quality})")
    print(f"Phone on card: {to_display_phone(phone)}")
    print(f"Style: {args.style}")
    if args.layout:
        print(f"Used layout: {args.layout}")


if __name__ == "__main__":
    main()
