#!/usr/bin/env python3
"""Compile the d3-celestial GeoJSON catalogs into the compact files the app loads.

Usage: build_sky.py <dir containing the d3-celestial data files> <output dir>

Inputs (from https://github.com/ofrohn/d3-celestial/tree/master/data):
  stars.8.json, constellations.json, constellations.lines.json

Outputs:
  stars.bin            little-endian Int16 records: ra, dec, mag, bv
                       ra  -> degrees * 32767 / 180
                       dec -> degrees * 32767 / 90
                       mag -> magnitude * 1000
                       bv  -> B-V colour index * 1000
  constellations.json  [{name, abbr, rank, label: [ra, dec], lines: [[[ra, dec], ...], ...]}]

All coordinates are J2000 equatorial, in degrees.
"""
import json
import struct
import sys
from pathlib import Path

MAX_MAGNITUDE = 7.5
DEFAULT_BV = 0.6  # roughly solar, for the few stars with no colour measurement


def clamp16(value):
    return max(-32767, min(32767, round(value)))


def build_stars(source, output):
    features = json.loads((source / "stars.8.json").read_text())["features"]
    kept = [f for f in features if f["properties"]["mag"] <= MAX_MAGNITUDE]
    kept.sort(key=lambda f: f["properties"]["mag"])  # brightest first
    with (output / "stars.bin").open("wb") as out:
        for feature in kept:
            ra, dec = feature["geometry"]["coordinates"]
            props = feature["properties"]
            try:
                bv = float(props.get("bv", ""))
            except ValueError:
                bv = DEFAULT_BV
            out.write(struct.pack(
                "<4h",
                clamp16(ra * 32767 / 180),
                clamp16(dec * 32767 / 90),
                clamp16(props["mag"] * 1000),
                clamp16(bv * 1000),
            ))
    return len(kept)


def round_point(point):
    return [round(point[0], 3), round(point[1], 3)]


def build_constellations(source, output):
    names = json.loads((source / "constellations.json").read_text())["features"]
    lines = json.loads((source / "constellations.lines.json").read_text())["features"]
    lines_by_id = {f["id"]: f["geometry"]["coordinates"] for f in lines}
    result = []
    for feature in names:
        props = feature["properties"]
        result.append({
            "name": props["name"],
            "abbr": props["desig"],
            "rank": int(props["rank"]),
            "label": round_point(feature["geometry"]["coordinates"]),
            "lines": [
                [round_point(p) for p in polyline]
                for polyline in lines_by_id.get(feature["id"], [])
            ],
        })
    (output / "constellations.json").write_text(json.dumps(result, separators=(",", ":")))
    return len(result)


def main():
    source, output = Path(sys.argv[1]), Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    print("stars:", build_stars(source, output))
    print("constellations:", build_constellations(source, output))


if __name__ == "__main__":
    main()
