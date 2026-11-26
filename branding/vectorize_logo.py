"""
Vectorize the HDH monogram (transparent PNG) into clean SVG logos + PNG icons.

Usage:  python3 branding/vectorize_logo.py
Input:  branding/source/hdh-logo.png   (black strokes on transparent background)
Output: src/components/atomic-crm/root/logos/hdh_logo_{ink,ivory,gold}.svg  (fine, large sizes)
        src/components/atomic-crm/root/logos/hdh_mark_{ink,ivory,gold}.svg  (bold, small sizes)
        public/logos/hdh_logo.svg, public/favicon.ico, public/appIcon/*.png
"""

from pathlib import Path

import numpy as np
import potrace
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "branding" / "source" / "hdh-logo.png"
LOGO_DIR = ROOT / "src" / "components" / "atomic-crm" / "root" / "logos"
PUBLIC = ROOT / "public"

INK = "#0E0E10"
IVORY = "#F6F2EA"
GOLD = "#C6A15B"

SCALE = 3  # upscale before tracing -> smoother curves
PAD = 6  # padding (in source px) around the glyph in the SVG viewBox


def trace_svg_path(alpha: np.ndarray) -> tuple[str, tuple[float, float, float, float]]:
    """Return (svg path data, viewBox) for the opaque area of an alpha mask."""
    h, w = alpha.shape
    big = Image.fromarray(alpha).resize((w * SCALE, h * SCALE), Image.LANCZOS)
    ink = np.array(big) >= 128
    # potracer expects True = background (it inverts internally)
    bm = potrace.Bitmap(~ink)
    plist = bm.trace(
        turdsize=8,
        turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0,
        opticurve=True,
        opttolerance=0.2,
    )

    def p(pt):
        return f"{pt.x / SCALE:.2f} {pt.y / SCALE:.2f}"

    parts = []
    for curve in plist:
        d = [f"M{p(curve.start_point)}"]
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f"L{p(seg.c)}L{p(seg.end_point)}")
            else:
                d.append(f"C{p(seg.c1)} {p(seg.c2)} {p(seg.end_point)}")
        d.append("Z")
        parts.append("".join(d))

    ys, xs = np.where(alpha >= 128)
    x0, y0 = xs.min() - PAD, ys.min() - PAD
    x1, y1 = xs.max() + PAD, ys.max() + PAD
    return "".join(parts), (float(x0), float(y0), float(x1 - x0), float(y1 - y0))


def embolden(alpha: np.ndarray, radius: int) -> np.ndarray:
    """Thicken strokes by `radius` px (morphological dilation on the alpha mask)."""
    if radius <= 0:
        return alpha
    img = Image.fromarray(alpha).filter(ImageFilter.MaxFilter(2 * radius + 1))
    return np.array(img.filter(ImageFilter.GaussianBlur(0.6)))


def write_svg(path: Path, d: str, vb, fill: str) -> None:
    x, y, w, h = vb
    path.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.0f} {y:.0f} {w:.0f} {h:.0f}" '
        f'role="img" aria-label="HDH"><path fill="{fill}" fill-rule="evenodd" d="{d}"/></svg>\n'
    )


def glyph_mask(alpha: np.ndarray, size: int) -> Image.Image:
    """Cropped, high quality glyph mask resized so its longest side == size."""
    ys, xs = np.where(alpha >= 8)
    crop = Image.fromarray(alpha[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1])
    cw, ch = crop.size
    k = size / max(cw, ch)
    return crop.resize((max(1, round(cw * k)), max(1, round(ch * k))), Image.LANCZOS)


def app_icon(alpha: np.ndarray, size: int, maskable: bool = False) -> Image.Image:
    """Ivory monogram on an ink rounded tile (full-bleed square when maskable)."""
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    if maskable:
        draw.rectangle([0, 0, size, size], fill=INK)
        glyph_size = int(size * 0.52)  # keep inside the maskable safe zone
    else:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=INK)
        glyph_size = int(size * 0.70)
    # natural stroke is ~8px at 500px; aim for >= ~1.3px strokes after resizing
    k = glyph_size / 494
    radius = int(min(12, max(0, (1.3 / k - 8) / 2)))
    mask = glyph_mask(embolden(alpha, radius), glyph_size)
    color = Image.new("RGBA", mask.size, IVORY)
    ox, oy = (size - mask.size[0]) // 2, (size - mask.size[1]) // 2
    tile.paste(color, (ox, oy), mask)
    return tile


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    alpha = np.array(im)[:, :, 3]

    d, vb = trace_svg_path(alpha)
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    write_svg(LOGO_DIR / "hdh_logo_ink.svg", d, vb, INK)
    write_svg(LOGO_DIR / "hdh_logo_ivory.svg", d, vb, IVORY)
    write_svg(LOGO_DIR / "hdh_logo_gold.svg", d, vb, GOLD)
    bd, bvb = trace_svg_path(embolden(alpha, 5))
    write_svg(LOGO_DIR / "hdh_mark_ink.svg", bd, bvb, INK)
    write_svg(LOGO_DIR / "hdh_mark_ivory.svg", bd, bvb, IVORY)
    write_svg(LOGO_DIR / "hdh_mark_gold.svg", bd, bvb, GOLD)
    (PUBLIC / "logos").mkdir(parents=True, exist_ok=True)
    write_svg(PUBLIC / "logos" / "hdh_logo.svg", d, vb, INK)

    icon_dir = PUBLIC / "appIcon"
    icon_dir.mkdir(parents=True, exist_ok=True)
    for f in icon_dir.glob("*.png"):
        f.unlink()
    for s in [16, 20, 29, 32, 40, 50, 57, 58, 60, 64, 72, 76, 80, 87, 100, 114, 120,
              128, 136, 144, 152, 167, 180, 192, 256, 512, 1024]:
        app_icon(alpha, s).save(icon_dir / f"{s}.png", optimize=True)
    app_icon(alpha, 1024, maskable=True).save(icon_dir / "maskable_icon.png", optimize=True)
    for s in [48, 72, 96, 128, 192, 384, 512]:
        app_icon(alpha, s, maskable=True).save(icon_dir / f"maskable_icon_x{s}.png", optimize=True)

    app_icon(alpha, 256).save(
        PUBLIC / "favicon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)]
    )
    print("viewBox:", vb, "| path chars:", len(d))


if __name__ == "__main__":
    main()
