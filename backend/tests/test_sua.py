from backend.services.sua import _deg_to_sua_dms, geojson_to_sua

def test_deg_to_sua_dms():
    # Test positive latitude (North)
    assert _deg_to_sua_dms(51.5, True) == "N513000"
    # Test negative latitude (South)
    assert _deg_to_sua_dms(-12.4233, True) == "S122524"
    # Test positive longitude (East)
    assert _deg_to_sua_dms(3.25, False) == "E0031500"
    # Test negative longitude (West)
    assert _deg_to_sua_dms(-1.1852, False) == "W0011107"

def test_geojson_to_sua_polygon():
    features = [
        {
            "type": "Feature",
            "properties": {
                "notam_id": "EGTT/Q1234/26",
                "hazard_type": "TDA",
                "hazard_label": "Temporary Danger Area",
                "lower_fl": 10,
                "upper_fl": 95
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
    sua_content = geojson_to_sua(features)
    assert "TYPE=NOTAM" in sua_content
    assert "TITLE=Temporary Danger Area (EGTT/Q1234/26)" in sua_content
    assert "CLASS=Q" in sua_content # Danger maps to Q
    assert "BASE=FL010" in sua_content
    assert "TOPS=FL095" in sua_content
    assert "POINT=N511800 W0010900" in sua_content
    assert "POINT=N511912 W0010600" in sua_content
    assert "POINT=N511648 W0010448" in sua_content
    assert "ALWAYS VERIFY AGAINST OFFICIAL NATS AIS BEFORE FLIGHT." in sua_content
    assert "Generated At:" in sua_content
    assert "Valid Until:" in sua_content


def test_geojson_to_sua_meta():
    features = []
    meta = {"fetched_at": "2026-07-24T00:10:00Z", "feed_degraded": True}
    sua_content = geojson_to_sua(features, meta=meta)
    assert "Data as of:   2026-07-24 00:10:00 UTC" in sua_content
    assert "Feed Status:  DEGRADED (STALE CACHE)" in sua_content
    assert "ALWAYS VERIFY AGAINST OFFICIAL NATS AIS BEFORE FLIGHT." in sua_content

