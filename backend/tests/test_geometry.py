"""Tests for deterministic geometry tools, using real values from the live UK NOTAM feed."""
import math

import pytest
from shapely.geometry import shape

from services import geometry as g


# ---- coordinate parsing -------------------------------------------------------------

def approx(a, b, tol=1e-4):
    return abs(a - b) <= tol


def test_parse_ddmm_qline_form():
    lon, lat = g.parse_coordinate("5408N00316W")
    assert approx(lat, 54 + 8 / 60)
    assert approx(lon, -(3 + 16 / 60))


def test_parse_ddmmss_form():
    lon, lat = g.parse_coordinate("511904N 0004747W")
    assert approx(lat, 51 + 19 / 60 + 4 / 3600)
    assert approx(lon, -(0 + 47 / 60 + 47 / 3600))


def test_parse_decimal_seconds_form():
    lon, lat = g.parse_coordinate("540729.21N 0031431.85W")
    assert approx(lat, 54 + 7 / 60 + 29.21 / 3600)
    assert approx(lon, -(3 + 14 / 60 + 31.85 / 3600))


def test_parse_eastern_and_southern():
    lon, lat = g.parse_coordinate("512802N 0000059E")
    assert lon > 0
    lon, lat = g.parse_coordinate("512802S 0000059W")
    assert lat < 0 and lon < 0


def test_parse_rejects_garbage():
    with pytest.raises(g.CoordinateParseError):
        g.parse_coordinate("NOT A COORD")


def test_parse_rejects_out_of_range_minutes():
    with pytest.raises(g.CoordinateParseError):
        g.parse_coordinate("5399N00316W")  # 99 minutes invalid


# ---- circle geometry ----------------------------------------------------------------

def test_circle_radius_is_accurate():
    lon, lat = -3.24, 54.12
    poly = g.circle_polygon(lon, lat, radius_nm=1.0)
    # farthest vertex from centre should be ~1 NM (1852 m). Check via local metric.
    lat_m = 111_320.0
    lon_m = 111_320.0 * math.cos(math.radians(lat))
    cx, cy = lon * lon_m, lat * lat_m
    max_d = max(math.hypot(x * lon_m - cx, y * lat_m - cy) for x, y in poly.exterior.coords)
    assert 1750 < max_d < 1950  # ~1852 m, allowing for projection + facet error


# ---- end-to-end build_geometry on real feed examples --------------------------------

def test_point_radius_obstacle_L4371():
    # CRANE OPR WI 0.1NM RADIUS OF 540729.21N 0031431.85W
    e = ("CRANE OPR WI 0.1NM RADIUS OF 540729.21N 0031431.85W (0.92NM "
         "104.49 DEG MAG FM WALNEY ARP). MAX HGT 140FT AMSL (90FT AGL).")
    res = g.build_geometry(e, "5407N00315W", 1.0)
    assert res.source == "item_e_point_radius"
    assert res.confidence >= 0.9
    assert res.geometry["type"] == "Polygon"


def test_point_radius_winch_H4103():
    e = ("GLIDER ACTIVITY WITH WINCH LAUNCH WI 2NM RADIUS 512628N 0021645W "
         "(COLERNE AIRFIELD). MAX HGT 2000FT AGL.")
    res = g.build_geometry(e, "5126N00217W", 3.0)
    assert res.source == "item_e_point_radius"
    lon, lat = g.parse_coordinate("512628N 0021645W")
    assert shape(res.geometry).contains(__import__("shapely").geometry.Point(lon, lat))


def test_bounded_polygon_elstree_L3071():
    e = ("NEWLY CONSTRUCTED HANGAR AND ACCESS ROAD WI 10M RADIUS OF AREA BOUNDED BY: "
         "513928.0N 0001937.0W - 513923.9N 0001936.0W - 513925.0N 0001920.6W "
         "(NORTH SIDE GRASS OPPOSITE D TWY AND HELIPAD, ELSTREE AD) HGT 50FT AGL/382FT AMSL)")
    # This one has BOTH a "10M RADIUS" and "BOUNDED BY"; point-radius wins deterministically.
    res = g.build_geometry(e, "5139N00019W", 1.0)
    assert res.source in ("item_e_point_radius", "item_e_bounded")
    assert res.geometry["type"] == "Polygon"


def test_pure_bounded_polygon():
    e = ("TEMPO DANGER AREA (TDA) EGD187E INSTALLED WI AREA BOUNDED BY "
         "512802N 0000059W - 513331N 0000942W - 513004N 0000712W - 512802N 0000059W")
    res = g.build_geometry(e, "5130N00007W", 10.0)
    assert res.source == "item_e_bounded"
    assert len(res.geometry["coordinates"][0]) >= 3


def test_arc_lowers_confidence_and_flags():
    e = ("DANGER AREA WI AREA BOUNDED BY 512802N 0000059W - 513331N 0000942W - "
         "513004N 0000712W THEN CLOCKWISE BY ARC TO 512802N 0000059W")
    res = g.build_geometry(e, "5130N00007W", 5.0)
    assert "contains_arc_needs_review" in res.flags
    assert res.confidence <= 0.6


def test_qline_fallback_when_no_item_e_geometry():
    res = g.build_geometry("AD CLOSED", "5408N00316W", 5.0)
    assert res.source == "qline_circle"
    assert "coarse_qline_only" in res.flags


def test_unplaceable_fails_loud_not_silent():
    res = g.build_geometry("SOME TEXT WITH NO COORDS", "", None)
    assert res.source == "unplaceable"
    assert res.geometry == {}
    assert "no_geometry_extracted" in res.flags


def test_route_buffer_red_arrows_shape():
    # Charter's Red Arrows example coordinates.
    wpts = [g.parse_coordinate(c) for c in
            ["530858N 0003125W", "531153N 0003908W", "530908N 0005609W", "531509N 0010251W"]]
    poly = g.route_buffer_polygon(wpts, width_nm=2.0)
    assert poly.is_valid and poly.area > 0
    # A 2 NM corridor is far smaller than the 21 NM Q-line circle it replaces.
    circle = g.circle_polygon(-0.47, 53.22, 21.0)
    assert poly.area < circle.area
