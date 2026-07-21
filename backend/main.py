import os
import time
import logging
from typing import List, Optional
from fastapi import FastAPI, Query, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from shapely.geometry import shape, LineString, mapping

from .services.pipeline import build_uk_geojson
from .services.openair import geojson_to_openair
from .services.sua import geojson_to_sua
from .services.bga import get_bga_turnpoints

logger = logging.getLogger(__name__)

app = FastAPI(
    title="UK NOTAM Flight Workstation API",
    description="Deterministic ingestion, layer filtering, and route corridor spatial analysis for UK NOTAMs"
)

# Tightened CORS origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache for live UK NOTAM GeoJSON and BGA Turnpoints
CACHE = {
    "data": None,
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
            CACHE["data"] = geojson_data
            CACHE["timestamp"] = now
        except Exception as e:
            logger.error(f"Failed to fetch live NATS feed: {e}")
            if CACHE["data"] is None:
                raise HTTPException(status_code=503, detail="Unable to retrieve NOTAM data feed.")
    return CACHE["data"]

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

@app.post("/api/export/openair")
async def export_openair(features: List[dict]):
    """
    Converts a list of filtered GeoJSON features into a valid OpenAir file for XCSoar / LX.
    """
    openair_content = geojson_to_openair(features)
    return PlainTextResponse(
        content=openair_content,
        headers={"Content-Disposition": "attachment; filename=notams.openair"}
    )

@app.post("/api/export/sua")
async def export_sua(features: List[dict]):
    """
    Converts a list of filtered GeoJSON features into a valid SUA file.
    """
    sua_content = geojson_to_sua(features)
    return PlainTextResponse(
        content=sua_content,
        headers={"Content-Disposition": "attachment; filename=notams.sua"}
    )

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
