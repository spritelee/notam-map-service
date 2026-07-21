"""
NOTAM processing pipeline: RawNotam -> GeoJSON FeatureCollection.

This is the deterministic Phase-1 path. The LLM (Gemma) step is an explicit *fallback*
hook for the small fraction of NOTAMs whose ItemE geometry the deterministic parser can't
place (source == 'unplaceable' with coordinate-like text). Wiring the LLM in later does not
change this contract: every NOTAM produces a Feature, and anything still unplaceable is
emitted with geometry=None and flagged so the UI shows it as raw text — never dropped.
"""
from __future__ import annotations

from typing import Optional

from .altitude import band_from_fields
from .geometry import build_geometry
from .nats_ais_client import NatsAisClient, RawNotam
from .qcodes import ALL_PERSONAS, classify


def _feature(n: RawNotam) -> dict:
    geo = build_geometry(n.item_e, n.qline_coord, n.qline_radius_nm)
    hazard = classify(n.code23)
    band = band_from_fields(n.item_f, n.item_g, n.qline_lower, n.qline_upper, item_e=n.item_e)
    props = {
        "notam_id": n.notam_id,
        "fir": n.fir,
        "hazard_type": hazard.hazard_type,
        "hazard_label": hazard.label,
        "relevant_personas": sorted(hazard.personas),
        "q_code": f"{n.code23}{n.code45}",
        "lower_fl": n.qline_lower,
        "upper_fl": n.qline_upper,
        "start_utc": n.start_validity.isoformat() if n.start_validity else None,
        "end_utc": n.end_validity.isoformat() if n.end_validity else None,
        "geometry_source": geo.source,
        "confidence": geo.confidence,
        "flags": geo.flags,
        "raw_text": n.item_e,
    }
    props.update(band.to_json())  # lower_ft, upper_ft, vertical_source
    feat = {"type": "Feature", "geometry": geo.geometry or None, "properties": props}
    feat["_band"] = band  # internal, stripped before output
    return feat


def notams_to_geojson(
    notams: list[RawNotam],
    *,
    persona: Optional[str] = None,
    max_altitude_ft: Optional[float] = None,
    min_altitude_ft: float = 0.0,
) -> dict:
    """
    Build a GeoJSON FeatureCollection covering ALL pilots by default.

    Two orthogonal, composable lenses — both declutter, neither deletes data, and omitting
    them returns everything:
      * `persona` (e.g. 'GLIDER', 'COMMERCIAL_IFR') hides hazards not relevant to that pilot type.
      * `max_altitude_ft` (+ optional `min_altitude_ft`) hides NOTAMs whose vertical band doesn't
        reach the pilot's operating band. NOTAMs with an unknown vertical band are always kept.
    """
    if persona is not None and persona not in ALL_PERSONAS:
        raise ValueError(f"Unknown persona {persona!r}; expected one of {sorted(ALL_PERSONAS)} or None")

    feats = [_feature(n) for n in notams]
    if persona is not None:
        feats = [f for f in feats if persona in f["properties"]["relevant_personas"]]
    if max_altitude_ft is not None:
        feats = [f for f in feats if f["_band"].intersects(min_altitude_ft, max_altitude_ft)]

    unplaceable = sum(1 for f in feats if f["properties"]["geometry_source"] == "unplaceable")
    for f in feats:
        del f["_band"]  # strip internal helper before returning
    return {
        "type": "FeatureCollection",
        "features": feats,
        "meta": {
            "count": len(feats),
            "unplaceable": unplaceable,
            "persona": persona,
            "max_altitude_ft": max_altitude_ft,
            "min_altitude_ft": min_altitude_ft,
        },
    }


async def build_uk_geojson(
    fir: Optional[str] = None,
    *,
    persona: Optional[str] = None,
    max_altitude_ft: Optional[float] = None,
    min_altitude_ft: float = 0.0,
) -> dict:
    """Convenience: fetch the live UK feed and return a GeoJSON FeatureCollection (all pilots by default)."""
    notams = await NatsAisClient().fetch_notams(fir=fir)
    return notams_to_geojson(
        notams, persona=persona,
        max_altitude_ft=max_altitude_ft, min_altitude_ft=min_altitude_ft,
    )
