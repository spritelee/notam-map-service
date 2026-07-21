"""
Deterministic geometry tools for NOTAM parsing.

Design principle (see IMPLEMENTATION_PLAN.md): the LLM never computes coordinates.
It may *identify* which tokens in the free text are coordinates or a route, but every
number that ends up on the map is produced by the tested, deterministic functions here.

Coordinate string forms seen in the live UK (NATS/EAD) feed:
    5408N00316W              DDMM / DDDMM        (QLine <Coordinates>, coarse)
    511904N 0004747W         DDMMSS / DDDMMSS    (ItemE, precise)
    540729.21N 0031431.85W   DDMMSS.ss           (ItemE, precise)
All are WGS84. Output is always (lon, lat) decimal degrees, GeoJSON axis order.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Optional

from shapely.geometry import LineString, Point, Polygon, mapping
from shapely.ops import transform

NM_TO_M = 1852.0
_M_PER_DEG_LAT = 111_320.0

# A single lat/lon coordinate token, tolerant of an optional space between lat and lon
# and optional decimal seconds. Degrees are 2 digits for lat, 3 for lon.
_COORD_RE = re.compile(
    r"(?P<lat>\d{4,6}(?:\.\d+)?)\s*(?P<ns>[NS])\s*(?P<lon>\d{5,7}(?:\.\d+)?)\s*(?P<ew>[EW])"
)

# "WI 0.5NM RADIUS OF <coord>"  /  "WI 10M RADIUS OF AREA BOUNDED BY"  /  "WI 2NM RADIUS <coord>"
_POINT_RADIUS_RE = re.compile(
    r"WI\s+(?P<val>\d+(?:\.\d+)?)\s*(?P<unit>NM|KM|M)\s+RADIUS\s+(?:OF\s+)?(?P<coord>\d{4,6}(?:\.\d+)?[NS]\s*\d{5,7}(?:\.\d+)?[EW])",
    re.IGNORECASE,
)

_ARC_RE = re.compile(r"\b(ARC|CLOCKWISE|ANTI-CLOCKWISE|ANTICLOCKWISE|THENCE)\b", re.IGNORECASE)


class CoordinateParseError(ValueError):
    """Raised when a coordinate token cannot be interpreted. Never guess — fail loud."""


def _split_dms(digits: str, deg_len: int) -> tuple[int, int, float]:
    """Split a run of digits (optionally with decimal seconds) into (deg, min, sec)."""
    if "." in digits:
        int_part, dec_part = digits.split(".", 1)
    else:
        int_part, dec_part = digits, ""
    deg = int(int_part[:deg_len])
    rest = int_part[deg_len:]
    if len(rest) == 2:  # DDMM (no seconds)
        minutes = int(rest)
        seconds = 0.0
    elif len(rest) == 4:  # DDMMSS
        minutes = int(rest[:2])
        seconds = float(rest[2:] + ("." + dec_part if dec_part else ""))
    else:
        raise CoordinateParseError(f"Unexpected coordinate digit layout: {digits!r}")
    if not (0 <= minutes < 60 and 0 <= seconds < 60):
        raise CoordinateParseError(f"Minutes/seconds out of range in {digits!r}")
    return deg, minutes, seconds


def parse_coordinate(token: str) -> tuple[float, float]:
    """Parse a NOTAM coordinate token into (lon, lat) decimal degrees (WGS84)."""
    m = _COORD_RE.search(token.strip())
    if not m:
        raise CoordinateParseError(f"No coordinate found in {token!r}")
    d, mn, sc = _split_dms(m.group("lat"), deg_len=2)
    lat = d + mn / 60 + sc / 3600
    if m.group("ns").upper() == "S":
        lat = -lat
    d, mn, sc = _split_dms(m.group("lon"), deg_len=3)
    lon = d + mn / 60 + sc / 3600
    if m.group("ew").upper() == "W":
        lon = -lon
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise CoordinateParseError(f"Coordinate out of range: lat={lat} lon={lon}")
    return lon, lat


def _local_meter_transforms(lat0: float, lon0: float):
    """Equirectangular projection centred at (lon0, lat0). Accurate for small (few-NM) areas."""
    m_per_deg_lon = _M_PER_DEG_LAT * math.cos(math.radians(lat0))

    def fwd(lon, lat):
        return (lon - lon0) * m_per_deg_lon, (lat - lat0) * _M_PER_DEG_LAT

    def inv(x, y):
        return lon0 + x / m_per_deg_lon, lat0 + y / _M_PER_DEG_LAT

    return fwd, inv


def circle_polygon(lon: float, lat: float, radius_nm: float, quad_segs: int = 32) -> Polygon:
    """Circle of given radius (NM) around a point, returned as a WGS84 Polygon."""
    fwd, inv = _local_meter_transforms(lat, lon)
    disc = Point(0, 0).buffer(radius_nm * NM_TO_M, quad_segs=quad_segs)
    return transform(lambda xs, ys: inv(xs, ys), disc)


def route_buffer_polygon(waypoints: list[tuple[float, float]], width_nm: float,
                         quad_segs: int = 16) -> Polygon:
    """Protective corridor around an ordered list of (lon, lat) waypoints (the Red Arrows case)."""
    if len(waypoints) < 2:
        raise ValueError("route_buffer_polygon needs at least two waypoints")
    lat0 = sum(p[1] for p in waypoints) / len(waypoints)
    lon0 = sum(p[0] for p in waypoints) / len(waypoints)
    fwd, inv = _local_meter_transforms(lat0, lon0)
    line = LineString([fwd(lon, lat) for lon, lat in waypoints])
    corridor = line.buffer(width_nm * NM_TO_M, quad_segs=quad_segs)
    return transform(lambda xs, ys: inv(xs, ys), corridor)


@dataclass
class GeometryResult:
    geometry: dict                      # GeoJSON geometry
    source: str                         # item_e_point_radius | item_e_bounded | qline_circle | unplaceable
    confidence: float                   # 0..1
    flags: list[str] = field(default_factory=list)


def _to_nm(val: float, unit: str) -> float:
    unit = unit.upper()
    if unit == "NM":
        return val
    if unit == "KM":
        return val * 1000 / NM_TO_M
    if unit == "M":
        return val / NM_TO_M
    raise ValueError(f"Unknown radius unit {unit!r}")


def extract_point_radius(item_e: str) -> Optional[tuple[float, float, float]]:
    """Return (lon, lat, radius_nm) from a 'WI <n><unit> RADIUS OF <coord>' phrase, else None."""
    m = _POINT_RADIUS_RE.search(item_e)
    if not m:
        return None
    lon, lat = parse_coordinate(m.group("coord"))
    return lon, lat, _to_nm(float(m.group("val")), m.group("unit"))


def extract_bounded_polygon(item_e: str) -> Optional[list[tuple[float, float]]]:
    """Return the ordered ring of an 'AREA BOUNDED BY ... a - b - c' phrase, else None."""
    upper = item_e.upper()
    idx = upper.find("BOUNDED BY")
    if idx == -1:
        return None
    tail = item_e[idx:]
    pts = [parse_coordinate(mo.group(0)) for mo in _COORD_RE.finditer(tail)]
    if len(pts) < 3:
        return None
    return pts


def build_geometry(item_e: str, qline_coord: str, qline_radius_nm: Optional[float]) -> GeometryResult:
    """
    Deterministic geometry for a single NOTAM, preferring precise ItemE geometry over the
    coarse QLine, and never silently failing: an unparseable NOTAM yields source='unplaceable'.
    """
    has_arc = bool(_ARC_RE.search(item_e))

    # 1. Precise point-radius from ItemE (obstacles, gliding, winch, parachute, lasers, ...)
    pr = extract_point_radius(item_e)
    if pr:
        lon, lat, r_nm = pr
        flags = ["arc_segment_ignored"] if has_arc else []
        return GeometryResult(mapping(circle_polygon(lon, lat, r_nm)),
                              "item_e_point_radius", 0.95 if not has_arc else 0.6, flags)

    # 2. Bounded polygon from ItemE (TDA/TRA/danger areas)
    try:
        ring = extract_bounded_polygon(item_e)
    except CoordinateParseError:
        ring = None
    if ring:
        flags = ["contains_arc_needs_review"] if has_arc else []
        return GeometryResult(mapping(Polygon(ring)), "item_e_bounded",
                              0.6 if has_arc else 0.9, flags)

    # 3. Fallback: coarse QLine circle
    if qline_coord and qline_radius_nm is not None:
        try:
            lon, lat = parse_coordinate(qline_coord)
            return GeometryResult(mapping(circle_polygon(lon, lat, qline_radius_nm)),
                                  "qline_circle", 0.5, ["coarse_qline_only"])
        except CoordinateParseError:
            pass

    # 4. Fail loud — surface as raw text, never drop.
    return GeometryResult({}, "unplaceable", 0.0, ["no_geometry_extracted"])
