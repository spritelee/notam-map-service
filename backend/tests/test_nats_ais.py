"""Tests for NATS PIB XML parsing, run against a real feed snapshot (2026-07-21)."""
import datetime as dt
import os

import pytest

from services import nats_ais_client as nats
from services import qcodes
from services.geometry import build_geometry

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures_pib_sample.xml")


@pytest.fixture(scope="module")
def notams():
    with open(FIXTURE, "rb") as f:
        return nats.parse_pib_xml(f.read())


def test_parses_expected_volume(notams):
    # The 2026-07-21 snapshot held ~1496 NOTAMs; assert it's a realistic bulk parse.
    assert len(notams) > 1000


def test_fields_populated_for_first_notam(notams):
    n = notams[0]
    assert n.notam_id and "/" in n.notam_id
    assert n.fir.startswith("EG")
    assert n.code23  # subject code present


def test_validity_parsing():
    d = nats.parse_validity("2607221030")
    assert d == dt.datetime(2026, 7, 22, 10, 30, tzinfo=dt.timezone.utc)
    assert nats.parse_validity("PERM") is None
    assert nats.parse_validity("") is None


def test_fir_filter(notams):
    egtt = [n for n in notams if n.fir == "EGTT"]
    assert 0 < len(egtt) < len(notams)


def test_end_to_end_every_notam_gets_a_disposition(notams):
    """The safety guarantee: every NOTAM either gets geometry or is flagged unplaceable — never dropped."""
    placed = unplaceable = 0
    for n in notams:
        res = build_geometry(n.item_e, n.qline_coord, n.qline_radius_nm)
        assert res.source in {
            "item_e_point_radius", "item_e_bounded", "qline_circle", "unplaceable"
        }
        if res.source == "unplaceable":
            unplaceable += 1
        else:
            placed += 1
    total = placed + unplaceable
    assert total == len(notams)
    # With the QLine circle fallback, nearly everything should place; report the rate.
    print(f"\nplaced={placed} unplaceable={unplaceable} "
          f"({100*placed/total:.1f}% placed) over {total} NOTAMs")
    assert placed / total > 0.9


def test_classification_covers_glider_hazards(notams):
    kinds = {}
    for n in notams:
        hc = qcodes.classify(n.code23)
        kinds.setdefault(hc.hazard_type, 0)
        kinds[hc.hazard_type] += 1
    # The feed is dominated by obstacles + UAS; both must classify.
    assert "OBSTACLE" in kinds
    assert "UAS" in kinds
    print("\nhazard type distribution:", dict(sorted(kinds.items(), key=lambda x: -x[1])))


def test_feed_validation_rejects_empty_or_corrupted_payload():
    invalid_xml = "<PIB><Notam><Series>A</Series></Notam></PIB>"
    with pytest.raises(ValueError, match="NATS PIB feed validation failed"):
        nats.parse_pib_xml(invalid_xml, validate=True, min_count=100)

