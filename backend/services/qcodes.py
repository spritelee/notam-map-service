"""
ICAO Q-code classification for NOTAMs.

The Q-line 2nd+3rd letters (NATS feed <Code23>) identify the *subject* of a NOTAM.
That gives us a deterministic hazard type and, for persona filtering, which kinds of pilot
the item is relevant to — WITHOUT an LLM.

Design goal: this is a tool for ALL pilots planning flights, not just gliders. The dataset is
complete; a persona is only a *lens* that declutters — it never deletes data. Every hazard is
tagged with the personas it matters to; unknowns fall through to hazard_type='OTHER' and are
shown to everyone (fail toward visibility).

Personas describe the *pilot* using the tool. A low-altitude concern (e.g. only wanting things
below 400ft) is expressed with the altitude-band filter, not a persona. Note the distinction
between drone *activity* (a UAS hazard that pilots must avoid — still classified and shown to
low-level pilots) and a drone *operator* (not an audience for a flight-planning tool).

Reference: ICAO Doc 8126 / Annex 15 NOTAM Q-code Subject (2nd-3rd letters). This is a pragmatic
subset covering the common UK-FIR subjects. Persona relevance here is hazard-subject based; a
later refinement layers altitude bands on top (see IMPLEMENTATION_PLAN.md).
"""
from __future__ import annotations

from dataclasses import dataclass

# Personas the tool supports. ALL_PERSONAS is the default lens (show everything).
GLIDER = "GLIDER"                 # unpowered, VFR, low-level, thermal cross-country
GA_VFR = "GA_VFR"                 # powered light aircraft, VFR
COMMERCIAL_IFR = "COMMERCIAL_IFR" # airline / dispatch, high-level, aerodrome + airway users

ALL_PERSONAS: frozenset[str] = frozenset({GLIDER, GA_VFR, COMMERCIAL_IFR})
_LOW_LEVEL = frozenset({GLIDER, GA_VFR})                 # surface / low-altitude flying pilots
_IFR_AERODROME = frozenset({GA_VFR, COMMERCIAL_IFR})     # instrument / aerodrome operations


@dataclass(frozen=True)
class HazardClass:
    hazard_type: str
    label: str
    personas: frozenset[str]  # which personas this hazard is relevant to


# Subject code (Code23) -> classification.
_SUBJECT: dict[str, HazardClass] = {
    # Warnings / activity areas
    "WG": HazardClass("GLIDER_WINCH", "Glider / winch launch activity", _LOW_LEVEL),
    "WP": HazardClass("PARACHUTE", "Parachute / paradropping", ALL_PERSONAS),  # can span SFC-FL100+
    "WU": HazardClass("UAS", "Unmanned aircraft / drone activity", _LOW_LEVEL),
    "WM": HazardClass("MILITARY_EXERCISE", "Missile/gun/rocket/illuminants exercise", ALL_PERSONAS),
    "WA": HazardClass("AERIAL_ACTIVITY", "Aerial sporting/recreational activity", _LOW_LEVEL),
    "WB": HazardClass("AEROBATICS", "Aerobatics", _LOW_LEVEL),
    "WE": HazardClass("EXERCISES", "Military exercises", ALL_PERSONAS),
    "WL": HazardClass("LASER", "Laser / searchlight", ALL_PERSONAS),           # affects approaches too
    "WO": HazardClass("LASER", "Lasers / searchlights", ALL_PERSONAS),
    "WS": HazardClass("BURNING", "Burning / blasting", _LOW_LEVEL),
    "WW": HazardClass("SIGNIFICANT_ACTIVITY", "Significant volcanic/other activity", ALL_PERSONAS),
    "WV": HazardClass("FORMATION_FLIGHT", "Formation flight (e.g. display transit)", ALL_PERSONAS),
    # Airspace restrictions / reservations — everyone must avoid
    "RD": HazardClass("DANGER_AREA", "Danger area", ALL_PERSONAS),
    "RT": HazardClass("RESTRICTED_AREA", "Temporary restricted/reserved area", ALL_PERSONAS),
    "RR": HazardClass("RESTRICTED_AREA", "Restricted area", ALL_PERSONAS),
    "RA": HazardClass("RESTRICTED_AREA", "Airspace restriction (RA(T))", ALL_PERSONAS),
    "RM": HazardClass("RESTRICTED_AREA", "Military/other restricted area", ALL_PERSONAS),
    "RP": HazardClass("PROHIBITED_AREA", "Prohibited area", ALL_PERSONAS),
    "RO": HazardClass("OVERFLYING", "Overflying restriction", ALL_PERSONAS),
    # Obstacles — low-level operations
    "OB": HazardClass("OBSTACLE", "Obstacle (crane/mast/etc.)", _LOW_LEVEL),
    "OL": HazardClass("OBSTACLE_LIGHT", "Obstacle lighting", _IFR_AERODROME),
    # Aerodrome / ground — aerodrome + IFR users, not en-route glider/drone
    "FA": HazardClass("AERODROME", "Aerodrome availability/closure", _IFR_AERODROME),
    "MX": HazardClass("TAXIWAY", "Taxiway", _IFR_AERODROME),
    "MR": HazardClass("RUNWAY", "Runway", _IFR_AERODROME),
    "MS": HazardClass("RUNWAY_SURFACE", "Runway surface", _IFR_AERODROME),
    "SP": HazardClass("APRON", "Apron / stands", _IFR_AERODROME),
    # Nav aids / comms / procedures — instrument concerns
    "IL": HazardClass("ILS", "ILS / approach aid", _IFR_AERODROME),
    "IN": HazardClass("NAVAID", "Navigation aid", _IFR_AERODROME),
    "PO": HazardClass("PROCEDURE", "Obstacle clearance / procedure", _IFR_AERODROME),
    "PA": HazardClass("PROCEDURE", "Approach procedure", _IFR_AERODROME),
    "CA": HazardClass("COMMS", "Air/ground comms", _IFR_AERODROME),
    "NB": HazardClass("NAVAID", "Nav aid (NDB)", _IFR_AERODROME),
}

# Unknown subjects are shown to everyone — never hide something we failed to classify.
_UNKNOWN = HazardClass("OTHER", "Other / unclassified", ALL_PERSONAS)


def classify(code23: str) -> HazardClass:
    """Map a Q-line subject code (e.g. 'WG') to a hazard classification."""
    if not code23:
        return _UNKNOWN
    return _SUBJECT.get(code23.upper(), _UNKNOWN)
