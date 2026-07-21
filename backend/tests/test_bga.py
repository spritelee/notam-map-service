import pytest
from backend.services.bga import parse_dm_coord, parse_cup_file, get_bga_turnpoints

def test_parse_dm_coord_lat():
    # 57 degrees, 04.600 minutes North
    # 57 + (4.6 / 60) = 57.076667
    val = parse_dm_coord("5704.600N")
    assert pytest.approx(val, abs=1e-5) == 57.076667

def test_parse_dm_coord_lon():
    # 002 degrees, 50.250 minutes West
    # -(2 + (50.250 / 60)) = -2.8375
    val = parse_dm_coord("00250.250W")
    assert pytest.approx(val, abs=1e-5) == -2.8375

def test_parse_dm_coord_invalid():
    assert parse_dm_coord("") == 0.0
    assert parse_dm_coord("INVALID") == 0.0

def test_parse_cup_file():
    mock_cup_content = """name,code,country,lat,lon,elev,style,rwdir,rwlen,rwsurf,freq,desc
"Aboyne","ABO",UK,5704.600N,00250.250W,137m,1,,,,,
"Bicester","BIC",UK,5154.966N,00108.052W,82m,1,,,,,
"""
    parsed = parse_cup_file(mock_cup_content)
    assert len(parsed) == 2
    
    assert parsed[0]["code"] == "ABO"
    assert parsed[0]["name"] == "Aboyne"
    assert pytest.approx(parsed[0]["lat"], abs=1e-5) == 57.076667
    assert pytest.approx(parsed[0]["lon"], abs=1e-5) == -2.8375
    # Elevation 137m * 3.28084 = 449.47 -> 449 ft
    assert parsed[0]["elev"] == 449

    assert parsed[1]["code"] == "BIC"
    assert parsed[1]["name"] == "Bicester"

def test_get_bga_turnpoints():
    import asyncio
    geojson = asyncio.run(get_bga_turnpoints())
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) > 50
    
    first = geojson["features"][0]
    assert first["type"] == "Feature"
    assert "code" in first["properties"]
    assert "name" in first["properties"]
    assert len(first["geometry"]["coordinates"]) == 2
