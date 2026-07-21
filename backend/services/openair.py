"""
OpenAir format serializer for XCSoar, LX Navigation, and SeeYou.
Transforms GeoJSON NOTAM FeatureCollections into valid OpenAir airspace blocks.
"""
from typing import List, Dict, Any

def _deg_to_dms(deg: float, is_lat: bool) -> str:
    """Convert decimal degrees to DD:MM:SS N/S or DDD:MM:SS E/W."""
    direction = ""
    if is_lat:
        direction = "N" if deg >= 0 else "S"
        deg = abs(deg)
        d = int(deg)
        m = int((deg - d) * 60)
        s = int(round(((deg - d) * 60 - m) * 60))
        return f"{d:02d}:{m:02d}:{s:02d} {direction}"
    else:
        direction = "E" if deg >= 0 else "W"
        deg = abs(deg)
        d = int(deg)
        m = int((deg - d) * 60)
        s = int(round(((deg - d) * 60 - m) * 60))
        return f"{d:03d}:{m:02d}:{s:02d} {direction}"

def geojson_to_openair(features: List[Dict[str, Any]]) -> str:
    """Generates an OpenAir string from a list of GeoJSON features."""
    lines = [
        "*****************************************************************",
        "* UK NOTAM OpenAir Airspace File - Generated for VFR / Gliders *",
        "*****************************************************************",
        ""
    ]
    
    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry")
        
        # Skip unplaceable for OpenAir file export as they lack spatial coordinates,
        # but record in header comments if desired
        if not geom or not geom.get("coordinates"):
            continue
            
        hazard_type = props.get("hazard_type", "R")
        notam_id = props.get("notam_id", "NOTAM")
        label = props.get("hazard_label", hazard_type)
        
        # Airspace Class mapping
        ac_class = "R"
        if "Parachute" in label or "Drop" in label or "Danger" in label:
            ac_class = "Q"
        elif "Winch" in label:
            ac_class = "W"
            
        lower_fl = props.get("lower_fl")
        upper_fl = props.get("upper_fl")
        
        al_str = f"FL{lower_fl:03d}" if lower_fl and lower_fl > 0 else "SFC"
        ah_str = f"FL{upper_fl:03d}" if upper_fl and upper_fl < 999 else "UNL"
        
        lines.append(f"AC {ac_class}")
        lines.append(f"AN {label} ({notam_id})")
        lines.append(f"AH {ah_str}")
        lines.append(f"AL {al_str}")
        
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])
        
        if gtype == "Polygon" and coords:
            ring = coords[0]
            for pt in ring:
                lng, lat = pt[0], pt[1]
                lines.append(f"DP {_deg_to_dms(lat, True)} {_deg_to_dms(lng, False)}")
        elif gtype == "LineString" and coords:
            for pt in coords:
                lng, lat = pt[0], pt[1]
                lines.append(f"DP {_deg_to_dms(lat, True)} {_deg_to_dms(lng, False)}")
        elif gtype == "Point" and coords:
            lng, lat = coords[0], coords[1]
            lines.append(f"V X={_deg_to_dms(lat, True)} {_deg_to_dms(lng, False)}")
            lines.append("DC 3.0") # Default 3 NM circle for point obstacles/hazards
            
        lines.append("") # blank separator
        
    return "\n".join(lines)
