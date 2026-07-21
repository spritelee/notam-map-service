"""Pipeline tests: the same complete dataset, viewed through different persona lenses."""
import os

import pytest

from services import nats_ais_client as nats
from services import qcodes
from services.pipeline import notams_to_geojson

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures_pib_sample.xml")


@pytest.fixture(scope="module")
def notams():
    with open(FIXTURE, "rb") as f:
        return nats.parse_pib_xml(f.read())


def test_default_shows_everything(notams):
    fc = notams_to_geojson(notams)
    assert fc["meta"]["persona"] is None
    assert fc["meta"]["count"] == len(notams)  # nothing hidden by default


def test_each_persona_is_a_subset_of_the_whole(notams):
    full = notams_to_geojson(notams)["meta"]["count"]
    for persona in sorted(qcodes.ALL_PERSONAS):
        n = notams_to_geojson(notams, persona=persona)["meta"]["count"]
        assert 0 < n <= full


def test_personas_differ(notams):
    glider = notams_to_geojson(notams, persona=qcodes.GLIDER)["meta"]["count"]
    ifr = notams_to_geojson(notams, persona=qcodes.COMMERCIAL_IFR)["meta"]["count"]
    # Different kinds of pilot see meaningfully different subsets.
    assert glider != ifr


def test_aerodrome_notam_hidden_from_glider_shown_to_ifr(notams):
    # An 'AD CLOSED' style aerodrome NOTAM: not a glider en-route concern, but an IFR/aerodrome one.
    fa = next(n for n in notams if qcodes.classify(n.code23).hazard_type == "AERODROME")
    single = [fa]
    assert notams_to_geojson(single, persona=qcodes.GLIDER)["meta"]["count"] == 0
    assert notams_to_geojson(single, persona=qcodes.COMMERCIAL_IFR)["meta"]["count"] == 1


def test_danger_area_shown_to_all_personas(notams):
    rd = next(n for n in notams if qcodes.classify(n.code23).hazard_type == "DANGER_AREA")
    for persona in qcodes.ALL_PERSONAS:
        assert notams_to_geojson([rd], persona=persona)["meta"]["count"] == 1


def test_unknown_persona_rejected(notams):
    with pytest.raises(ValueError):
        notams_to_geojson(notams, persona="ASTRONAUT")


def test_features_carry_persona_tags(notams):
    fc = notams_to_geojson(notams[:5])
    for f in fc["features"]:
        assert isinstance(f["properties"]["relevant_personas"], list)
        assert set(f["properties"]["relevant_personas"]) <= qcodes.ALL_PERSONAS


def test_altitude_filter_declutters(notams):
    full = notams_to_geojson(notams)["meta"]["count"]
    low = notams_to_geojson(notams, max_altitude_ft=10000)["meta"]["count"]
    # Capping at 10,000ft hides upper-airspace-only NOTAMs.
    assert low < full


def test_altitude_and_persona_compose(notams):
    glider_low = notams_to_geojson(notams, persona=qcodes.GLIDER, max_altitude_ft=10000)["meta"]["count"]
    glider_all = notams_to_geojson(notams, persona=qcodes.GLIDER)["meta"]["count"]
    assert glider_low <= glider_all


def test_en_route_airliner_band_hides_low_level(notams):
    # A high-flying dispatcher persona: floor FL100, ceiling FL450.
    hi = notams_to_geojson(notams, min_altitude_ft=10000, max_altitude_ft=45000)["meta"]["count"]
    full = notams_to_geojson(notams)["meta"]["count"]
    assert hi < full


def test_features_carry_vertical_band(notams):
    fc = notams_to_geojson(notams[:20])
    for f in fc["features"]:
        p = f["properties"]
        assert p["vertical_source"] in ("item_fg", "item_e_maxhgt", "qline", "unknown")
        assert "_band" not in p  # internal helper stripped
    # top-level feature should not leak the helper either
    assert all("_band" not in f for f in fc["features"])


def test_json_serialisable(notams):
    import json
    json.dumps(notams_to_geojson(notams, persona=qcodes.GLIDER, max_altitude_ft=10000))
