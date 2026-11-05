#!/usr/bin/env python3
"""Normalise the public-domain NASA/JPL moon maps into the app's 1024x512 textures.

Usage: prepare_moon_textures.py <source dir> <output dir>     (needs Pillow and NumPy)

Source files, all placed directly in <source dir>:
  https://space.jpl.nasa.gov/tmaps/pix/<name>.jpg
      mar1kuu2 mar2kuu2 jup1vss2 jup2vuu2 jup3vuu2 jup4vuu2 sat6fss1
      ura1vuu2 ura2vuu2 ura3vuu2 ura4vuu2 ura5vuu2
  https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia18/pia<id>/PIA<id>.jpg
      18434 18435 18436 18437 18438 18439 18668

What each step is for:
  fill_gaps     Voyager never imaged parts of these moons, and those regions are
                pure black in the source. They are filled with the moon's flat mean
                colour, deliberately not with invented terrain.
  flatten       Divides out low-frequency brightness, which hides Callisto's
                blurred, too-bright coverage gaps while keeping its craters.
  saturation    The Cassini maps are enhanced-colour composites; this brings them
                closer to what the eye would see.
  tint          Greyscale maps are given the moon's approximate natural colour.
  center_180    Cassini maps are centred on longitude 180. The renderer expects
                longitude 0 at the centre, so these are rolled half a turn.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
SIZE = (1024, 512)

RECIPES = {
    "phobos": {"src": "mar1kuu2.jpg", "tint": (0.66, 0.60, 0.54), "gain": 0.8},
    "deimos": {"src": "mar2kuu2.jpg", "tint": (0.72, 0.65, 0.57), "gain": 0.8},
    "io": {"src": "jup1vss2.jpg", "saturation": 0.72},
    "europa": {"src": "jup2vuu2.jpg", "tint": (1.0, 0.93, 0.82)},
    "ganymede": {"src": "jup3vuu2.jpg", "tint": (0.92, 0.86, 0.78)},
    "callisto": {"src": "jup4vuu2.jpg", "flatten": 0.42, "tint": (0.82, 0.74, 0.65)},
    "mimas": {"src": "PIA18437.jpg", "saturation": 0.35, "center_180": True},
    "enceladus": {"src": "PIA18435.jpg", "saturation": 0.45, "center_180": True},
    "tethys": {"src": "PIA18439.jpg", "saturation": 0.35, "center_180": True},
    "dione": {"src": "PIA18434.jpg", "saturation": 0.35, "center_180": True},
    "rhea": {"src": "PIA18438.jpg", "saturation": 0.35, "center_180": True},
    "iapetus": {"src": "PIA18436.jpg", "saturation": 0.5, "center_180": True},
    "titan": {"src": "sat6fss1.jpg", "saturation": 0.72},
    "miranda": {"src": "ura5vuu2.jpg", "fill_gaps": True, "tint": (0.9, 0.9, 0.92)},
    "ariel": {"src": "ura1vuu2.jpg", "fill_gaps": True, "tint": (0.92, 0.92, 0.94)},
    "umbriel": {"src": "ura2vuu2.jpg", "fill_gaps": True, "tint": (0.8, 0.8, 0.82)},
    "titania": {"src": "ura3vuu2.jpg", "fill_gaps": True, "tint": (0.92, 0.89, 0.87)},
    "oberon": {"src": "ura4vuu2.jpg", "fill_gaps": True, "tint": (0.88, 0.83, 0.8)},
    "triton": {"src": "PIA18668.jpg", "fill_gaps": True, "saturation": 0.55},
}


def blur(array, radius):
    """Gaussian-blur a float RGB or single-channel array in the 0..1 range."""
    if array.ndim == 2:
        return np.asarray(
            Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255))
            .filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255
    return np.stack([blur(array[..., c], radius) for c in range(array.shape[-1])], axis=-1)


def fill_gaps(rgb):
    valid = rgb.max(axis=-1) > 0.035
    mean = rgb[valid].mean(axis=0)
    # Feather so the mapped terrain does not end in a hard, jagged line.
    weight = np.clip(blur(valid.astype(np.float32), 14) * 2 - 1, 0, 1)[..., None]
    return rgb * weight + mean * (1 - weight)


def flatten(rgb, target):
    low = blur(rgb, 42)
    return np.clip(rgb / np.maximum(low, 0.02) * target, 0, 1)


def set_saturation(rgb, amount):
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    return luma[..., None] + (rgb - luma[..., None]) * amount


def process(path, recipe):
    image = Image.open(path).convert("RGB").resize(SIZE, Image.LANCZOS)
    rgb = np.asarray(image, dtype=np.float32) / 255
    if recipe.get("fill_gaps"):
        rgb = fill_gaps(rgb)
    if "flatten" in recipe:
        rgb = flatten(rgb, recipe["flatten"])
    if "saturation" in recipe:
        rgb = set_saturation(rgb, recipe["saturation"])
    if "tint" in recipe:
        rgb = rgb * np.array(recipe["tint"], dtype=np.float32)
    if "gain" in recipe:
        rgb = rgb * recipe["gain"]
    if recipe.get("center_180"):
        rgb = np.roll(rgb, SIZE[0] // 2, axis=1)
    return Image.fromarray(np.uint8(np.clip(rgb, 0, 1) * 255))


def main():
    source, output = Path(sys.argv[1]), Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    for name, recipe in RECIPES.items():
        process(source / recipe["src"], recipe).save(output / f"{name}.jpg", quality=84, optimize=True)
        print(name)


if __name__ == "__main__":
    main()
