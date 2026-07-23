"""
NATS AIS (UK) NOTAM ingestion.

Source: the UK Pre-flight Information Bulletin (PIB) published by NATS via the Eurocontrol
EAD contingency system as a single XML file containing every UK NOTAM valid now and within
the next 7 days. It is free and unauthenticated. See IMPLEMENTATION_PLAN.md sec. 7a.

Why this source and not the FAA/SkyLink feed: the FAA only redistributes international NOTAMs
that are flagged for international dissemination, which silently omits local UK glider hazards
(winch launches, small obstacles, local danger areas). NATS is authoritative and complete for
the UK, so it is the correct Phase 1 source.

NOTE: NATS states this file has "no declared xml schema and therefore may be subject to change
with minimal notification." Parse defensively; a proper NATS/EAD data agreement is required
before production use.
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from typing import Iterable, Optional
from xml.etree import ElementTree as ET

import httpx

# Live NATS AIS contingency PIB (all UK NOTAM). The MIT-licensed Jonty/uk-notam-archive
# mirrors exactly this file hourly; using its mirror avoids hammering the NATS endpoint and
# gives a stable raw URL for development.
ARCHIVE_PIB_URL = "https://raw.githubusercontent.com/Jonty/uk-notam-archive/main/data/PIB.xml"


@dataclass
class RawNotam:
    """A single NOTAM as ingested from the feed, before geometry/LLM processing."""
    notam_id: str
    nof: str
    series: str
    number: str
    year: str
    type: str
    fir: str
    code23: str
    code45: str
    traffic: str
    purpose: str
    scope: str
    qline_lower: Optional[int]
    qline_upper: Optional[int]
    qline_coord: str
    qline_radius_nm: Optional[float]
    item_a: str
    item_d: str
    item_e: str
    item_f: str
    item_g: str
    start_validity: Optional[dt.datetime]
    end_validity: Optional[dt.datetime]
    pib_section: str
    raw_xml: str = field(repr=False, default="")


def _text(el: Optional[ET.Element], default: str = "") -> str:
    return (el.text or "").strip() if el is not None and el.text else default


def _int_or_none(s: str) -> Optional[int]:
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def _float_or_none(s: str) -> Optional[float]:
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def parse_validity(s: str) -> Optional[dt.datetime]:
    """Feed validity is YYMMDDHHMM UTC (e.g. '2607221030')."""
    s = (s or "").strip()
    if not re.fullmatch(r"\d{10}", s):
        return None
    try:
        return dt.datetime.strptime(s, "%y%m%d%H%M").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


def _notam_from_element(el: ET.Element) -> RawNotam:
    q = el.find("QLine")
    series = _text(el.find("Series"))
    number = _text(el.find("Number"))
    year = _text(el.find("Year"))
    return RawNotam(
        notam_id=f"{series}{number}/{year}",
        nof=_text(el.find("NOF")),
        series=series, number=number, year=year,
        type=_text(el.find("Type")),
        fir=_text(q.find("FIR")) if q is not None else "",
        code23=_text(q.find("Code23")) if q is not None else "",
        code45=_text(q.find("Code45")) if q is not None else "",
        traffic=_text(q.find("Traffic")) if q is not None else "",
        purpose=_text(q.find("Purpose")) if q is not None else "",
        scope=_text(q.find("Scope")) if q is not None else "",
        qline_lower=_int_or_none(_text(q.find("Lower"))) if q is not None else None,
        qline_upper=_int_or_none(_text(q.find("Upper"))) if q is not None else None,
        qline_coord=_text(el.find("Coordinates")),
        qline_radius_nm=_float_or_none(_text(el.find("Radius"))),
        item_a=_text(el.find("ItemA")),
        item_d=_text(el.find("ItemD")),
        item_e=_text(el.find("ItemE")),
        item_f=_text(el.find("ItemF")),
        item_g=_text(el.find("ItemG")),
        start_validity=parse_validity(_text(el.find("StartValidity"))),
        end_validity=parse_validity(_text(el.find("EndValidity"))),
        pib_section=el.get("PIBSection", ""),
        raw_xml=ET.tostring(el, encoding="unicode"),
    )


def parse_pib_xml(xml_bytes: bytes | str, validate: bool = True, min_count: int = 100) -> list[RawNotam]:
    """Parse a full NATS PIB XML document into RawNotam records."""
    root = ET.fromstring(xml_bytes)
    notams = [_notam_from_element(el) for el in root.iter("Notam")]
    if validate and len(notams) < min_count:
        raise ValueError(f"NATS PIB feed validation failed: parsed {len(notams)} NOTAMs, expected at least {min_count}.")
    return notams


class NatsAisClient:
    def __init__(self, pib_url: str = ARCHIVE_PIB_URL, timeout: float = 30.0):
        self.pib_url = pib_url
        self.timeout = timeout

    async def fetch_pib_xml(self) -> str:
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            resp = await client.get(self.pib_url)
            resp.raise_for_status()
            return resp.text

    async def fetch_notams(self, fir: Optional[str] = None) -> list[RawNotam]:
        """Fetch and parse all UK NOTAMs, optionally filtered to a single FIR (e.g. 'EGTT')."""
        xml = await self.fetch_pib_xml()
        notams = parse_pib_xml(xml)
        if fir:
            notams = [n for n in notams if n.fir == fir]
        return notams
