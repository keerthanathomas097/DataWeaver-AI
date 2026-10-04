import io
import numpy as np
from PIL import Image, ImageDraw


def create_solid_image(color=(200, 200, 200), size=(64, 64), mode="RGB") -> Image.Image:
    """Creates a solid color image (flat, low variance)."""
    return Image.new(mode, size, color=color)


def create_grayscale_image(size=(64, 64)) -> Image.Image:
    """Creates a grayscale mode image."""
    arr = np.linspace(0, 255, size[0] * size[1], dtype=np.uint8).reshape(size)
    return Image.fromarray(arr, mode="L")


def create_line_art_image(size=(64, 64)) -> Image.Image:
    """Creates a line-art / diagram / text-like image on white background."""
    img = Image.new("RGB", size, color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.line([(5, 5), (size[0] - 5, size[1] - 5)], fill=(0, 0, 0), width=2)
    draw.rectangle([(10, 10), (30, 30)], outline=(0, 0, 0), fill=(240, 240, 240))
    return img


def create_natural_photo_image(size=(64, 64), seed=42) -> Image.Image:
    """Creates a synthetic photographic image with high color channel variance."""
    rng = np.random.default_rng(seed)
    # Generate colorful textured gradient/noise pattern
    x = np.linspace(0, 10, size[1])
    y = np.linspace(0, 10, size[0])
    xx, yy = np.meshgrid(x, y)
    
    r = np.clip((np.sin(xx) * 100 + 128 + rng.normal(0, 25, size)), 0, 255).astype(np.uint8)
    g = np.clip((np.cos(yy) * 100 + 128 + rng.normal(0, 25, size)), 0, 255).astype(np.uint8)
    b = np.clip((np.sin(xx + yy) * 100 + 128 + rng.normal(0, 25, size)), 0, 255).astype(np.uint8)
    
    arr = np.stack([r, g, b], axis=-1)
    return Image.fromarray(arr, mode="RGB")


def image_to_bytes(img: Image.Image, format="JPEG", quality=95) -> bytes:
    """Converts a PIL Image to raw bytes."""
    buf = io.BytesIO()
    if format == "JPEG" and img.mode in ("RGBA", "P", "L"):
        img = img.convert("RGB")
    img.save(buf, format=format, quality=quality)
    return buf.getvalue()
