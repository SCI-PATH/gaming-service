"""Extract flower/corn crop sprites from the plants spritesheet into public/assets/crops."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "crops" / "plants.png"
OUT = ROOT / "public" / "assets" / "crops"

# Manually verified regions on the left half of plants.png (sunflower + grain)
CROPS = {
    "flower_crop.png": (58, 388, 100, 432),
    "flower_crop_sprout.png": (5, 408, 28, 432),
    "corn_crop.png": (60, 352, 100, 390),
    "corn_crop_sprout.png": (5, 360, 28, 390),
}


def save(left: Image.Image, box: tuple[int, int, int, int], name: str, canvas: int = 48) -> None:
    sprite = left.crop(box)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    sw, sh = sprite.size
    scale = min(canvas / sw, canvas / sh)
    nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
    sprite = sprite.resize((nw, nh), Image.NEAREST)
    out.paste(sprite, ((canvas - nw) // 2, (canvas - nh) // 2), sprite)
    out.save(OUT / name)
    print(f"saved {name} from {box}")


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    left = im.crop((0, 0, 384, 432))
    for name, box in CROPS.items():
        save(left, box, name)


if __name__ == "__main__":
    main()
