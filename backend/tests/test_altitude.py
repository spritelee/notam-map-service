"""Tests for vertical-limit parsing and altitude-band filtering, using real feed formats."""
import math

from services import altitude as alt


# ---- parse_limit --------------------------------------------------------------------

def test_surface_forms():
    for s in ("SFC", "GND", "SURFACE", "0"):
        assert alt.parse_limit(s) == 0.0


def test_flight_level():
    assert alt.parse_limit("FL050") == 5000.0
    assert alt.parse_limit("FL195") == 19500.0
    assert alt.parse_limit("FL660") == 66000.0


def test_feet_amsl_and_agl():
    assert alt.parse_limit("500FT AMSL") == 500.0
    assert alt.parse_limit("2000FT AGL") == 2000.0
    assert alt.parse_limit("17000FT AMSL") == 17000.0


def test_unlimited():
    assert alt.parse_limit("UNL") == math.inf


def test_metres_converted():
    assert abs(alt.parse_limit("300M AMSL") - 984.25) < 1.0


def test_unparseable_returns_none():
    assert alt.parse_limit("NOTAM TEXT") is None
    assert alt.parse_limit("") is None


# ---- band_from_fields ---------------------------------------------------------------

def test_prefers_item_fg():
    b = alt.band_from_fields("SFC", "2000FT AGL", 0, 999)
    assert b.source == "item_fg"
    assert b.lower_ft == 0.0 and b.upper_ft == 2000.0


def test_item_g_unlimited_is_none_upper():
    b = alt.band_from_fields("FL050", "UNL", 50, 999)
    assert b.source == "item_fg"
    assert b.lower_ft == 5000.0 and b.upper_ft is None  # unlimited


def test_falls_back_to_qline_flight_levels():
    b = alt.band_from_fields("", "", 0, 30)
    assert b.source == "qline"
    assert b.lower_ft == 0.0 and b.upper_ft == 3000.0


def test_qline_999_is_unlimited():
    b = alt.band_from_fields("", "", 0, 999)
    assert b.source == "qline" and b.upper_ft is None


def test_extracts_max_hgt_from_item_e():
    # Real winch example: "GLIDER ACTIVITY WITH WINCH LAUNCH ... MAX HGT 2000FT AGL"
    assert alt.upper_from_item_e("GLIDER ACTIVITY WI 2NM RADIUS. MAX HGT 2000FT AGL.") == 2000.0
    assert alt.upper_from_item_e("DISPLAY. MAX ALT FL050. FOR INFO...") == 5000.0
    assert alt.upper_from_item_e("NO CEILING STATED HERE") is None


def test_item_e_maxhgt_used_when_no_item_fg():
    b = alt.band_from_fields("", "", 0, 999, item_e="WINCH LAUNCH. MAX HGT 2000FT AGL.")
    assert b.source == "item_e_maxhgt"
    assert b.lower_ft == 0.0 and b.upper_ft == 2000.0
    # This now correctly hides the winch from a high-altitude en-route band.
    assert b.intersects(10000, 45000) is False


def test_item_fg_still_wins_over_item_e():
    b = alt.band_from_fields("SFC", "500FT AMSL", 0, 999, item_e="MAX HGT 9000FT AGL")
    assert b.source == "item_fg" and b.upper_ft == 500.0


def test_unknown_when_nothing_present():
    b = alt.band_from_fields("", "", None, None)
    assert b.source == "unknown" and not b.known


# ---- intersects ---------------------------------------------------------------------

def test_low_hazard_hidden_from_high_flyer():
    # 0-2000ft winch launch vs an airliner en-route floor of FL100 (10000ft).
    b = alt.band_from_fields("SFC", "2000FT AGL", 0, 20)
    assert b.intersects(0, 10000) is True          # a glider from the ground sees it
    assert b.intersects(10000, 45000) is False     # the airliner en-route does not


def test_high_hazard_hidden_from_low_glider():
    # An upper-airspace item FL200-FL245 vs a glider capped at 10000ft.
    b = alt.band_from_fields("FL200", "FL245", 200, 245)
    assert b.intersects(0, 10000) is False
    assert b.intersects(0, 30000) is True


def test_unknown_band_always_kept():
    b = alt.band_from_fields("", "", None, None)
    assert b.intersects(0, 5000) is True           # fail toward visibility


def test_unlimited_top_reaches_any_ceiling():
    b = alt.band_from_fields("SFC", "UNL", 0, 999)
    assert b.intersects(30000, 45000) is True
