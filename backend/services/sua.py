"""
Tim Newport-Peace (TNP) SUA format serializer for XCSoar, Oudie, and LX Navigation.
Transforms GeoJSON NOTAM FeatureCollections into valid .sua airspace blocks.
"""
from typing import List, Dict, Any, Optional
import datetime


def _deg_to_sua_dms(deg: float, is_lat: bool) -> str:
    """Convert decimal degrees to NDDMMSS/SDDMMSS or EDDDMMSS/WDDDMMSS (no colons)."""
    direction = ""
    if is_lat:
        direction = "N" if deg >= 0 else "S"
        deg = abs(deg)
        d = int(deg)
        m = int((deg - d) * 60)
        s = int(round(((deg - d) * 60 - m) * 60))
        # Ensure seconds don't exceed 59 due to rounding
        if s >= 60:
            s = 0
            m += 1
        if m >= 60:
            m = 0
            d += 1
        return f"{direction}{d:02d}{m:02d}{s:02d}"
    else:
        direction = "E" if deg >= 0 else "W"
        deg = abs(deg)
        d = int(deg)
        m = int((deg - d) * 60)
        s = int(round(((deg - d) * 60 - m) * 60))
        if s >= 60:
            s = 0
            m += 1
        if m >= 60:
            m = 0
            d += 1
        return f"{direction}{d:03d}{m:02d}{s:02d}"

def geojson_to_sua(features: List[Dict[str, Any]], meta: Optional[Dict[str, Any]] = None) -> str:
    """Generates a Tim Newport-Peace SUA string from a list of GeoJSON features."""
    now = datetime.datetime.now(datetime.timezone.utc)
    gen_time_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    
    valid_until = None
    for feat in features:
        end_utc = feat.get("properties", {}).get("end_utc")
        if end_utc:
            try:
                dt_val = datetime.datetime.fromisoformat(end_utc.replace("Z", "+00:00"))
                if valid_until is None or dt_val < valid_until:
                    valid_until = dt_val
            except Exception:
                pass
                
    valid_until_str = valid_until.strftime("%Y-%m-%d %H:%M:%S UTC") if valid_until else "Unknown / Permanent"
    
    data_as_of_str = "Unknown"
    feed_degraded = False
    if meta:
        fetched_at = meta.get("fetched_at")
        if fetched_at:
            try:
                dt_fetch = datetime.datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
                data_as_of_str = dt_fetch.strftime("%Y-%m-%d %H:%M:%S UTC")
            except Exception:
                data_as_of_str = str(fetched_at)
        feed_degraded = bool(meta.get("feed_degraded", False))

    status_str = "DEGRADED (STALE CACHE)" if feed_degraded else "LIVE FEED OK"
    
    lines = [
        "* UK NOTAM SUA Airspace File - Generated for VFR / Gliders",
        "* Tool: UK NOTAM Flight Workstation (https://notam.leestimmel.net)",
        f"* Generated At: {gen_time_str}",
        f"* Valid Until:  {valid_until_str}",
        f"* Data as of:   {data_as_of_str}",
        f"* Feed Status:  {status_str}",
        "* WARNING: NOT FOR OPERATIONAL OR SINGLE-SOURCE NAVIGATION.",
        "* ALWAYS VERIFY AGAINST OFFICIAL NATS AIS BEFORE FLIGHT.",
        ""
    ]

    
    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry")
        
        if not geom or not geom.get("coordinates"):
            continue
            
        hazard_type = props.get("hazard_type", "R")
        notam_id = props.get("notam_id", "NOTAM")
        label = props.get("hazard_label", hazard_type)
        
        # Airspace Class mapping
        ac_class = "X"
        if "Parachute" in label or "Drop" in label or "Danger" in label:
            ac_class = "Q"
        elif "Winch" in label:
            ac_class = "W"
            
        lower_fl = props.get("lower_fl")
        upper_fl = props.get("upper_fl")
        
        # Floor / Base
        if lower_fl is not None and lower_fl > 0:
            al_str = f"FL{lower_fl:03d}"
        else:
            al_str = "SFC"
            
        # Ceiling / Tops
        if upper_fl is not None and upper_fl < 999:
            ah_str = f"FL{upper_fl:03d}"
        else:
            ah_str = "UNL"
            
        lines.append("TYPE=NOTAM")
        lines.append(f"TITLE={label} ({notam_id})")
        lines.append(f"CLASS={ac_class}")
        lines.append(f"BASE={al_str}")
        lines.append(f"TOPS={ah_str}")
        
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])
        
        if gtype == "Polygon" and coords:
            ring = coords[0]
            for pt in ring:
                lng, lat = pt[0], pt[1]
                lines.append(f"POINT={_deg_to_sua_dms(lat, True)} {_deg_to_sua_dms(lng, False)}")
        elif gtype == "LineString" and coords:
            for pt in coords:
                lng, lat = pt[0], pt[1]
                lines.append(f"POINT={_deg_to_sua_dms(lat, True)} {_deg_to_sua_dms(lng, False)}")
        elif gtype == "Point" and coords:
            lng, lat = coords[0], coords[1]
            lines.append(f"CIRCLE RADIUS=3.0 CENTRE={_deg_to_sua_dms(lat, True)} {_deg_to_sua_dms(lng, False)}")
            
        lines.append("") # blank separator
        
    return "\n".join(lines)
