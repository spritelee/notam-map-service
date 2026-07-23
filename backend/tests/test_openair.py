from backend.services.openair import geojson_to_openair

def test_geojson_to_openair_header_and_disclaimer():
    features = [
        {
            "type": "Feature",
            "properties": {
                "notam_id": "EGTT/Q5678/26",
                "hazard_type": "TDA",
                "hazard_label": "Parachute Drop Area",
                "lower_fl": 0,
                "upper_fl": 120,
                "end_utc": "2026-07-25T18:00:00Z"
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [-1.15, 51.3],
                    [-1.10, 51.32],
                    [-1.08, 51.28],
                    [-1.15, 51.3]
                ]]
            }
        }
    ]
    meta = {
        "fetched_at": "2026-07-24T00:15:00Z",
        "feed_degraded": False
    }
    content = geojson_to_openair(features, meta=meta)

    assert "ALWAYS VERIFY AGAINST OFFICIAL NATS AIS BEFORE FLIGHT." in content
    assert "WARNING: NOT FOR OPERATIONAL OR SINGLE-SOURCE NAVIGATION." in content
    assert "Generated At:" in content
    assert "Valid Until:  2026-07-25 18:00:00 UTC" in content
    assert "Data as of:   2026-07-24 00:15:00 UTC" in content
    assert "Feed Status:  LIVE FEED OK" in content
    assert "AC Q" in content
    assert "AN Parachute Drop Area (EGTT/Q5678/26)" in content


def test_geojson_to_openair_degraded_feed():
    features = []
    meta = {
        "fetched_at": "2026-07-24T00:00:00Z",
        "feed_degraded": True
    }
    content = geojson_to_openair(features, meta=meta)

    assert "ALWAYS VERIFY AGAINST OFFICIAL NATS AIS BEFORE FLIGHT." in content
    assert "Data as of:   2026-07-24 00:00:00 UTC" in content
    assert "Feed Status:  DEGRADED (STALE CACHE)" in content
