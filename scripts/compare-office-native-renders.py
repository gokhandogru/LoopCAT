"""Compare native source/copy renders and assemble source/translation QA images."""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / "test-artifacts" / "office-formatting" / "native"
renders = root / "renders"
results = []
for name in ("word", "excel", "powerpoint"):
    source = Image.open(renders / f"{name}-source.png").convert("RGB")
    copy = Image.open(renders / f"{name}-copy.png").convert("RGB")
    assert source.size == copy.size, f"{name}: source/copy page dimensions changed"
    difference = ImageChops.difference(source, copy)
    pixels = difference.tobytes()
    changed = sum(1 for index in range(0, len(pixels), 3) if pixels[index:index + 3] != b"\0\0\0")
    results.append({"application": name, "size": source.size, "source_copy_changed_pixels": changed})
    assert changed == 0, f"{name}: {changed} source/copy rendered pixels changed"

font_file = Path("C:/Windows/Fonts/arial.ttf")
font = ImageFont.truetype(str(font_file), 25) if font_file.exists() else ImageFont.load_default()
canvas = Image.new("RGB", (1600, 1950), "#e7ebf0")
draw = ImageDraw.Draw(canvas)
for row, name in enumerate(("word", "excel", "powerpoint")):
    y = row * 650
    for column, variant in enumerate(("source", "translated")):
        image = Image.open(renders / f"{name}-{variant}.png").convert("RGB")
        # The full pages are preserved separately; enlarge the Word content in the comparison.
        if name == "word":
            image = image.crop((45, 35, image.width - 45, min(600, image.height)))
        image.thumbnail((760, 570), Image.Resampling.LANCZOS)
        x = column * 800 + 20
        draw.text((x, y + 15), f"{name.title()} - {variant}", font=font, fill="#172335")
        canvas.paste(image, (x, y + 60))
canvas.save(root / "visual-comparison.png")
(root / "visual-results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
