# NOTAM Visualization Platform — Implementation Plan

*Draft plan derived from "Project Charter and Technical Architecture for an Advanced Agentic NOTAM Visualization Platform." This document translates the charter's vision into a buildable engineering plan, and is deliberately honest about what is achievable now, what is gated by data access, and what is over-claimed in the source charter.*

---

## 1. What we're actually solving

The charter's core, valid problem: **NOTAMs are safety-critical but delivered as dense telegraphic text that pilots cannot easily visualise, and the worst offenders (dynamic areas like Red Arrows transits, TDAs, drop zones) are exactly the ones legacy tools render wrong.** Glider/VFR pilots in the UK are the least well served.

Everything else in the charter (pan-European, US SWIM, commercial dispatchers, cryptographic legal ledger) is real ambition but *not* the thing to build first. The MVP that delivers value fastest and de-risks the hardest technical problem is:

> **A UK-focused web map + OpenAir export that ingests current UK NOTAMs, parses them into accurate geometry, filters them for a glider/VFR persona, and shows/exports only what matters — with visible confidence flags and no silent data loss.**

Nail that, and Phases 2–3 (Europe, US) become a data-source and scaling problem, not a new invention.

---

## 1a. Current state of the codebase (reviewed 2026-07-21)

Scaffolding exists; **no real functionality yet.** What's there:

- **`backend/`** — FastAPI app (`main.py`) with three endpoints, all returning **hardcoded mock data**:
  - `GET /` → `{"status": "ok", ... "Local Gemma Parser Stub"}`
  - `GET /api/notams` → one static fake TDA polygon as GeoJSON
  - `GET /api/export/openair` → a static OpenAir string
  - Deps (`requirements.txt`): `fastapi[standard]`, `pydantic`, `shapely`, `geojson` — a good, correct foundation for the deterministic geometry work.
  - **Issue to fix before anything ships:** CORS is `allow_origins=["*"]` with `allow_credentials=True` — tighten to known origins.
- **`frontend/`** — Vite + React 19 + TypeScript scaffold. `App.tsx` is **still the default Vite starter template** (logos + counter). No map library, no API calls, no NOTAM UI. `oxlint` configured.

**Key architectural signal — the "Local Gemma Parser" pivot.** The stub names a **locally-run Gemma model** as the parser, not the cloud Google Antigravity SDK the charter is built around. This is a deliberate and defensible change (zero per-call cost, data stays local, no gated cloud dependency) and the plan below is updated to reflect it. It also *strengthens* the case for the hybrid pipeline in §4: a small local model is more prone to numeric slips than a frontier model, so keeping all coordinate math deterministic matters even more.

**Practical implication:** the immediate work is not greenfield design — it's **replacing the two mock endpoints with the real pipeline** and **replacing the starter frontend with a map**. See §6 Phase 1 and §8.

---

## 2. Reality checks on the charter (read before building)

These are not reasons to abandon the vision — they're constraints that shape the plan.

| Charter claim | Reality | Consequence for the plan |
|---|---|---|
| Build the backend "entirely upon the Google Antigravity Python SDK" with specific APIs (`LocalAgentConfig`, `McpStdioServer`, deny/allow policies, Inspect/Decide/Transform hooks). | **Superseded by the codebase's actual direction: a local Gemma parser** (see §1a). This sidesteps the unverified SDK surface entirely and removes the cloud/cost/gating dependency. The architecture (model + tools + structured output + guardrails) is sound and **framework-agnostic** regardless of which model runs it. | Design the pipeline against a thin internal `AgentRunner` interface. Back it with **local Gemma** (via Ollama, llama.cpp, or the Transformers/vLLM stack). Keep it swappable so a stronger cloud model can be dropped in for hard cases if local quality falls short. |
| Native MCP connections to "NATS/EAD" and "FAA SWIM/NMS". | EAD B2B (MyEAD) and FAA SWIM are **access-gated**: they require Data User Agreements, credentials, and in EAD's case commercial terms. You cannot just connect. | Phase 1 must use **publicly accessible UK sources**. Treat EAD/SWIM as Phase 2/3 items contingent on signed agreements. |
| Cryptographic "Briefing Audit Trail" as legal proof that protects the pilot. | The pilot in command is **legally responsible** regardless of any third-party tool. A hash log is a useful *product* feature (reproducibility, "what did I see") but it does **not** transfer or reduce legal liability, and marketing it that way is itself a liability. | Keep the reproducibility log; **drop the "cryptographic evidence / legal indemnity" framing.** Add a clear "not an authoritative source — verify against official AIS" disclaimer everywhere. |
| LLM "deep parsing" replaces fragile regex. | Correct in spirit, but an LLM emitting **safety-critical geometry** that can silently hallucinate coordinates is dangerous. | Hybrid pipeline: LLM for interpretation, **deterministic code for coordinate math and validation**, confidence scoring, and **never drop a NOTAM silently** — unparseable ones get flagged and shown as raw text. |
| Persona filtering hides high-altitude/irrelevant NOTAMs. | Great feature, but "hiding" safety data has failure modes. | Filter = **demote/collapse, not delete.** Filtered items stay one click away, with a visible count. |

**Guiding safety principle for the whole build:** *fail loud, never silent.* A NOTAM we can't confidently place on the map must still reach the pilot as legible raw text with a warning — never disappear.

---

## 3. Architecture overview

```
                    ┌─────────────────────────────────────────────┐
                    │              Data Sources (per phase)        │
   Phase 1 (UK)  →  │  NATS AIS PIB / public NOTAM feeds           │
   Phase 2 (EU)  →  │  Eurocontrol EAD (MyEAD B2B, AIXM 5.1) *     │
   Phase 3 (US)  →  │  FAA SWIM / NMS API *   (* gated agreements) │
                    └───────────────────┬─────────────────────────┘
                                        │ raw NOTAM text / AIXM
                    ┌───────────────────▼─────────────────────────┐
                    │            Ingestion Service                 │
                    │  - source adapters (one per authority)       │
                    │  - normalise to internal RawNotam model      │
                    │  - dedupe, cache, store raw + fetch metadata │
                    └───────────────────┬─────────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────────┐
                    │          Parsing Pipeline (the hard part)    │
                    │  1. Structural parse (Q/A/B/C/D/E fields)    │  ← deterministic
                    │  2. Geometry extraction                      │
                    │       - circle from Q-line (fallback)        │  ← deterministic
                    │       - LLM extracts E-line coord sequences  │  ← LLM
                    │       - deterministic coord conversion       │  ← deterministic
                    │       - route buffering (Red Arrows case)    │  ← deterministic
                    │  3. Classification + altitude limits (LLM)   │  ← LLM, schema-checked
                    │  4. Validation + confidence scoring          │  ← deterministic
                    │  5. Structured output (Pydantic ParsedNotam) │
                    └───────────────────┬─────────────────────────┘
                                        │ ParsedNotam[] (GeoJSON + metadata)
              ┌─────────────────────────┼─────────────────────────┐
              ▼                         ▼                         ▼
     ┌────────────────┐       ┌──────────────────┐      ┌──────────────────┐
     │  Web Map API   │       │  OpenAir Export  │      │  Persona Filter   │
     │  (GeoJSON)     │       │  (.openair/.txt) │      │  engine (rules)   │
     └───────┬────────┘       └──────────────────┘      └──────────────────┘
             ▼
     ┌────────────────┐
     │  Web Frontend  │  Leaflet/MapLibre map, route draw, filter UI,
     │  (map + list)  │  raw-text drawer, "unplaceable" warnings
     └────────────────┘
```

### Why this split

- **Deterministic where correctness is provable** (coordinate conversion, buffering, circle drawing, altitude formatting). These are pure functions with unit tests. No LLM touches the actual numbers that go on the map.
- **LLM where interpretation is needed** (which tokens in the E-line are a coordinate sequence, what hazard type this is, what the altitude band means in messy free text). The LLM *identifies and extracts*; deterministic code *computes and validates*.
- **Structured output (Pydantic)** as the contract between the two worlds, so a malformed LLM response fails validation instead of reaching the map.

---

## 4. The parsing pipeline in detail

This is the component that determines whether the product is trustworthy. Build and test it first, in isolation, before any UI.

**Step 1 — Structural parse (deterministic).** Split the ICAO NOTAM into its fields (Q, A, B, C, D, E, F, G). Existing open-source parsers (e.g. the `svoop/notam` Ruby parser, or a Python equivalent) are good references for the grammar. Output a typed struct with each field.

**Step 2 — Geometry extraction (hybrid, the crux).**
- Always compute the **Q-line circle** (center + radius) as a *fallback* geometry, and mark it as such.
- Feed the **E-line free text** to the LLM with a strict instruction: *extract any ordered sequence of coordinates and their associated times/labels; return them as structured data; do not compute anything, do not invent coordinates not present in the text.*
- Pass the extracted coordinate strings to a **deterministic converter** (`convert_coordinates`) that handles the NOTAM formats (`530858N 0003125W`, DMS variants) → WGS84 decimal degrees. If any string doesn't match a known pattern, it's an error, not a guess.
- If a route sequence exists, call **`calculate_route_buffer(waypoints, width_nm)`** to produce a LineString/Polygon corridor (solves the Red Arrows "giant false circle" problem). Prefer the E-line corridor over the Q-line circle, and record *why* the choice was made.

**Step 3 — Classification + altitude (LLM, schema-constrained).** LLM assigns hazard type (RA(T), TDA, DZ, winch, obstacle, etc.) and extracts altitude limits (SFC–FL095 style) into typed fields. Output validated against an enum + numeric schema.

**Step 4 — Validation & confidence (deterministic).**
- Sanity checks: coordinates fall within the issuing FIR's bounding box; altitude low ≤ high; polygon is closed and non-self-intersecting; radius within plausible bounds.
- Cross-check: does the E-line geometry roughly agree with the Q-line center? Large disagreement → flag for review.
- Emit a **confidence score** and a list of any checks that failed.

**Step 5 — Structured output.** One `ParsedNotam` object: `notam_id`, `source`, `hazard_type`, `effective_start/end` (parsed from B/C), `altitude_limits`, `geometry` (GeoJSON), `geometry_source` (`e_line_route` | `q_line_circle` | `unplaceable`), `confidence`, `validation_flags`, `raw_text`.

**Non-negotiable:** a NOTAM that fails geometry extraction is emitted with `geometry_source: unplaceable` and its raw text intact — it appears in the list view with a warning badge, never dropped.

### Test strategy for the pipeline
- Build a **golden corpus** of real UK NOTAMs (Red Arrows transit, RA(T) polygon, parachute DZ, winch launch, crane obstacle, a runway closure) with **hand-verified** expected geometry.
- Regression-test every pipeline change against the corpus. Track precision on geometry placement as the primary quality metric.
- Track a "silent loss rate" metric = 0 as a hard gate.

---

## 5. Tech stack (recommended, pragmatic)

| Layer | Choice | Rationale |
|---|---|---|
| Backend language | **Python 3.12+** | Ecosystem for geospatial (`shapely`, `pyproj`), NOTAM parsing, and LLM SDKs. |
| Geometry | **Shapely** + **pyproj** | Deterministic buffering, validation, coordinate transforms. |
| Model / parser | **Local Gemma** behind a thin internal `AgentRunner` interface (served via Ollama or similar). Keep it swappable for a cloud model on hard cases. | Chosen in the codebase (§1a): no per-call cost, data stays local, no gated cloud dependency. Swappability preserves the fallback option. |
| Structured output | **Pydantic v2** *(already a dependency)* | Schema enforcement between model and map — the safety-critical contract. |
| API | **FastAPI** *(already scaffolded)* | Async, typed, OpenAPI out of the box. |
| Geometry | **Shapely** *(already a dependency)* + **pyproj** | Deterministic buffering, validation, coordinate transforms. |
| Storage | **PostgreSQL + PostGIS** *(not yet added)* | Spatial queries (bounding-box / route-intersect filtering) belong in the DB. For the first iteration, in-memory/GeoJSON files are fine; add PostGIS when route-intersect filtering lands. |
| Frontend | **React + Leaflet** (`react-leaflet`) *(now in `package.json`)* | Map choice is settled. Simple, well-documented, fine for the MVP. |
| OpenAir export | Deterministic Python serializer (reference: `pyopenair` spec, Naviter's OpenAir support doc) | Rigid text format; must be exact for XCSoar/LX devices. |
| Auth | Deferred to Phase 1.5 (map works anonymously first) | Don't gate the core value behind login. |

---

## 6. Phased roadmap

### Phase 0 — Foundations & de-risking (≈2–3 weeks)
- ✅ **Done:** repo scaffolded — FastAPI backend (stubbed) + Vite/React/Leaflet frontend (starter). Core deps present (`pydantic`, `shapely`, `geojson`).
- ☐ Add typed skeletons for `RawNotam` / `ParsedNotam` (Pydantic) — the model/map contract.
- ☐ Tighten backend CORS from `*` to known origins.
- ☐ **Stand up local Gemma** (Ollama or equivalent) behind an `AgentRunner` interface; confirm it runs on target hardware and measure baseline latency. Replaces the old "verify Antigravity SDK" task.
- ☐ Confirm a **legal, accessible UK NOTAM data source** and its terms of use (**the blocker** — resolve early).
- ☐ Build the **golden corpus** (10–20 hand-verified UK NOTAMs).
- ☐ Implement deterministic pieces first: structural field parser, `convert_coordinates`, `calculate_route_buffer`, validators — all unit-tested against the corpus.
- **Exit criterion:** deterministic tools pass on the corpus; data source confirmed; local Gemma runs and its extraction quality is measured on the corpus.

### Phase 1 — UK glider MVP (≈2–3 months)
- Full parsing pipeline (deterministic + local Gemma), hitting the confidence/validation gates. **Replace the `/api/notams` mock** with real parsed output.
- Ingestion adapter for the **NATS AIS Contingency feed** (XML PIB; see §7a); dedupe + cache + store.
- Web map: **replace the starter `App.tsx`** with a Leaflet map that fetches `/api/notams`, renders GeoJSON, colours by hazard type, click for detail + raw text, "unplaceable" warning list.
- **Persona filter** (Glider/VFR) as demote-not-delete, with visible counts.
- **OpenAir export endpoint** producing daily `.openair` files for XCSoar/LX; validate on a real device or XCSoar desktop.
- Route/area draw → filter NOTAMs by intersection.
- Reproducibility log (what was shown + timestamp), framed as "briefing snapshot," **with disclaimers, not legal claims.**
- **Deliverable:** live UK web map + OpenAir export, validated against the golden corpus and a real glider workflow.

### Phase 2 — European expansion (≈3–4 months, gated on agreements)
- Execute EAD Data User Agreement; add **AIXM 5.1 ingestion** (GML → internal model → GeoJSON).
- Extend the agent's knowledge of OPADD/national publishing variations.
- Generalise persona filtering to commercial IFR.
- **Deliverable:** pan-European coverage + multi-persona filtering.

### Phase 3 — North America & scale (≈3–4 months, gated on agreements)
- FAA SWIM / NMS integration; handle FDC NOTAMs, TFRs, and the volume (async streaming, backpressure).
- Horizontal scaling of the parsing pipeline.
- **Deliverable:** global coverage.

*Timelines assume a small team and exclude the calendar time to secure EAD/SWIM agreements, which can dominate Phases 2–3.*

---

## 7. Key risks & open questions

1. **UK data source — RESOLVED (see §7a).** Phase 1 uses the free, unauthenticated, complete **NATS AIS Contingency feed** (XML PIB, hourly). Residual risk: it's contingency infrastructure with *"no declared xml schema… subject to change with minimal notification,"* so build the XML adapter defensively and open a proper NATS/EAD data agreement before going public. **Do not** substitute the FAA feed for UK data — it silently omits locally-disseminated glider NOTAMs.
2. **Local Gemma extraction quality.** A small local model may struggle with messy E-line free text. Measure precision on the golden corpus early. The deterministic geometry layer contains the damage (bad extractions fail validation rather than producing wrong map shapes), and the swappable `AgentRunner` lets a stronger model handle hard cases if needed. Also confirm target hardware can run the chosen Gemma size at acceptable latency.
3. **Throughput at UK volume.** Local inference is slower than a hosted API. Cache aggressively (a NOTAM's text is stable — parse once, reuse); only re-parse on change. Batch overnight for the daily OpenAir export.
4. **Liability & positioning.** Legal review of disclaimers and the "briefing snapshot" feature before any public launch. Position as an *aid*, never an authoritative source.
5. **Geometry-quality bar.** What precision/confidence threshold is acceptable before a NOTAM is shown as "placed" vs. "verify manually"? Needs a safety-driven decision, not just a number.
6. **OpenAir fidelity.** Real-device validation across XCSoar and at least one LX/Naviter unit — format quirks are unforgiving.

---

## 7a. NOTAM data source research (findings, 2026-07-21)

**Headline conclusion:** *there is no single free source that gives complete, global NOTAM coverage — and that's a structural fact of how NOTAMs work, not a gap you can shop around.* International NOTAM distribution is decentralised: each country issues NOTAMs for its own airspace, and **not all of them are flagged for international dissemination**, so no downstream aggregator (including the FAA) sees everything. The right architecture is therefore the **source-adapter pattern already in §3** — pull each region from *its own authoritative source* — not one master feed.

### On the FAA specifically (the "US publishes UK NOTAMs" idea)

You heard correctly *and* there's a critical catch. The FAA does redistribute international NOTAMs (via NOTAM Search / the DoD DINS service, and the new cloud **NMS API** which serves GeoJSON + AIXM). **But the FAA only holds international NOTAMs for _selected locations_, and only those _marked for international dissemination_.** For a glider tool that specifically exists to surface *local* UK hazards — winch launches, small obstacles, parachute DZs, local TDAs — those are exactly the NOTAMs least likely to be flagged for international exchange. **Relying on the FAA for UK data would silently miss the glider-relevant NOTAMs the whole project is built to show** — a direct violation of the "fail loud, never silent" principle. Use the FAA feed for *US* airspace, not for the UK.

### The landscape

| Source | Coverage | Machine-readable? | Access / cost | Verdict for this project |
|---|---|---|---|---|
| **NATS AIS Contingency feed** | **UK — authoritative & complete** | Yes — full UK PIB as **XML**, hourly | **Free, no authentication.** Proven by the MIT-licensed [`Jonty/uk-notam-archive`](https://github.com/Jonty/uk-notam-archive), which mirrors it hourly | **✅ Phase 1 UK MVP source.** Caveat: NATS states the file has *"no declared xml schema… may be subject to change with minimal notification"* — it's contingency infrastructure, not a stable API. Fine for MVP; get a proper NATS/EAD data agreement before production. Also per AIC W003/2026, NATS now publishes planning datasets on the AIS site — check those too. |
| **Eurocontrol EAD (MyEAD, INO)** | **Europe — the authoritative source** | Yes — AIXM 5.1 / XML (B2B) | **Gated:** Data User Agreement, credentials, commercial terms | Phase 2 authoritative source. The "correct" long-term European feed, but slow to onboard. |
| **autorouter.aero API** | Europe (mirrors the full EAD/INO database) | Yes — **JSON**, query by ICAO/FIR, validity filtering | Free-ish (account); terms not fully public | **Strong Phase 2 shortcut** — a usable JSON view of EAD European NOTAMs without the B2B onboarding. Verify its terms permit your redistribution/export. |
| **FAA NMS API** (`nms.aim.faa.gov`) | US complete; international **partial/selected only** | Yes — **GeoJSON + AIXM** | Free; request credentials via `NOTAMS@faa.gov` / the FAA API portal (`api.faa.gov`); registration = accepting FAA data terms | **✅ Phase 3 US source.** Do **not** use as the UK/global source (see catch above). |
| **FAA SWIM / FNS** (JMS feed) | US real-time | Yes — AIXM via JMS | Free with SWIM access agreement | Phase 3 option for high-throughput US streaming; heavier to integrate than NMS REST. |
| **Cirium / Laminar Data Hub** | **Global** | Yes — AIXM 5.1 Digital NOTAM + **GeoJSON** | **Commercial**, developer account | Best "one global feed" if you'll pay — but still bound by the international-dissemination limits above, and adds cost + licensing constraints. |
| **Notamify API (v2)** | Global | Yes — structured **JSON** + interpretation | Credit-based subscription; ~250 free trial credits | Fastest way to prototype a *global* JSON feed; good for testing, watch per-credit cost and redistribution terms at scale. |

### Recommendation

1. **Phase 1 (now): NATS AIS Contingency feed** for the UK. It's free, complete for the UK, machine-readable, and there's a working MIT-licensed reference implementation to learn the XML format from. This unblocks the MVP immediately.
2. **Don't chase "one global source."** Build the ingestion layer as pluggable regional adapters. "Global" = UK→NATS, Europe→autorouter/EAD, US→FAA NMS, each behind the same internal `RawNotam` interface.
3. **If a single global feed is wanted sooner** (e.g. for a demo), spike **Notamify's free trial credits** or evaluate **Cirium/Laminar** — but treat them as convenience layers over the same decentralised reality, not a completeness guarantee.
4. **Legal footing:** the NATS contingency feed carries a "may change without notice / no schema" disclaimer and is contingency infrastructure — acceptable for an MVP, but for anything public/production, open a **NATS AIS / Eurocontrol EAD data agreement** conversation early. Always display the "not an authoritative source — verify against official AIS" disclaimer.

*Sources: FAA NMS FAQ & API portal (`faa.gov/about/initiatives/notam/faqs`, `api.faa.gov`), FAA international NOTAM handling notes (`faa.gov/air_traffic/...notam_html`), [`Jonty/uk-notam-archive`](https://github.com/Jonty/uk-notam-archive), [autorouter NOTAM API wiki](https://www.autorouter.aero/wiki/api/notams/), [Eurocontrol EAD INO](https://www.ead.eurocontrol.int/), Cirium/Laminar Data developer docs, Notamify API docs.*

---

## 7b. Phase 1 build progress (2026-07-21)

**Deterministic core is built, runnable, and tested against the live UK feed.** New backend modules (additive — the parallel-built `main.py`/`database.py`/`models.py` stubs were left untouched):

- `services/geometry.py` — deterministic geometry tools: `parse_coordinate` (DDMM / DDMMSS / decimal-seconds forms), `circle_polygon`, `route_buffer_polygon` (the Red Arrows corridor), and `build_geometry` which prefers precise **ItemE** geometry over the coarse QLine and returns `source='unplaceable'` rather than ever dropping a NOTAM.
- `services/qcodes.py` — deterministic Q-code (`Code23`) → hazard type + glider-relevance classification (no LLM needed for typing).
- `services/nats_ais_client.py` — **real** async client + XML parser for the NATS/EAD contingency PIB (replaces the SkyLink/FAA stub for UK data).
- `services/pipeline.py` — `RawNotam → GeoJSON FeatureCollection`, with the LLM as an explicit fallback hook and a `glider_only` persona filter.
- `tests/` — 21 passing tests, incl. an end-to-end run over a **real 1,496-NOTAM feed snapshot** (`tests/fixtures_pib_sample.xml`).

**Validated on real data (2026-07-21 snapshot):** 1,496 UK NOTAMs → **100% placed, 0 silently dropped, 0 invalid geometries.** Hazard mix: 386 obstacles, 150 danger areas, 147 UAS/drone, 30 glider/winch, 20 parachute, etc. The precise-geometry thesis held: e.g. a Middle Wallop gliding competition parsed to an exact 5 NM circle from ItemE at 0.95 confidence, not the rounded Q-line.

**⚠️ Course-correction flagged to the team:** the parallel build's ingestion (`services/skylink_client.py`, called from `main.py`'s `sync_notams_task`) points at **SkyLink**, a wrapper over the **FAA SWIM** feed. Per §7a research that source silently omits locally-disseminated UK glider NOTAMs and is the wrong Phase-1 source. `nats_ais_client.py` is the correct replacement; `main.py`'s sync task and `/api/notams` should be repointed to `pipeline.build_uk_geojson(...)`.

**Refinement noted for Phase 1.5:** the glider persona filter currently hides ~19% (aerodrome/taxiway/runway/ILS/procedure). Deeper decluttering should be **altitude-band based** (hide NOTAMs whose floor is above a glider ceiling) — the pipeline already carries `lower_fl`/`upper_fl` in feature properties, so this is a small addition.

---

## 8. Immediate next steps

Scaffolding is done; the next moves turn stubs into substance.

1. ✅ **Phase 1 data source resolved:** NATS AIS Contingency feed (§7a). Next action here is to **fetch a live sample and map the XML PIB structure** (using `Jonty/uk-notam-archive` as a format reference) into the `RawNotam` model.
2. **Stand up local Gemma** behind an `AgentRunner` interface; confirm it runs on target hardware and record baseline latency.
3. **Assemble the golden corpus** of hand-verified UK NOTAMs.
4. **Build the deterministic core** in the existing backend: Pydantic `RawNotam`/`ParsedNotam` models, and tool functions (`convert_coordinates`, `calculate_route_buffer`, structural field parser, validators) with unit tests against the corpus.
5. **Replace the `/api/notams` mock** with real parsed output once the pipeline passes on the corpus.
6. **Replace the starter `App.tsx`** with a Leaflet map wired to the backend.
7. Housekeeping: tighten CORS off `*`.

*Build order is deliberate: prove the numbers are right (deterministic tools + corpus) before letting the model near the pipeline, and prove the pipeline before building UI. The scaffolds don't change this — the mocks are placeholders to be replaced last-to-first from the data outward.*
