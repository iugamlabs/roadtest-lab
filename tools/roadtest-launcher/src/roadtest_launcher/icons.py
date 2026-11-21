from __future__ import annotations

from functools import lru_cache

from PIL import Image, ImageDraw

from roadtest_launcher.service import ServiceState

_COLORS: dict[ServiceState, tuple[int, int, int]] = {
    "stopped": (120, 120, 120),
    "starting": (210, 150, 40),
    "running": (40, 150, 90),
    "error": (190, 60, 60),
}


@lru_cache(maxsize=8)
def tray_icon(state: ServiceState, size: int = 64) -> Image.Image:
    color = _COLORS.get(state, _COLORS["stopped"])
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    margin = max(2, size // 10)
    draw.ellipse(
        (margin, margin, size - margin - 1, size - margin - 1),
        fill=(*color, 255),
    )
    # 内圆留一点层次，避免纯色块过于生硬。
    inner = margin + size // 5
    draw.ellipse(
        (inner, inner, size - inner - 1, size - inner - 1),
        fill=(255, 255, 255, 48),
    )
    return image


def window_icon(size: int = 128) -> Image.Image:
    return tray_icon("running", size=size)
