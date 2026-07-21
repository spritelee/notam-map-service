# **Project Charter and Technical Architecture for an Advanced Agentic NOTAM Visualization Platform**

## **Executive Summary**

The global aviation industry relies upon the Notice to Air Missions (NOTAM) system to distribute critical safety alerts, airspace restrictions, and ground operational conditions to flight crews. Originating from a 1920s telegraphic standard based on maritime notices, the modern NOTAM ecosystem has devolved into an unmanageable, liability-driven data repository1. Flight crews are routinely overwhelmed by pre-flight information bulletins (PIBs) that span hundreds of pages, masking critical flight safety information beneath layers of archaic formatting, unprioritized administrative updates, and highly localized, irrelevant hazards1. For unpowered aviation—specifically the glider pilot community operating under Visual Flight Rules (VFR)—the official briefing tools provided by national authorities such as the United Kingdom’s National Air Traffic Services (NATS) are widely deemed unfit for purpose5.  
While powered General Aviation (GA) pilots have largely mitigated these issues through commercial electronic flight bag (EFB) solutions like SkyDemon, which successfully layer airspace and NOTAM data over moving maps, glider pilots operate in a distinctly different technological ecosystem5. Glider pilots frequently rely on specialized flight computers (e.g., LX Navigation, ClearNav) and open-source software such as XCSoar, which necessitate highly specific legacy data formats like OpenAir to visualize airspace8. Existing web-based workarounds, such as NOTAMInfo, provide adequate macro-level filtering but often fail to accurately render complex spatial geometries, forcing pilots to conduct secondary, route-specific searches across fragmented platforms to ensure legal compliance6.  
This document serves as the foundational project charter and technical architecture specification for a next-generation, AI-driven NOTAM visualization and route-planning platform designed to serve all aviators, from commercial airline dispatchers to local glider club pilots. The proposed system will leverage the Google Antigravity Python SDK to deploy autonomous, large language model (LLM) powered agents capable of executing "deep parsing" on unstructured aeronautical text13. By integrating natively with global data sources—including UK NATS, Eurocontrol's European AIS Database (EAD), and the United States Federal Aviation Administration's (FAA) System Wide Information Management (SWIM) infrastructure—the Antigravity backend will autonomously extract precise spatial geometries, translate them into GeoJSON and OpenAir formats, and present them on an interactive, route-aware geographic interface11. This charter details the systemic industry failures, the technical requirements for complex spatial translation, and the specific agentic backend architecture required to construct a universally applicable, future-proof aviation safety tool.

## **The Global NOTAM Crisis: Operator Feedback and Systemic Failures**

Before engineering a technical solution, it is imperative to analyze the systemic failures of the current NOTAM infrastructure through the lens of operator feedback. The consensus across commercial, military, and general aviation sectors indicates a profound dissatisfaction with how aeronautical data is compiled, distributed, and consumed.

### **The United Kingdom: Glider and General Aviation Perspectives**

In the United Kingdom, the Civil Aviation Authority (CAA) strictly mandates that all pilots review relevant NOTAMs prior to flight to prevent airspace infringements5. The official online source for this data is the NATS Aeronautical Information Service (AIS) portal, which provides PIBs in a densely coded, text-heavy format21. The British Gliding Association (BGA) has formally noted that this official supply method is fundamentally inadequate for practical pre-flight planning, strongly recommending that pilots utilize GPS moving maps with current airspace files instead5.  
Glider pilots face unique challenges because their cross-country flights are rarely linear; they rely on dynamic thermal activity, necessitating broad area awareness rather than a simple point-to-point corridor6. A typical summer weekend in the UK FIR (Flight Information Region) will see the activation of numerous Temporary Danger Areas (TDAs), Restricted Areas (Temporary) \[RA(T)\], parachute drop zones (DZ), and winch launch overflight warnings5. Pilots attempting to parse these hazards manually using NATS PIBs are confronted with coordinates and radius parameters that are difficult to visualize without a map. While tools like Spine and ASSelect offer some filtering capabilities for exporting data to XCSoar or Glide Navigator II, they require significant user perseverance, manual configuration, and daily updates to maintain accuracy7.  
Furthermore, the drone and unmanned aerial systems (UAS) community has introduced a massive influx of low-altitude NOTAMs23. Regulatory feedback indicates that traditional pilots are increasingly frustrated by the proliferation of these Beyond Visual Line of Sight (BVLOS) warnings, which clutter the briefing packages of aircraft operating at significantly higher altitudes24. The CAA's airspace modernization consultations frequently highlight the need for a more proportionate, transparent, and digitally accessible airspace change process, yet immediate improvements to the daily NOTAM feed remain elusive26.

| UK NOTAM Hazard Type | Primary Impact Area | Visualization Challenge |
| :---- | :---- | :---- |
| **Restricted Area (Temporary) / RA(T)** | Red Arrows displays, VIP movements, major events. | Strict avoidance required; often defined by complex polygons or dynamic transits that mapping tools misrepresent as giant circles. |
| **Temporary Danger Area / TDA** | Military exercises, BVLOS drone testing, weapons firing. | High liability; coordinates require exact plotting against planned thermal routes. |
| **Parachute Drop Zones (DZ)** | Unpredictable lateral drift depending on winds aloft. | Drop aircraft operate outside the marked DZ to position; vertical limits often span from Surface (SFC) to Flight Level 100+. |
| **Winch Launch Overflights** | Intense, highly localized vertical hazards (up to 3,000 ft AGL). | Highly transient; requires acute local area awareness for cross-country gliders approaching unfamiliar airfields. |
| **Obstacles (Cranes, Masts)** | Low-level VFR operations and final approaches. | Frequently left as permanent NOTAMs rather than integrated into the static AIP; creates immense visual clutter on maps. |

### **European and International Operations: Information Overload**

Expanding beyond the UK, the European airspace managed by Eurocontrol via the European AIS Database (EAD) suffers from similar data bloat17. The EAD centralizes International NOTAM Operations (INO) and Static Data Operations (SDO), processing millions of updates in accordance with the Operating Procedures for AIS Dynamic Data (OPADD)17. Despite these centralization efforts, commercial airline crews flying trans-European or intercontinental routes report severe information overload.  
Airline dispatchers and flight crews frequently receive PIBs exceeding 100 pages, the vast majority of which contain what the former chairman of the US National Transportation Safety Board (NTSB) bluntly categorized as "garbage"2. Pilots operating at Flight Level 350 are forced to parse through notices detailing grass-cutting operations, unlit perimeter fences, or minor taxiway closures at en-route alternate airports they have no intention of using1. This data obfuscation creates a dangerous psychological phenomenon known as "cry wolf" syndrome, where pilots become complacent and routinely skim or ignore critical safety alerts4. This systemic flaw directly contributed to the near-catastrophe of Air Canada Flight 759 in 2017, where a fatigued crew missed a single, buried NOTAM indicating a runway closure at San Francisco International Airport, resulting in the aircraft descending toward a taxiway occupied by four fully loaded passenger jets1.

### **The North American Infrastructure Crisis**

In the United States, the FAA manages a staggering volume of data, issuing over four million NOTAMs annually30. The fragility of the legacy US NOTAM System (USNS) was violently exposed in January 2023 when a corrupted database file, inadvertently damaged by contract personnel, caused a cascading IT failure30. The resulting nationwide ground stop paralyzed the National Airspace System (NAS), highlighting the critical dependency on an archaic 1985-era infrastructure30.  
In response, the FAA accelerated the deployment of the NOTAM Modernization Service (NMS), a cloud-hosted, scalable architecture designed to establish a single authoritative source for all notices by Spring 202618. While the NMS API will improve data distribution and transition the US toward ICAO-standard formatting, the fundamental issue of extracting actionable geometric data from telegraphic text remains a burden pushed onto the end-user or third-party developers36.

## **The Technical Challenge: Deep Parsing and Spatial Translation**

The fundamental barrier to building a universally effective NOTAM tool is the reliance on highly condensed, unstructured telegraphic language to describe complex spatial relationships. Converting this text into reliable geographic data requires moving beyond traditional programming paradigms into the realm of artificial intelligence.

### **The Limitations of Shallow Parsing**

Historically, automated NOTAM processing has relied on "Shallow Parsing"—utilizing regular expressions (regex), Term Frequency-Inverse Document Frequency (TF-IDF), or traditional Named Entity Recognition (NER) to extract variables from the text13. While these methods can successfully extract a date or an ICAO airport code, they fail catastrophically when interpreting the operational semantics of the free-text E) line14.  
Academic research formalizes the solution as "Deep Parsing," a dual-reasoning challenge requiring both Dynamic Knowledge Grounding and Schema-Based Inference13.

* **Dynamic Knowledge Grounding** requires the parsing engine to link ambiguous textual references (e.g., "RWY 04L CLSD") to an external, dynamic database of aeronautical infrastructure to deduce the actual geographic footprint13.  
* **Schema-Based Inference** requires the system to apply domain-specific operational rules to deduce the true impact of a statement. For example, extracting "REDUCED LENGTH OF 300M" is useless without the reasoning capability to mathematically alter the polygon of the runway threshold in the output geometry14.

### **The Coordinate Translation Problem: The Red Arrows Scenario**

The most severe manifestation of the shallow parsing failure occurs with dynamic airspace events, perfectly illustrated by the Royal Air Force Red Arrows formation transits in the UK. When the Red Arrows transit between airshows, the issuing authority files a NOTAM to warn other pilots of fast-moving military aircraft39.  
A standard ICAO NOTAM utilizes a Q) line qualifier intended for automated filtering, which includes an 11-character coordinate and a 3-digit radius37. Because the Red Arrows traverse large distances, the authority often creates a massive, generalized radius in the Q) line to encompass the entire route. If a mapping tool (like many legacy web viewers) relies solely on the Q) line to draw the hazard, it will render a gigantic, 20+ nautical mile circle on the map, artificially indicating that a massive volume of airspace is restricted40.  
The actual, precise route is buried in the unstructured E) line text.  
**Example Red Arrows NOTAM Text:**  
Q) EGTT/QWVLW/IV/M /W /000/030/5322N00047W021  
E) FORMATION TRANSIT BY RED ARROWS ACFT ROUTING:  
530858N 0003125W RAF WADDINGTON 0935  
531153N 0003908W N OF THORPE ON THE HILL 0937  
530908N 0005609W N OF MAPLEBECK 0939  
531509N 0010251W VCY OF CLUMBER PARK 0940  
To provide genuine value to a pilot, the parsing engine must possess the semantic intelligence to ignore the overly broad Q) line radius. Instead, it must iterate through the E) line, recognize the sequence of coordinates (530858N 0003125W), correlate them with their respective timestamps (0935), and construct a precise sequential route40. The system must then mathematically buffer this route (e.g., adding a 2 NM lateral buffer) to generate a protective LineString or Polygon in GeoJSON, accurately reflecting the transit corridor rather than blanketing the entire region in a false positive40.

### **Bridging Formats: AIXM to GeoJSON to OpenAir**

The platform must act as a universal translator across three distinct eras of aeronautical data encoding.

> 1. **AIXM 5.1 (Aeronautical Information Exchange Model):** The primary ingestion format from institutional APIs like Eurocontrol EAD and FAA SWIM. AIXM utilizes the Geographical Markup Language (GML 3.2.1) to encode data as aixm:ElevatedPoint, aixm:ElevatedCurve, and aixm:ElevatedSurface43.  
> 2. **GeoJSON (RFC 7946):** The de-facto web standard for modern GIS applications. The system must translate GML topologies into GeoJSON FeatureCollections using WGS84 longitude/latitude axis order to feed the modern, interactive web-map interface19.  
> 3. **OpenAir Format:** To fulfill the explicit requirement of supporting unpowered glider pilots, the platform must compile the GeoJSON data into OpenAir (.txt or .openair). This format, originally developed in 1998 for WinPilot and widely used by XCSoar and Naviter devices, requires strict text-based commands11.

| OpenAir Command | Semantic Definition | Implementation Requirements |
| :---- | :---- | :---- |
| AC | Airspace Class (e.g., R, Q, P, A-G) | Must be mapped from the NOTAM type (e.g., QWPLW for parachuting maps to a Danger or Restricted class)11. |
| AH / AL | Altitude High / Altitude Low | Must strictly extract limits from the NOTAM (e.g., SFC-FL095) and format with valid references (AMSL, AGL, FL) without ambiguity11. |
| DP | Data Point (Polygon Coordinate) | GeoJSON LineStrings and Polygons must be mathematically decomposed into sequential DP coordinate strings formatted as DD:MM:SS\[N/S\] DDD:MM:SS\[E/W\]11. |
| V X= & DC | Arc Center & Draw Circle | Utilized exclusively for standard Q) line circular NOTAMs, extracting the center point and generating the radius constraint11. |
| AA | Activation Time (ISO 8601\) | Must parse the B) and C) fields of the NOTAM to embed active UTC intervals directly into the airspace block11. |

## **Antigravity Backend Architecture Specification**

To solve the deep parsing dilemma and manage the complex data translation pipeline, the backend will be architected entirely upon the Google Antigravity Python SDK. Antigravity is a programmatic framework designed to build, test, and run autonomous AI agents, abstracting the complex machinery of state management, tool execution, and context windows15. By utilizing an agentic pipeline, the system replaces fragile regex scripts with a resilient, reasoning-capable core.

### **The Antigravity Ecosystem and Configuration**

The Antigravity SDK allows developers to decouple the agent's logic from its execution environment15. The platform will deploy a microservices architecture where specialized Antigravity agents handle discrete phases of the NOTAM lifecycle.  
The foundational instantiation of the agent utilizes the LocalAgentConfig and relies on strict system\_instructions to establish the agent's persona as an expert aeronautical data parser16.

#### **1\. Data Ingestion via Model Context Protocol (MCP)**

Antigravity natively supports the Model Context Protocol (MCP), allowing agents to seamlessly connect to external, live data servers15. The architecture will deploy dedicated MCP servers (via McpStdioServer or HTTP/SSE) connected to the primary aviation authorities:

* **The UK NATS / EAD MCP:** Interfaces with the Eurocontrol MyEAD system via B2B XML message exchange to pull Static Data Operations (SDO) and International NOTAMs (INO)28.  
* **The FAA NMS / SWIM MCP:** Interfaces with the FAA's NOTAM Management Service API, utilizing real-time Solace messaging or RESTful endpoints (similar to SkyLink or Aviation Edge APIs) to retrieve continuous updates18.

Instead of writing brittle API scraping scripts, the Antigravity agent is simply provided access to these MCP tools. The agent can dynamically query the MCP servers for specific geographic bounding boxes, active timeframes, or specific ICAO identifiers, pulling only the raw AIXM or text data required for the current user's route15.

#### **2\. The Agentic Pipeline and Tool Ecosystem**

Once the raw NOTAMs are ingested, they enter the Antigravity processing pipeline. The SDK's true power lies in its "Governed Extensibility"—the ability to register custom Python callables as tools that the agent can autonomously invoke during its reasoning loop15.  
The backend will supply the agent with a suite of bespoke aeronautical tools:

* query\_aip\_database(icao\_code): Allows the agent to perform Dynamic Knowledge Grounding by looking up the exact geographic coordinates of a runway or navaid mentioned vaguely in the E) text13.  
* convert\_coordinates(coord\_string): A deterministic Python function that the agent can call to securely convert diverse NOTAM coordinate formats (e.g., 530858N 0003125W) into standardized WGS84 decimal degrees required for GeoJSON mapping43.  
* calculate\_route\_buffer(waypoints, width\_nm): A spatial math function the agent calls to automatically generate a protective GeoJSON polygon around a sequence of points (solving the Red Arrows transit problem)40.

#### **3\. Declarative Safety Policies and Lifecycle Hooks**

Because LLMs can hallucinate or execute tools in unintended ways, Antigravity’s declarative safety policy engine is paramount15. The architecture will enforce a "deny by default" posture to guarantee determinism in the final output.  
Using the SDK's policy framework, all tools will be restricted unless explicitly permitted15:

* deny("\*"): Blocks all baseline agent tools (preventing the agent from executing arbitrary shell commands or reading host system files).  
* allow("query\_aip\_database"): Permits the agent to look up static data.  
* allow("convert\_coordinates"): Permits coordinate math.

Furthermore, the pipeline will utilize Antigravity's robust Lifecycle Hooks (Inspect, Decide, Transform)15.

* **Transform Hooks** will be inserted immediately after the agent yields a parsed coordinate string. Before the string is finalized into the JSON payload, the Transform hook will programmatically sanitize the data, ensuring no stray characters or hallucinated formats compromise the final mapping engine16.  
* **Inspect Hooks** will continuously monitor the agent's internal reasoning ("thinking bubbles") and token usage. This allows system administrators to audit the reasoning process if a NOTAM is incorrectly mapped, providing a clear debug trail16.

#### **4\. Structured Output and Presentation**

The final step in the Antigravity loop is enforcing Structured Output. Utilizing Pydantic V2 models, the agent is instructed to yield its final analysis in a strictly typed JSON schema15. This eliminates the need for complex post-processing. The agent populates fields for notam\_id, hazard\_type, effective\_start, altitude\_limits, and the mathematically verified geojson\_geometry.  
This clean GeoJSON is immediately pushed to the web frontend (utilizing Mapbox or Leaflet) for visual rendering. Concurrently, a secondary, deterministic Python microservice ingests the GeoJSON and translates it into the rigid OpenAir format string, making it instantly available for glider pilots to download and transfer to their XCSoar or LX navigation devices9.

## **Future-Proofing: Route Planning, Smart Filtering, and Legal Compliance**

A modern aviation tool must do more than simply draw shapes on a map; it must actively assist in route planning and ensure the pilot's legal compliance.

### **Persona-Based Smart Filtering**

To eliminate the "cry wolf" syndrome and reduce the 100-page briefing down to actionable intelligence, the platform will implement Persona-Based Filtering1. When a user configures their profile, they establish their operational parameters (e.g., Unpowered Glider, VFR Light Aircraft, Commercial IFR).  
The Antigravity agent utilizes this context during the parsing phase. If a glider pilot requests a route briefing, the agent autonomously filters out high-altitude airway changes (above FL100), airport taxiway closures, and instrument approach procedure (IFP) alterations4. Conversely, it highly prioritizes Temporary Danger Areas, winch launch warnings, and parachute drop zones5. This ensures the visual map is pristine, displaying only hazards that genuinely impact the specific flight.

### **The Briefing Audit Trail and Cryptographic Logging**

Aviation authorities mandate that the pilot in command is solely responsible for reviewing all relevant NOTAMs prior to departure5. In the event of an airspace infringement, an Airprox incident, or a regulatory audit, the pilot must prove they obtained a valid pre-flight briefing5.  
To future-proof the platform and protect its users, the system will feature a "Briefing Audit Trail." When a pilot finalizes their route on the map, the backend will compile the exact subset of NOTAMs presented on their screen. The system will generate a cryptographic hash of this dataset alongside a UTC timestamp, logging it securely to the user's account. This digitally signed ledger serves as incontrovertible proof of the airspace state at the time of the briefing. If a regulatory body subsequently issues a rapid-response NOTAM while the pilot is airborne and an infringement occurs, the pilot possesses cryptographic evidence that the restriction was not active or visible during their legal pre-flight planning phase.

## **Strategic Implementation Roadmap**

To manage risk and ensure the accuracy of the AI parsing models, the project will be deployed in three distinct, geographically scaled phases.

### **Phase 1: United Kingdom and Glider Focus (Months 1-4)**

* **Target:** Resolve the immediate pain points for the UK gliding and GA communities5.  
* **Data Integration:** Establish MCP connections to the NATS AIS portal to ingest UK Contingency PIBs and Aeronautical Information Circulars (AICs)7.  
* **Agent Optimization:** Train and validate the Antigravity Geo-Spatial Parser Agent specifically against complex UK formats, prioritizing the flawless extraction of Red Arrows transits, parachute DZs, and RA(T) polygons25.  
* **Deliverable:** A live web-based map for UK airspace and a dedicated export endpoint generating daily .openair files tailored specifically for XCSoar and legacy flight computers8.

### **Phase 2: European Expansion and MyEAD Integration (Months 5-8)**

* **Target:** Scale operations across the European Civil Aviation Conference (ECAC) airspace28.  
* **Data Integration:** Execute an EAD Data User Agreement with Eurocontrol to secure B2B MyEAD access28. Transition the ingestion layer to process AIXM 5.1 Static Data Operations (SDO) and International NOTAM (INO) messages29.  
* **Agent Optimization:** Expand the agent's contextual knowledge base to handle multiple European OPADD variations, ensuring accurate schema inference across different national publishing habits17.  
* **Deliverable:** Seamless pan-European visual coverage and the launch of the Persona-Based Smart Filtering system, allowing commercial crews to utilize the tool without being overwhelmed by VFR-specific data1.

### **Phase 3: North American Integration and Global Scale (Months 9-12)**

* **Target:** Integrate the massive volume of the US National Airspace System (NAS) and achieve full global utility.  
* **Data Integration:** Connect the Antigravity MCP servers to the FAA's System Wide Information Management (SWIM) and the modernized NOTAM Management Service (NMS) APIs18.  
* **Agent Optimization:** Leverage the Antigravity SDK's asynchronous streaming capabilities to handle the extreme throughput of the US airspace16. Fine-tune the agent to manage US-specific classifications, such as FDC NOTAMs and complex TFRs (Temporary Flight Restrictions)37.  
* **Deliverable:** A globally comprehensive, AI-driven aeronautical intelligence platform serving the entire aviation spectrum, from drone operators to international airline dispatchers.

## **Conclusion**

The reliance on a century-old telegraphic paradigm to communicate complex, three-dimensional spatial data represents a severe, documented vulnerability in global aviation safety. The resultant cognitive overload placed upon pilots is a systemic failure that traditional software engineering has proven incapable of resolving. By establishing this project charter, we delineate a definitive, technologically advanced blueprint to modernize aeronautical intelligence.  
By anchoring the backend architecture on the Google Antigravity Python SDK, the platform will utilize autonomous, governed AI agents to perform the complex deep parsing required to extract deterministic geometries from unstructured text. Through intelligent, automated translation pipelines bridging AIXM, GeoJSON, and OpenAir formats, the system ensures that every aviator—regardless of whether they operate a commercial airliner with an advanced EFB or an unpowered glider utilizing an XCSoar display—possesses absolute, intuitive situational awareness. The execution of this architecture will not only alleviate the administrative burden on flight crews but will fundamentally restore the NOTAM system to its original, intended purpose: safeguarding human life in the air.

#### **Works cited**

> 1. The Problem \- why are Pilots deeply concerned about Notams?, [https://fixingnotams.org/the-problem-why-are-pilots-deeply-concerned-about-notams/](https://fixingnotams.org/the-problem-why-are-pilots-deeply-concerned-about-notams/)  
> 2. Flying Blind: The Importance of NOTAMs in Aviation \- Fear of Landing, [https://fearoflanding.com/demystifying/flying-blind-the-importance-of-notams-in-aviation/](https://fearoflanding.com/demystifying/flying-blind-the-importance-of-notams-in-aviation/)  
> 3. Fixing NOTAMs \- a guide (don't get stung), [https://fixingnotams.org/a-guide-to-fixing-notams/](https://fixingnotams.org/a-guide-to-fixing-notams/)  
> 4. Here's what pilots and controllers REALLY think about Notams \- OpsGroup, [https://ops.group/blog/heres-what-pilots-and-controllers-really-think-about-notams/](https://ops.group/blog/heres-what-pilots-and-controllers-really-think-about-notams/)  
> 5. Maintaining safe airspace \- Pilot & Club Info \- British Gliding Association, [https://members.gliding.co.uk/airspace/maintaining-safe-airspace/](https://members.gliding.co.uk/airspace/maintaining-safe-airspace/)  
> 6. Notices to Aviation (NOTAMs) \- British Hang Gliding and Paragliding Association, [https://www.bhpa.co.uk/safety/notam/](https://www.bhpa.co.uk/safety/notam/)  
> 7. NOTAMS and Airspace \- Booker Gliding Club, [https://bookergliding.co.uk/notams-and-airspace](https://bookergliding.co.uk/notams-and-airspace)  
> 8. Aufwind: Glider Flight Prep \- App Store \- Apple, [https://apps.apple.com/ci/app/aufwind-glider-flight-prep/id1472566219](https://apps.apple.com/ci/app/aufwind-glider-flight-prep/id1472566219)  
> 9. NOTAM process \- Gliding Matters, [https://www.ruskin.me.uk/flying/notam-process](https://www.ruskin.me.uk/flying/notam-process)  
> 10. XCSoar \- Get High Stay High \- BlueFlyVario, [https://gethighstayhigh.blueflyvario.com/?page\_id=149](https://gethighstayhigh.blueflyvario.com/?page_id=149)  
> 11. seeyou\_file\_formats/OpenAir\_File\_Format\_Support.md at main \- GitHub, [https://github.com/naviter/seeyou\_file\_formats/blob/main/OpenAir\_File\_Format\_Support.md](https://github.com/naviter/seeyou_file_formats/blob/main/OpenAir_File_Format_Support.md)  
> 12. Exporting NOTAMs, [https://notaminfo.com/exporthelp](https://notaminfo.com/exporthelp)  
> 13. A Knowledge-Guided Self-Evolving Optimization Framework with LLMs for NOTAM Interpretation, [https://ojs.aaai.org/index.php/AAAI/article/view/37043/41005](https://ojs.aaai.org/index.php/AAAI/article/view/37043/41005)  
> 14. A Knowledge-Guided Self-Evolving Optimization Framework with LLMs for NOTAM Interpretation \- arXiv, [https://arxiv.org/html/2511.07982v1](https://arxiv.org/html/2511.07982v1)  
> 15. Google Antigravity SDK \- Google Antigravity Documentation, [https://antigravity.google/docs/sdk/overview](https://antigravity.google/docs/sdk/overview)  
> 16. Google Antigravity SDK, [https://antigravity.google/blog/introducing-google-antigravity-sdk](https://antigravity.google/blog/introducing-google-antigravity-sdk)  
> 17. International NOTAM operations (EAD INO) \- Eurocontrol, [https://www.eurocontrol.int/service/international-notam-operations](https://www.eurocontrol.int/service/international-notam-operations)  
> 18. FAA NMS, [https://nms.aim.faa.gov/](https://nms.aim.faa.gov/)  
> 19. AVCBIN to GeoJSON Converter Online | MyGeodata Cloud, [https://mygeodata.cloud/converter/avcbin-to-geojson](https://mygeodata.cloud/converter/avcbin-to-geojson)  
> 20. Links/downloads \- CAA Infringement Tutorial \- Civil Aviation Authority, [https://infringements.caa.co.uk/links-downloads/](https://infringements.caa.co.uk/links-downloads/)  
> 21. Home \- NATS UK, [https://nats-uk.ead-it.com/cms-nats/opencms/en/home/](https://nats-uk.ead-it.com/cms-nats/opencms/en/home/)  
> 22. (NATS) Aeronautical Information Service \- On-Track Aviation, [https://www.ontrackaviation.com/nats\_ais.html](https://www.ontrackaviation.com/nats_ais.html)  
> 23. Notifying other airspace users about your activity | UK Civil Aviation Authority, [https://www.caa.co.uk/drones/open-category/moving-on-to-more-advanced-flying/airspace/notifying-other-airspace-users-about-your-activity/](https://www.caa.co.uk/drones/open-category/moving-on-to-more-advanced-flying/airspace/notifying-other-airspace-users-about-your-activity/)  
> 24. Check those NOTAMs\! | The Pilot's Place Forums, [https://thepilotsplace.com/forum/index.php?threads/check-those-notams.29945/](https://thepilotsplace.com/forum/index.php?threads/check-those-notams.29945/)  
> 25. Understanding UK NOTAMs – How to Read and Use Them for Drone Flying, [https://droneguide.uk/blog/how-to-read-uk-notams/](https://droneguide.uk/blog/how-to-read-uk-notams/)  
> 26. UK aviation regulator proposes reform of how UK airspace is modernised, [https://www.caa.co.uk/newsroom/news/uk-aviation-regulator-proposes-reform-of-how-uk-airspace-is-modernised/](https://www.caa.co.uk/newsroom/news/uk-aviation-regulator-proposes-reform-of-how-uk-airspace-is-modernised/)  
> 27. IN-2015/102: NOTAM Policy Procedural Changes | UK Civil Aviation Authority, [https://www.caa.co.uk/publication/pid/6978](https://www.caa.co.uk/publication/pid/6978)  
> 28. European AIS Database (EAD) \- Eurocontrol, [https://www.eurocontrol.int/service/european-ais-database](https://www.eurocontrol.int/service/european-ais-database)  
> 29. Static data operations (EAD SDO/SDD) \- Eurocontrol, [https://www.eurocontrol.int/service/static-data-operations](https://www.eurocontrol.int/service/static-data-operations)  
> 30. U.S. Transportation Secretary Sean P. Duffy Deploys Brand New 'Notice to Airmen' System to Provide Critical Alerts About Airspace Changes | Federal Aviation Administration, [https://www.faa.gov/newsroom/us-transportation-secretary-sean-p-duffy-deploys-brand-new-notice-airmen-system-provide](https://www.faa.gov/newsroom/us-transportation-secretary-sean-p-duffy-deploys-brand-new-notice-airmen-system-provide)  
> 31. Federal IT Is Too Big to Fail: The FAA's NOTAM Fiasco | Blogs | Jan 11, 2023 | ITIF, [https://itif.org/publications/2023/01/11/federal-it-is-too-big-to-fail-the-faa-notam-fiasco/](https://itif.org/publications/2023/01/11/federal-it-is-too-big-to-fail-the-faa-notam-fiasco/)  
> 32. FAA NOTAM Statement | Federal Aviation Administration, [https://www.faa.gov/newsroom/faa-notam-statement](https://www.faa.gov/newsroom/faa-notam-statement)  
> 33. What's behind the latest air travel chaos? Problems with the little-known NOTAM system, [https://www.cbc.ca/news/us-air-travel-chaos-notam-outage-1.6710734](https://www.cbc.ca/news/us-air-travel-chaos-notam-outage-1.6710734)  
> 34. The Federal Aviation Administration's NOTAM System Failure and its Impacts on a Resilient National Airspace \- Department of Transportation, [https://www.transportation.gov/federal-aviation-administrations-notam-system-failure-and-its-impacts-resilient-national-airspace](https://www.transportation.gov/federal-aviation-administrations-notam-system-failure-and-its-impacts-resilient-national-airspace)  
> 35. Hearing: Air Traffic Control Still Needs Significant Improvement, [https://enotrans.org/article/hearing-air-traffic-control-still-needs-significant-improvement/](https://enotrans.org/article/hearing-air-traffic-control-still-needs-significant-improvement/)  
> 36. NBAA News Hour: What NOTAM Modernization Means to You, [https://nbaa.org/aircraft-operations/airspace/atc-issues-procedures/notam-realignment/nbaa-news-hour-what-notam-modernization-means-to-you/](https://nbaa.org/aircraft-operations/airspace/atc-issues-procedures/notam-realignment/nbaa-news-hour-what-notam-modernization-means-to-you/)  
> 37. FAA ICAO NOTAM Format Example, [https://www.faa.gov/air\_traffic/flight\_info/aeronav/notams/media/ICAO\_NOTAM\_Format\_Example.pdf](https://www.faa.gov/air_traffic/flight_info/aeronav/notams/media/ICAO_NOTAM_Format_Example.pdf)  
> 38. Semantics-Aware Prompting for Translating NOtices To AirMen \- ACL Anthology, [https://aclanthology.org/2025.findings-acl.1253.pdf](https://aclanthology.org/2025.findings-acl.1253.pdf)  
> 39. Red Arrows Flying Today — Thunder Over Michigan Air Show | RAFRedArrows.co.uk | RAFRedArrows.co.uk, [https://rafredarrows.co.uk/](https://rafredarrows.co.uk/)  
> 40. Red Arrows NOTAM and how it is shown on thedronemap.com vs. other maps \- Drone Hub, [https://dronehub.co.uk/t/red-arrows-notam-and-how-it-is-shown-on-thedronemap-com-vs-other-maps/8031](https://dronehub.co.uk/t/red-arrows-notam-and-how-it-is-shown-on-thedronemap-com-vs-other-maps/8031)  
> 41. Red Arrows formation flight transiting the RAF Waddington area via a specified route at 250–2000 ft AGL. \- EGTT NOTAM | Notamify, [https://notamify.com/notams/EGTT/e2d2448f-ab1c-4177-8e4b-da39692c14e3](https://notamify.com/notams/EGTT/e2d2448f-ab1c-4177-8e4b-da39692c14e3)  
> 42. Convert a string of coordinates to a readable polyline for export as GeoJSON, [https://gis.stackexchange.com/questions/203388/convert-a-string-of-coordinates-to-a-readable-polyline-for-export-as-geojson](https://gis.stackexchange.com/questions/203388/convert-a-string-of-coordinates-to-a-readable-polyline-for-export-as-geojson)  
> 43. Digital NOTAM \- SWIM Confluence, [https://swim-eurocontrol.atlassian.net/wiki/spaces/DNOTAM/pages/220791160](https://swim-eurocontrol.atlassian.net/wiki/spaces/DNOTAM/pages/220791160)  
> 44. FAA NOTAM: Notice to Airmen Format Conversion \- AIXM to GeoJSON \- Topcoder, [https://www.topcoder.com/challenges/99a8ebdb-7a81-4bff-ab05-712bbc6600a3](https://www.topcoder.com/challenges/99a8ebdb-7a81-4bff-ab05-712bbc6600a3)  
> 45. OpenAir specifications \- pyOpenair's documentation\! \- Read the Docs, [https://pyopenair.readthedocs.io/en/master/openair.html](https://pyopenair.readthedocs.io/en/master/openair.html)  
> 46. openair \- Rust \- Docs.rs, [https://docs.rs/openair](https://docs.rs/openair)  
> 47. The Student Pilot's Essential Guide to Decoding NOTAMs \- QuizAero, [https://www.quizaero.co.uk/post/the-student-pilot-s-essential-guide-to-decoding-notams](https://www.quizaero.co.uk/post/the-student-pilot-s-essential-guide-to-decoding-notams)  
> 48. How to read NOTAMS \- Learn ATC, [https://www.learn-atc.com/blog/how-to-read-notams](https://www.learn-atc.com/blog/how-to-read-notams)  
> 49. Antigravity SDK, [https://antigravity.google/product/antigravity-sdk](https://antigravity.google/product/antigravity-sdk)  
> 50. GitHub \- google-antigravity/antigravity-sdk-python: A Python library for building AI agents that leverage the full power of Google Antigravity., [https://github.com/google-antigravity/antigravity-sdk-python](https://github.com/google-antigravity/antigravity-sdk-python)  
> 51. The European Organisation for the Safety of Air Navigation | My EAD \- EUROCONTROL, [https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/ead-solutions/my-ead/](https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/ead-solutions/my-ead/)  
> 52. NOTAM API — Real-Time Notices to Air Missions \- GitHub, [https://github.com/SkyLink-API/notam-api](https://github.com/SkyLink-API/notam-api)  
> 53. Airport and FIR NOTAM Data Through a Simple API | by Aviation Edge | Jul, 2026 \- Medium, [https://medium.com/@AviationEdgeAPI/airport-and-fir-notam-data-through-a-simple-api-fc95ed979b35](https://medium.com/@AviationEdgeAPI/airport-and-fir-notam-data-through-a-simple-api-fc95ed979b35)  
> 54. Coordinate Format Converter — Lat/Lon ↔ UTM ↔ MGRS ↔ DMS \- GeoUtil, [https://geoutil.com/converters/coordinate-formats.html](https://geoutil.com/converters/coordinate-formats.html)  
> 55. Airspace \- Pilot & Club Info \- British Gliding Association, [https://members.gliding.co.uk/airspace/](https://members.gliding.co.uk/airspace/)  
> 56. Managing flying risk \- flying in gliding competitions \- Pilot & Club Info, [https://members.gliding.co.uk/safety/managing-flying-risk-index/flying-in-gliding-competitions/](https://members.gliding.co.uk/safety/managing-flying-risk-index/flying-in-gliding-competitions/)  
> 57. NATS AIS Internet Briefing System Contingency, [https://www.nats.aero/do-it-online/pre-flight-information-bulletins/](https://www.nats.aero/do-it-online/pre-flight-information-bulletins/)  
> 58. GEN 3.1 AERONAUTICAL INFORMATION SERVICES \- NATS, [https://www.aurora.nats.co.uk/htmlAIP/Publications/2020-12-31-AIRAC/html/eAIP/EG-GEN-3.1-en-GB.html](https://www.aurora.nats.co.uk/htmlAIP/Publications/2020-12-31-AIRAC/html/eAIP/EG-GEN-3.1-en-GB.html)  
> 59. GitHub \- svoop/notam: Parser for NOTAM (Notice to Air Missions), [https://github.com/svoop/notam](https://github.com/svoop/notam)  
> 60. NOTAMs and DROTAMs Guide: How to Read and Decode Them \- Pilot Institute, [https://pilotinstitute.com/notams-and-drotams/](https://pilotinstitute.com/notams-and-drotams/)