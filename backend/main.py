import os
import time
import logging
import json
import uuid
import datetime
import random
import string
import httpx
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, Query, HTTPException, Response, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel, Field
from shapely.geometry import shape, LineString, mapping
from shapely.strtree import STRtree
from google.cloud import firestore

from .services.pipeline import build_uk_geojson
from .services.openair import geojson_to_openair
from .services.sua import geojson_to_sua
from .services.bga import get_bga_turnpoints

logger = logging.getLogger(__name__)

app = FastAPI(
    title="UK NOTAM Flight Workstation API",
    description="Deterministic ingestion, layer filtering, and route corridor spatial analysis for UK NOTAMs"
)

db = None

# Startup DB initialization
@app.on_event("startup")
async def startup_event():
    logger.info("Initializing Firestore client...")
    global db
    db = firestore.AsyncClient(database="notam-map-service")
    logger.info("Firestore client initialized successfully.")


# Pydantic models for Sync & Share
class ObservationZoneConfig(BaseModel):
    type: str = Field(..., pattern="^(Cylinder|Sector|Line|Keyhole|Ring)$")  # Lock down types
    radius: float = Field(..., ge=0.0, le=100000.0)  # Max 100km, no negative radius
    angle: Optional[float] = Field(90.0, ge=0.0, le=360.0)  # Standard degrees

class TaskShareRequest(BaseModel):
    waypoints: List[List[float]] = Field(..., min_length=2, max_length=50) # [[lng, lat], [lng, lat], ...]
    corridor_nm: float = Field(20.0, le=100.0)
    observation_zones: Optional[List[ObservationZoneConfig]] = Field(None, max_length=50)
    is_aat: Optional[bool] = False
    is_pev: Optional[bool] = False

class WeGlideSyncRequest(BaseModel):
    waypoints: List[List[float]] = Field(..., min_length=2, max_length=50) # [[lng, lat], [lng, lat], ...]
    weglide_api_key: str
    task_name: Optional[str] = Field("NOTAM Workstation Task", max_length=100)
    mock: bool = False

class CloudDriveSyncRequest(BaseModel):
    waypoints: List[List[float]] = Field(..., min_length=2, max_length=50) # [[lng, lat], [lng, lat], ...]
    corridor_nm: float = Field(20.0, le=100.0)
    provider: str # "google_drive" or "dropbox"
    access_token: str
    observation_zones: Optional[List[ObservationZoneConfig]] = Field(None, max_length=50)
    is_aat: Optional[bool] = False
    is_pev: Optional[bool] = False
    mock: bool = False



# Tightened CORS origins (removed wildcard to prevent credential leakage and proxy abuse)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://notamradar.org",
        "https://www.notamradar.org",
        "https://notam.leestimmel.net",
        "https://notam.leestimmel.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_noindex_header(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


RATE_LIMIT_CACHE = {}

def rate_limit(requests_limit: int, window_seconds: int):
    async def dependency(request: Request):
        forwarded_for = request.headers.get("X-Forwarded-For")
        ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host
        
        now = time.time()
        timestamps = RATE_LIMIT_CACHE.get(ip, [])
        timestamps = [t for t in timestamps if now - t < window_seconds]
        
        if len(timestamps) >= requests_limit:
            RATE_LIMIT_CACHE[ip] = timestamps
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
            
        timestamps.append(now)
        RATE_LIMIT_CACHE[ip] = timestamps
    return dependency

# In-memory cache for live UK NOTAM GeoJSON and BGA Turnpoints
CACHE = {
    "data": None,
    "strtree": None,
    "geometries": None,
    "feature_map": None,
    "timestamp": 0,
    "ttl_seconds": 900 # 15 minutes cache
}

BGA_CACHE = {
    "data": None,
    "timestamp": 0
}

async def get_cached_notams() -> dict:
    now = time.time()
    if CACHE["data"] is None or (now - CACHE["timestamp"]) > CACHE["ttl_seconds"]:
        logger.info("Fetching and parsing fresh live UK NATS NOTAM feed...")
        try:
            geojson_data = await build_uk_geojson()
            
            geometries = []
            feature_map = {}
            for feat in geojson_data["features"]:
                geom_dict = feat.get("geometry")
                if geom_dict:
                    try:
                        geom = shape(geom_dict)
                        geometries.append(geom)
                        feature_map[len(geometries) - 1] = feat
                    except Exception:
                        pass
                        
            strtree = STRtree(geometries) if geometries else None
            
            geojson_data.setdefault("meta", {})["feed_degraded"] = False
            CACHE["data"] = geojson_data
            CACHE["strtree"] = strtree
            CACHE["geometries"] = geometries
            CACHE["feature_map"] = feature_map
            CACHE["timestamp"] = now
        except Exception as e:
            logger.error(f"Failed to fetch live NOTAM feed: {e}")
            if CACHE["data"] is None:
                raise HTTPException(status_code=503, detail="Unable to retrieve NOTAM data feed.")
            CACHE["data"].setdefault("meta", {})["feed_degraded"] = True
    return CACHE["data"]

class RouteRequest(BaseModel):
    waypoints: List[List[float]] = Field(..., min_length=2, max_length=50) # [[lng, lat], [lng, lat], ...]
    corridor_nm: float = Field(20.0, le=100.0)
    min_fl: Optional[int] = 0
    max_fl: Optional[int] = 100

@app.get("/api/notams")
async def get_notams():
    """
    Returns the live UK NOTAM dataset as a GeoJSON FeatureCollection.
    Includes both placed geometric features and unplaceable notices.
    """
    return await get_cached_notams()

@app.get("/api/bga-turnpoints")
async def get_bga_points():
    """
    Returns the BGA (British Gliding Association) official gliding turnpoints.
    """
    if BGA_CACHE["data"] is None:
        BGA_CACHE["data"] = await get_bga_turnpoints()
        BGA_CACHE["timestamp"] = time.time()
    return BGA_CACHE["data"]

@app.post("/api/route/filter", dependencies=[Depends(rate_limit(60, 60))])
async def filter_by_route(req: RouteRequest):
    """
    Performs spatial corridor buffering around a route and returns all intersecting NOTAMs.
    """
    await get_cached_notams()
    
    # 1 NM approx 0.016667 degrees
    buffer_deg = req.corridor_nm * 0.016667
    route_line = LineString(req.waypoints)
    corridor_polygon = route_line.buffer(buffer_deg)
    
    intersecting_features = []
    unplaceable_features = []
    
    for feat in CACHE["data"]["features"]:
        if not feat.get("geometry"):
            unplaceable_features.append(feat)
            
    if CACHE["strtree"] is not None:
        query_indices = CACHE["strtree"].query(corridor_polygon)
        # Shapely 2.0 query returns array of indices
        for idx in query_indices:
            idx = int(idx)
            feat = CACHE["feature_map"][idx]
            props = feat.get("properties", {})
            
            lower = props.get("lower_fl") or 0
            upper = props.get("upper_fl") or 999
            if upper < req.min_fl or lower > req.max_fl:
                continue
                
            geom = CACHE["geometries"][idx]
            if geom.intersects(corridor_polygon):
                intersecting_features.append(feat)
            
    corridor_geojson = mapping(corridor_polygon)
    
    cache_meta = CACHE["data"].get("meta", {}) if CACHE.get("data") else {}
    return {
        "type": "FeatureCollection",
        "features": intersecting_features + unplaceable_features,
        "corridor_geometry": corridor_geojson,
        "meta": {
            "total_route_hazards": len(intersecting_features),
            "unplaceable_notices": len(unplaceable_features),
            "corridor_nm": req.corridor_nm,
            "waypoints_count": len(req.waypoints),
            "fetched_at": cache_meta.get("fetched_at"),
            "feed_degraded": cache_meta.get("feed_degraded", False),
        }
    }

class ExportRequest(BaseModel):
    features: List[dict] = Field(..., max_length=2000)
    meta: Optional[Dict[str, Any]] = None

@app.post("/api/export/openair", dependencies=[Depends(rate_limit(30, 60))])
async def export_openair(req: ExportRequest):
    """
    Converts a list of filtered GeoJSON features into a valid OpenAir file for XCSoar / LX.
    """
    openair_content = geojson_to_openair(req.features, meta=req.meta)
    return PlainTextResponse(
        content=openair_content,
        headers={"Content-Disposition": "attachment; filename=notams.openair"}
    )

@app.post("/api/export/sua", dependencies=[Depends(rate_limit(30, 60))])
async def export_sua(req: ExportRequest):
    """
    Converts a list of filtered GeoJSON features into a valid SUA file.
    """
    sua_content = geojson_to_sua(req.features, meta=req.meta)
    return PlainTextResponse(
        content=sua_content,
        headers={"Content-Disposition": "attachment; filename=notams.sua"}
    )

class TaskExportRequest(BaseModel):
    waypoints: List[List[float]] = Field(..., min_length=2, max_length=50) # [[lng, lat], [lng, lat], ...]

def decimal_to_igc_coord(lat: float, lon: float) -> tuple[str, str]:
    # Latitude
    lat_sign = "N" if lat >= 0 else "S"
    lat_abs = abs(lat)
    lat_deg = int(lat_abs)
    lat_min = (lat_abs - lat_deg) * 60
    lat_min_int = int(round(lat_min * 1000))
    if lat_min_int >= 60000:
        lat_min_int = 0
        lat_deg += 1
    lat_str = f"{lat_deg:02d}{lat_min_int:05d}{lat_sign}"
    
    # Longitude
    lon_sign = "E" if lon >= 0 else "W"
    lon_abs = abs(lon)
    lon_deg = int(lon_abs)
    lon_min = (lon_abs - lon_deg) * 60
    lon_min_int = int(round(lon_min * 1000))
    if lon_min_int >= 60000:
        lon_min_int = 0
        lon_deg += 1
    lon_str = f"{lon_deg:03d}{lon_min_int:05d}{lon_sign}"
    
    return lat_str, lon_str

def find_closest_turnpoint_name(lon: float, lat: float, bga_features: list) -> str:
    import math
    closest_name = None
    closest_dist = 999.0
    for feat in bga_features:
        geom = feat.get("geometry", {})
        if geom.get("type") == "Point":
            coords = geom.get("coordinates")
            if coords and len(coords) >= 2:
                dist = math.hypot(coords[0] - lon, coords[1] - lat)
                if dist < closest_dist:
                    closest_dist = dist
                    props = feat.get("properties", {})
                    closest_name = f"{props.get('code', '')} {props.get('name', '')}".strip()
                    
    if closest_dist < 0.005 and closest_name:
        return closest_name
    return f"{lat:.4f}_{lon:.4f}"

@app.post("/api/export/task/igc", dependencies=[Depends(rate_limit(30, 60))])
async def export_task_igc(req: TaskExportRequest):
    """
    Converts a list of task waypoints into a valid IGC file with C records (Task Declaration).
    """
    if len(req.waypoints) < 2:
        raise HTTPException(status_code=400, detail="At least 2 waypoints are required to declare a task.")
        
    import datetime
    now = datetime.datetime.utcnow()
    date_str = now.strftime("%d%m%y")
    time_str = now.strftime("%H%M%S")
    
    lines = []
    # Manufacturer record
    lines.append("AXGD Antigravity Task Planner")
    # Date of flight
    lines.append(f"HFDTE{date_str}")
    # Pilot Name
    lines.append("HOPLTPILOT: Glider Pilot")
    # Glider Type
    lines.append("HOGTYGLIDER: Glider")
    
    # Task Header C record
    num_wp = len(req.waypoints)
    header_line = f"C{date_str}{time_str}{date_str}0001{num_wp:02d}BGA TASK DECLARATION"
    lines.append(header_line)
    
    # BGA turnpoint snapping list
    if BGA_CACHE["data"] is None:
        BGA_CACHE["data"] = await get_bga_turnpoints()
    bga_features = BGA_CACHE["data"].get("features", [])
    
    # Waypoint C records
    for idx, pt in enumerate(req.waypoints):
        lon, lat = pt[0], pt[1]
        lat_str, lon_str = decimal_to_igc_coord(lat, lon)
        
        # Snap name to closest BGA turnpoint if matching
        name = find_closest_turnpoint_name(lon, lat, bga_features)
        
        lines.append(f"C{lat_str}{lon_str}{name}")
        
    igc_content = "\r\n".join(lines) + "\r\n"
    
    return PlainTextResponse(
        content=igc_content,
        headers={"Content-Disposition": "attachment; filename=task.igc"}
    )

def generate_cup_task(waypoints: List[List[float]], bga_features: list, observation_zones: Optional[List[dict]] = None, is_aat: bool = False) -> str:
    lines = ["name,code,country,lat,lon,elev,style,rwdir,rwlen,rwdsth,freq,desc"]
    wp_names = []
    for idx, pt in enumerate(waypoints):
        lon, lat = pt[0], pt[1]
        lat_deg = int(abs(lat))
        lat_min = (abs(lat) - lat_deg) * 60
        lat_dir = "N" if lat >= 0 else "S"
        lat_str = f"{lat_deg:02d}{lat_min:06.3f}{lat_dir}"

        lon_deg = int(abs(lon))
        lon_min = (abs(lon) - lon_deg) * 60
        lon_dir = "E" if lon >= 0 else "W"
        lon_str = f"{lon_deg:03d}{lon_min:06.3f}{lon_dir}"
        
        name = find_closest_turnpoint_name(lon, lat, bga_features)
        code = name.split()[0] if len(name.split()) > 0 else f"WP{idx+1}"
        lines.append(f'"{name}","{code}",UK,{lat_str},{lon_str},0m,1,,,,,"Waypoints"')
        wp_names.append(name)
    
    lines.append("")
    lines.append("__Tasks__")
    task_line = f'"NOTAM Task",' + ",".join(f'"{n}"' for n in wp_names)
    lines.append(task_line)
    
    wp_dis_str = "False" if is_aat else "True"
    lines.append(f"Options,NoStart=00:00:00,TaskTime=00:00:00,WpDis={wp_dis_str},NearDis=0.5km,NearAlt=0m,BeforePts=1,AfterPts=1,Bonus=0")

    if not observation_zones:
        observation_zones = []
        for idx in range(len(waypoints)):
            is_start = idx == 0
            is_finish = idx == len(waypoints) - 1 and len(waypoints) > 1
            observation_zones.append({
                "type": "Line" if (is_start or is_finish) else "Sector",
                "radius": 500 if (is_start or is_finish) else 10000,
                "angle": 90.0
            })

    for idx, oz in enumerate(observation_zones):
        if idx >= len(waypoints):
            break
        oz_type = oz.get("type", "Cylinder")
        radius = oz.get("radius", 500.0)
        angle = oz.get("angle", 90.0)
        
        # Style mappings: 0=Cylinder, 1=Symmetrical (sector), 2=To next point (start line), 3=To prev point (finish line/ring)
        if oz_type == "Line":
            style = 2 if idx == 0 else 3
            line_flag = 1
        elif oz_type == "Ring":
            style = 3
            line_flag = 0
        elif oz_type in ("Sector", "Keyhole"):
            style = 1
            line_flag = 0
        else: # Cylinder
            style = 0
            line_flag = 0

        r1_str = f"{int(radius)}m"
        a1_str = f"{int(angle)}"

        if oz_type == "Keyhole":
            r2_str = "500m"
            a2_str = "180"
            lines.append(f"ObsZone={idx},Style={style},R1={r1_str},A1={a1_str},R2={r2_str},A2={a2_str}")
        else:
            if oz_type == "Line":
                lines.append(f"ObsZone={idx},Style={style},R1={r1_str},A1={a1_str},Line={line_flag}")
            elif oz_type == "Sector":
                lines.append(f"ObsZone={idx},Style={style},R1={r1_str},A1={a1_str}")
            else: # Cylinder
                lines.append(f"ObsZone={idx},Style={style},R1={r1_str}")

    return "\r\n".join(lines) + "\r\n"

def generate_tsk_task(waypoints: List[List[float]], bga_features: list, observation_zones: Optional[List[dict]] = None) -> str:
    import xml.etree.ElementTree as ET
    root = ET.Element("Task", type="RT", task_speed="0", aat_min_time="0")
    
    if not observation_zones:
        observation_zones = []
        for idx in range(len(waypoints)):
            is_start = idx == 0
            is_finish = idx == len(waypoints) - 1 and len(waypoints) > 1
            observation_zones.append({
                "type": "Line" if (is_start or is_finish) else "Sector",
                "radius": 500 if (is_start or is_finish) else 10000,
                "angle": 90.0
            })

    for idx, pt in enumerate(waypoints):
        lon, lat = pt[0], pt[1]
        name = find_closest_turnpoint_name(lon, lat, bga_features)
        pt_type = "Start" if idx == 0 else ("Finish" if idx == len(waypoints) - 1 else "Turn")
        
        point_el = ET.SubElement(root, "Point", type=pt_type)
        wp_el = ET.SubElement(point_el, "Waypoint", name=name, comment="", id=str(idx))
        ET.SubElement(wp_el, "Location", latitude=f"{lat:.5f}", longitude=f"{lon:.5f}")
        
        oz = observation_zones[idx] if idx < len(observation_zones) else {"type": "Cylinder", "radius": 500.0, "angle": 90.0}
        oz_type = oz.get("type", "Cylinder")
        radius = oz.get("radius", 500.0)
        angle = oz.get("angle", 90.0)
        
        if oz_type == "Line":
            ET.SubElement(point_el, "ObservationZone", type="Line", radius=str(int(radius)))
        elif oz_type == "Sector":
            ET.SubElement(point_el, "ObservationZone", type="Sector", radius=str(int(radius)), angle=str(int(angle)))
        elif oz_type == "Keyhole":
            ET.SubElement(point_el, "ObservationZone", type="Keyhole", radius=str(int(radius)), radius_inner="500", angle=str(int(angle)))
        else: # Cylinder / Circle
            ET.SubElement(point_el, "ObservationZone", type="Circle", radius=str(int(radius)))
            
    return ET.tostring(root, encoding="utf-8").decode("utf-8")

# Unique share ID generator
def generate_share_id() -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(8))

@app.post("/api/task/share", dependencies=[Depends(rate_limit(10, 60))])
async def share_task(req: TaskShareRequest):
    for _ in range(10):
        share_id = generate_share_id()
        doc_ref = db.collection("shared_tasks").document(share_id)
        doc = await doc_ref.get()
        if not doc.exists:
            break
    else:
        raise HTTPException(status_code=500, detail="Failed to generate a unique share ID.")

    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)
    await doc_ref.set({
        "id": share_id,
        "waypoints": json.dumps(req.waypoints),
        "corridor_nm": req.corridor_nm,
        "observation_zones": json.dumps([oz.model_dump() for oz in req.observation_zones]) if req.observation_zones else None,
        "is_aat": req.is_aat,
        "is_pev": req.is_pev,
        "created_at": firestore.SERVER_TIMESTAMP,
        "expires_at": expires_at
    })
    
    return {
        "share_id": share_id,
        "share_url": f"/share/{share_id}"
    }

@app.get("/api/task/share/{share_id}")
async def get_shared_task(share_id: str):
    doc_ref = db.collection("shared_tasks").document(share_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shared task not found.")
    
    shared = doc.to_dict()
    return {
        "share_id": shared["id"],
        "waypoints": json.loads(shared["waypoints"]),
        "corridor_nm": shared["corridor_nm"],
        "observation_zones": json.loads(shared.get("observation_zones")) if shared.get("observation_zones") else None,
        "is_aat": shared.get("is_aat", False),
        "is_pev": shared.get("is_pev", False),
        "created_at": shared["created_at"].isoformat() if hasattr(shared["created_at"], "isoformat") else str(shared["created_at"]),
        "expires_at": shared["expires_at"].isoformat() if hasattr(shared.get("expires_at"), "isoformat") else str(shared.get("expires_at")) if shared.get("expires_at") else None
    }

@app.get("/api/task/share/{share_id}/cup")
async def get_shared_task_cup(share_id: str):
    doc_ref = db.collection("shared_tasks").document(share_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shared task not found.")
    
    shared = doc.to_dict()
    waypoints = json.loads(shared["waypoints"])
    obs_zones = json.loads(shared.get("observation_zones")) if shared.get("observation_zones") else None
    
    if BGA_CACHE["data"] is None:
        BGA_CACHE["data"] = await get_bga_turnpoints()
    bga_features = BGA_CACHE["data"].get("features", [])
    
    cup_content = generate_cup_task(waypoints, bga_features, obs_zones, is_aat=shared.get("is_aat", False))
    return PlainTextResponse(
        content=cup_content,
        headers={"Content-Disposition": f"attachment; filename=task_{share_id}.cup"}
    )

@app.get("/api/task/share/{share_id}/igc")
async def get_shared_task_igc(share_id: str):
    doc_ref = db.collection("shared_tasks").document(share_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shared task not found.")
    
    shared = doc.to_dict()
    waypoints = json.loads(shared["waypoints"])
    
    if BGA_CACHE["data"] is None:
        BGA_CACHE["data"] = await get_bga_turnpoints()
    bga_features = BGA_CACHE["data"].get("features", [])
    
    # Generate C-records sequence inside .igc file
    import datetime
    now = datetime.datetime.utcnow()
    date_str = now.strftime("%d%m%y")
    time_str = now.strftime("%H%M%S")
    
    lines = []
    lines.append("AXGD Antigravity Task Planner")
    lines.append(f"HFDTE{date_str}")
    lines.append("HOPLTPILOT: Glider Pilot")
    lines.append("HOGTYGLIDER: Glider")
    
    num_wp = len(waypoints)
    header_line = f"C{date_str}{time_str}{date_str}0001{num_wp:02d}BGA TASK DECLARATION"
    lines.append(header_line)
    
    for idx, pt in enumerate(waypoints):
        lon, lat = pt[0], pt[1]
        lat_str, lon_str = decimal_to_igc_coord(lat, lon)
        name = find_closest_turnpoint_name(lon, lat, bga_features)
        lines.append(f"C{lat_str}{lon_str}{name}")
        
    igc_content = "\r\n".join(lines) + "\r\n"
    
    return PlainTextResponse(
        content=igc_content,
        headers={"Content-Disposition": f"attachment; filename=task_{share_id}.igc"}
    )

@app.get("/api/task/share/{share_id}/tsk")
async def get_shared_task_tsk(share_id: str):
    doc_ref = db.collection("shared_tasks").document(share_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shared task not found.")
    
    shared = doc.to_dict()
    waypoints = json.loads(shared["waypoints"])
    obs_zones = json.loads(shared.get("observation_zones")) if shared.get("observation_zones") else None
    
    if BGA_CACHE["data"] is None:
        BGA_CACHE["data"] = await get_bga_turnpoints()
    bga_features = BGA_CACHE["data"].get("features", [])
    
    tsk_content = generate_tsk_task(waypoints, bga_features, obs_zones)
    return PlainTextResponse(
        content=tsk_content,
        headers={"Content-Disposition": f"attachment; filename=task_{share_id}.tsk", "Content-Type": "application/xml"}
    )

@app.get("/api/task/share/{share_id}/openair")
async def get_shared_task_openair(share_id: str):
    doc_ref = db.collection("shared_tasks").document(share_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Shared task not found.")
    
    shared = doc.to_dict()
    waypoints = json.loads(shared["waypoints"])
    corridor_nm = shared["corridor_nm"]
    
    buffer_deg = corridor_nm * 0.016667
    route_line = LineString(waypoints)
    corridor_polygon = route_line.buffer(buffer_deg)
    
    await get_cached_notams()
    
    intersecting_features = []
    if CACHE["strtree"] is not None:
        query_indices = CACHE["strtree"].query(corridor_polygon)
        for idx in query_indices:
            idx = int(idx)
            feat = CACHE["feature_map"][idx]
            geom = CACHE["geometries"][idx]
            if geom.intersects(corridor_polygon):
                intersecting_features.append(feat)
            
    openair_content = geojson_to_openair(intersecting_features)
    return PlainTextResponse(
        content=openair_content,
        headers={"Content-Disposition": f"attachment; filename=notams_{share_id}.openair"}
    )

@app.post("/api/sync/weglide", dependencies=[Depends(rate_limit(10, 60))])
async def sync_weglide(req: WeGlideSyncRequest):
    if len(req.waypoints) < 2:
        raise HTTPException(status_code=400, detail="At least 2 waypoints are required to declare a task.")
    
    weglide_waypoints = []
    if BGA_CACHE["data"] is None:
        BGA_CACHE["data"] = await get_bga_turnpoints()
    bga_features = BGA_CACHE["data"].get("features", [])
    
    for idx, pt in enumerate(req.waypoints):
        lon, lat = pt[0], pt[1]
        name = find_closest_turnpoint_name(lon, lat, bga_features)
        weglide_waypoints.append({
            "name": name,
            "latitude": lat,
            "longitude": lon
        })
    
    task_payload = {
        "name": req.task_name,
        "turnpoints": weglide_waypoints
    }
    
    if req.mock:
        return {
            "success": True,
            "message": "Simulated WeGlide Sync Successful (Simulator Mode)",
            "task_id": random.randint(10000, 99999),
            "declared_until": (datetime.datetime.utcnow() + datetime.timedelta(days=1)).isoformat() + "Z",
            "logs": [
                f"Authentication request sent using key: {req.weglide_api_key[:4]}...",
                f"WeGlide user verified successfully.",
                f"POST /v1/task: Pushed {len(req.waypoints)} waypoints.",
                f"WeGlide saved task as ID {random.randint(10000, 99999)}.",
                f"POST /v1/task/declaration: Declared task until tomorrow.",
                "Sync process complete."
            ]
        }
        
    try:
        async with httpx.AsyncClient() as client:
            headers = {"X-API-Key": req.weglide_api_key, "Content-Type": "application/json"}
            task_resp = await client.post("https://api.weglide.org/v1/task", json=task_payload, headers=headers, timeout=10.0)
            if task_resp.status_code not in (200, 201):
                raise HTTPException(status_code=task_resp.status_code, detail=f"WeGlide task creation failed: {task_resp.text}")
            
            task_data = task_resp.json()
            task_id = task_data.get("id") or task_data.get("task_id") or random.randint(10000, 99999)
                
            dec_until = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).isoformat() + "Z"
            dec_payload = {
                "task_id": task_id,
                "declared_until": dec_until
            }
            dec_resp = await client.post("https://api.weglide.org/v1/task/declaration", json=dec_payload, headers=headers, timeout=10.0)
            if dec_resp.status_code not in (200, 201):
                raise HTTPException(status_code=dec_resp.status_code, detail=f"WeGlide declaration failed: {dec_resp.text}")
                
            return {
                "success": True,
                "message": "WeGlide Sync and Declaration Successful!",
                "task_id": task_id,
                "declared_until": dec_until
            }
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Error connecting to WeGlide API: {str(e)}")

@app.post("/api/sync/cloud-drive", dependencies=[Depends(rate_limit(10, 60))])
async def sync_cloud_drive(req: CloudDriveSyncRequest):
    if len(req.waypoints) < 2:
        raise HTTPException(status_code=400, detail="At least 2 waypoints are required to sync.")
        
    if BGA_CACHE["data"] is None:
        BGA_CACHE["data"] = await get_bga_turnpoints()
    bga_features = BGA_CACHE["data"].get("features", [])
    
    obs_zones = [oz.model_dump() for oz in req.observation_zones] if req.observation_zones else None
    cup_content = generate_cup_task(req.waypoints, bga_features, obs_zones, is_aat=req.is_aat)
    
    buffer_deg = req.corridor_nm * 0.016667
    route_line = LineString(req.waypoints)
    corridor_polygon = route_line.buffer(buffer_deg)
    
    await get_cached_notams()
    
    intersecting_features = []
    if CACHE["strtree"] is not None:
        query_indices = CACHE["strtree"].query(corridor_polygon)
        for idx in query_indices:
            idx = int(idx)
            feat = CACHE["feature_map"][idx]
            geom = CACHE["geometries"][idx]
            if geom.intersects(corridor_polygon):
                intersecting_features.append(feat)
            
    openair_content = geojson_to_openair(intersecting_features)
    
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    cup_filename = f"task_{timestamp}.cup"
    openair_filename = f"corridor_notams_{timestamp}.openair"
    
    if req.mock:
        return {
            "success": True,
            "message": f"Simulated {req.provider.replace('_', ' ').title()} Sync Successful (Simulator Mode)",
            "files": [cup_filename, openair_filename],
            "logs": [
                f"Connected to {req.provider.replace('_', ' ').title()} API using authorization header.",
                f"Verifying target directory existence: /LXNAV Connect/",
                f"Target folder verified.",
                f"Uploading {cup_filename} ({len(cup_content)} bytes)...",
                f"Uploading {openair_filename} ({len(openair_content)} bytes)...",
                f"Successfully synced with cloud storage."
            ]
        }
        
    try:
        async with httpx.AsyncClient() as client:
            if req.provider == "dropbox":
                dbx_headers_cup = {
                    "Authorization": f"Bearer {req.access_token}",
                    "Dropbox-API-Arg": json.dumps({
                        "path": f"/LXNAV Connect/{cup_filename}",
                        "mode": "overwrite",
                        "autorename": False,
                        "mute": False
                    }),
                    "Content-Type": "application/octet-stream"
                }
                resp_cup = await client.post(
                    "https://content.dropboxapi.com/2/files/upload",
                    content=cup_content.encode("utf-8"),
                    headers=dbx_headers_cup,
                    timeout=15.0
                )
                if resp_cup.status_code != 200:
                    raise HTTPException(status_code=resp_cup.status_code, detail=f"Dropbox upload error (.cup): {resp_cup.text}")
                    
                dbx_headers_air = {
                    "Authorization": f"Bearer {req.access_token}",
                    "Dropbox-API-Arg": json.dumps({
                        "path": f"/LXNAV Connect/{openair_filename}",
                        "mode": "overwrite",
                        "autorename": False,
                        "mute": False
                    }),
                    "Content-Type": "application/octet-stream"
                }
                resp_air = await client.post(
                    "https://content.dropboxapi.com/2/files/upload",
                    content=openair_content.encode("utf-8"),
                    headers=dbx_headers_air,
                    timeout=15.0
                )
                if resp_air.status_code != 200:
                    raise HTTPException(status_code=resp_air.status_code, detail=f"Dropbox upload error (.openair): {resp_air.text}")
                    
                return {
                    "success": True,
                    "message": f"Successfully uploaded task files to Dropbox under /LXNAV Connect/",
                    "files": [cup_filename, openair_filename]
                }
                
            elif req.provider == "google_drive":
                headers = {"Authorization": f"Bearer {req.access_token}", "Content-Type": "application/json"}
                
                metadata_cup = {
                    "name": cup_filename,
                    "mimeType": "text/plain"
                }
                create_resp_cup = await client.post(
                    "https://www.googleapis.com/drive/v3/files",
                    json=metadata_cup,
                    headers=headers,
                    timeout=10.0
                )
                if create_resp_cup.status_code != 200:
                     raise HTTPException(status_code=create_resp_cup.status_code, detail=f"Google Drive file creation error (.cup): {create_resp_cup.text}")
                file_id_cup = create_resp_cup.json().get("id")
                
                upload_resp_cup = await client.patch(
                    f"https://www.googleapis.com/upload/drive/v3/files/{file_id_cup}?uploadType=media",
                    content=cup_content.encode("utf-8"),
                    headers={"Authorization": f"Bearer {req.access_token}", "Content-Type": "text/plain"},
                    timeout=15.0
                )
                if upload_resp_cup.status_code != 200:
                     raise HTTPException(status_code=upload_resp_cup.status_code, detail=f"Google Drive upload error (.cup): {upload_resp_cup.text}")

                metadata_air = {
                    "name": openair_filename,
                    "mimeType": "text/plain"
                }
                create_resp_air = await client.post(
                    "https://www.googleapis.com/drive/v3/files",
                    json=metadata_air,
                    headers=headers,
                    timeout=10.0
                )
                if create_resp_air.status_code != 200:
                     raise HTTPException(status_code=create_resp_air.status_code, detail=f"Google Drive file creation error (.openair): {create_resp_air.text}")
                file_id_air = create_resp_air.json().get("id")
                
                upload_resp_air = await client.patch(
                    f"https://www.googleapis.com/upload/drive/v3/files/{file_id_air}?uploadType=media",
                    content=openair_content.encode("utf-8"),
                    headers={"Authorization": f"Bearer {req.access_token}", "Content-Type": "text/plain"},
                    timeout=15.0
                )
                if upload_resp_air.status_code != 200:
                     raise HTTPException(status_code=upload_resp_air.status_code, detail=f"Google Drive upload error (.openair): {upload_resp_air.text}")

                return {
                    "success": True,
                    "message": f"Successfully uploaded task files to Google Drive",
                    "files": [cup_filename, openair_filename]
                }
            else:
                raise HTTPException(status_code=400, detail="Invalid provider specified.")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Error connecting to Cloud Drive API: {str(e)}")

# Static file serving for Vite Frontend Build
frontend_dir = os.path.join(os.path.dirname(__file__), "../frontend/dist")
if os.path.isdir(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        file_path = os.path.join(frontend_dir, full_path)
        if os.path.isfile(file_path) and not full_path.startswith("api/"):
            return FileResponse(file_path)
        if not full_path.startswith("api/"):
            return FileResponse(os.path.join(frontend_dir, "index.html"))
