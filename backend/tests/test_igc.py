import pytest
from backend.main import decimal_to_igc_coord, find_closest_turnpoint_name

def test_decimal_to_igc_coord():
    # Lasham coordinates: ~ 51.1856N, 1.0322W (which is -1.0322)
    lat, lon = 51.1856, -1.0322
    
    lat_str, lon_str = decimal_to_igc_coord(lat, lon)
    
    assert lat_str.endswith("N")
    assert lon_str.endswith("W")
    
    # Check degree digits
    assert lat_str[:2] == "51"
    assert lon_str[:3] == "001"
    
    # Check minute digits length
    assert len(lat_str) == 8 # 2 deg + 5 min + 1 N/S
    assert len(lon_str) == 9 # 3 deg + 5 min + 1 E/W

def test_find_closest_turnpoint_name():
    bga_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-1.0322, 51.1856]},
            "properties": {"code": "LSH", "name": "Lasham Airfield"}
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-1.5000, 52.0000]},
            "properties": {"code": "XYZ", "name": "Test Turnpoint"}
        }
    ]
    
    # Close match
    name_matched = find_closest_turnpoint_name(-1.0321, 51.1857, bga_features)
    assert name_matched == "LSH Lasham Airfield"
    
    # No close match
    name_unmatched = find_closest_turnpoint_name(-2.0, 53.0, bga_features)
    assert "53.0000" in name_unmatched
