"""
Vertical-limit parsing and altitude-band filtering for NOTAMs.

A NOTAM's vertical extent lets us declutter for *any* persona by altitude: an airliner en-route
at FL350 doesn't need a 0–2000ft AGL winch-launch warning, and a glider capped at 10,000ft
doesn't need an upper-airspace airway change. This layers on top of the persona/hazard lens.

Sources, in order of precision:
  1. ItemF (lower) / ItemG (upper) — the actual activity limits, present on ~38% of UK NOTAMs.
     Formats seen: 'SFC', 'GND', 'FL050', 'NNNFT AMSL', 'NNNFT AGL', 'UNL'.
  2. Q-line Lower/Upper flight levels (0..999; 999 => unlimited) — coarse, but always present.

Approximation: AGL and AMSL are treated alike for this coarse ceiling filter (terrain elevation
is ignored). This is deliberately conservative — it errs toward keeping a NOTAM visible.
Anything we cannot parse is treated as unknown and NEVER filtered out (fail toward visibility).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Optional

_M_TO_FT = 3.280839895

_FL_RE = re.compile(r"^FL\s*(\d{1,3})$", re.IGNORECASE)
_FT_RE = re.compile(r"^(\d+)\s*FT", re.IGNORECASE)
_M_RE = re.compile(r"^(\d+)\s*M(?:TR|ETERS?|ETRES?)?\b", re.IGNORECASE)

# A ceiling stated inline in the ItemE free text, e.g. "MAX HGT 2000FT AGL", "MAX ALT FL050".
_MAX_HGT_RE = re.compile(
    r"MAX(?:IMUM)?\s+(?:HGT|HEIGHT|ALT(?:ITUDE)?|ELEV)\s+(?:OF\s+)?(FL\s*\d{1,3}|\d+\s*FT|\d+\s*M)\b",
    re.IGNORECASE,
)


def parse_limit(text: str) -> Optional[float]:
    """Parse a single vertical-limit string to feet. None if unparseable.
    'UNL'/'UNLIMITED' return +inf (no upper bound)."""
    if not text:
        return None
    t = text.strip().upper()
    if t in ("SFC", "GND", "SURFACE", "0"):
        return 0.0
    if t in ("UNL", "UNLIM", "UNLIMITED"):
        return math.inf
    m = _FL_RE.match(t)
    if m:
        return int(m.group(1)) * 100.0
    m = _FT_RE.match(t)
    if m:
        return float(m.group(1))
    m = _M_RE.match(t)
    if m:
        return float(m.group(1)) * _M_TO_FT
    return None


@dataclass(frozen=True)
class VerticalBand:
    lower_ft: Optional[float]   # None only when unknown
    upper_ft: Optional[float]   # None means unlimited (within a known source) or unknown
    source: str                 # 'item_fg' | 'qline' | 'unknown'

    @property
    def known(self) -> bool:
        return self.source != "unknown"

    def intersects(self, floor_ft: float, ceiling_ft: float) -> bool:
        """Does this band overlap a pilot's [floor, ceiling] band? Unknown bands always match."""
        if not self.known:
            return True
        lo = self.lower_ft if self.lower_ft is not None else 0.0
        hi = self.upper_ft if self.upper_ft is not None else math.inf
        return lo <= ceiling_ft and hi >= floor_ft

    def to_json(self) -> dict:
        # inf isn't valid JSON; represent an unlimited/unknown top as null with the source for context.
        up = None if (self.upper_ft is None or math.isinf(self.upper_ft)) else self.upper_ft
        return {"lower_ft": self.lower_ft, "upper_ft": up, "vertical_source": self.source}


def upper_from_item_e(item_e: str) -> Optional[float]:
    """Extract an inline 'MAX HGT ...' ceiling from ItemE free text, in feet. None if absent."""
    if not item_e:
        return None
    m = _MAX_HGT_RE.search(item_e)
    return parse_limit(m.group(1).replace(" ", "")) if m else None


def band_from_fields(item_f: str, item_g: str,
                     qline_lower: Optional[int], qline_upper: Optional[int],
                     item_e: str = "") -> VerticalBand:
    """
    Best available vertical band, most precise first:
      1. ItemF/G (explicit limits)
      2. an inline 'MAX HGT' ceiling in ItemE (surface-based activities), floor = SFC
      3. Q-line flight levels (coarse)
    """
    lo = parse_limit(item_f)
    hi = parse_limit(item_g)
    if lo is not None or hi is not None:
        lo_val = 0.0 if (lo is not None and math.isinf(lo)) else lo
        hi_val = None if (hi is not None and math.isinf(hi)) else hi
        return VerticalBand(lo_val, hi_val, "item_fg")

    e_ceiling = upper_from_item_e(item_e)
    if e_ceiling is not None and not math.isinf(e_ceiling):
        return VerticalBand(0.0, e_ceiling, "item_e_maxhgt")

    if qline_lower is not None and qline_upper is not None:
        lower_ft = qline_lower * 100.0
        upper_ft = None if qline_upper >= 999 else qline_upper * 100.0
        return VerticalBand(lower_ft, upper_ft, "qline")

    return VerticalBand(None, None, "unknown")
