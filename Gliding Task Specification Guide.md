# **Development Specification and Operational Analysis of Gliding Task Geometries, Avionics Protocol Standards, and Declarations in the UK and Europe**

## **Regulatory Frameworks and Competition Topologies in European Soaring**

Competitive soaring in the United Kingdom and continental Europe operates under a highly structured regulatory matrix that coordinates international standards with national variations. The Fédération Aéronautique Internationale (FAI) International Gliding Commission (IGC) establishes the foundational framework through the FAI Sporting Code Section 3, which is supplemented by Annex A for World and Continental Championships, Annex B for flight recorder verification, and Annex C for operational observation1. At the national level, organizations such as the British Gliding Association (BGA) adapt these rules to formulate national-rated competition frameworks, decentralized online leagues, and badge validation systems4.  
For glider pilots and software developers engineering modern soaring applications, these rules dictate how cross-country tasks are planned, declared, flown, and scored8. Automated scoring environments must accommodate both decentralized online portals and structured, on-site racing events7. Decoupled leagues, such as the On-Line Contest (OLC), WeGlide, and the UK National Ladder, evaluate pilot performance using GPS track logs rather than controlled start gates7.

| Competition Type | Regulatory Body | Core Task Formats | Scoring Engine Paradigm |
| :---- | :---- | :---- | :---- |
| **FAI Championships** | FAI / IGC3 | Racing Tasks (RT), Assigned Area Tasks (AAT)14 | Centralized scoring scripts (e.g., SeeYou Competition)14 |
| **BGA Rated Competitions** | BGA Competitions Committee7 | RT, AAT, Assigned Distance Tasks (ADT)17 | Handcapped formula-based scripts5 |
| **BGA National Ladder** | British Gliding Association12 | Declared closed courses, Undeclared free flights12 | Distance, speed, and shape-factor point matrices12 |
| **WeGlide / OLC** | WeGlide / OLC Committee11 | Free flights, declared triangles, quadrilaterals11 | Decentralized, automated digital signature verification11 |

The BGA National Ladder operates two primary pathways: Declared tasks and Undeclared (free) flights12. A declared task requires an electronic declaration generated before takeoff, which defines a specific sequence of start, turn, and finish points12. Successful completion of a declared task yields substantial point bonuses, including a ![][image1] completion factor bonus and speed-points recognition12.  
Conversely, undeclared flights allow pilots to claim up to four arbitrary turnpoints post-flight18. These are verified against the GPS trace by finding the closest official BGA Ladder Turning Points that yield the shortest scoring distance18. Additionally, unique European regional awards, such as the UK 100 km Diploma, mandate that pilots complete a pre-declared 100 km closed-circuit (either a triangle or an out-and-return course) starting and finishing over a 1 km line6. This task must be flown within Europe under the supervision of a BGA Official Observer (OO) at a minimum handicapped speed of 65 km/h6.  
To maintain equity across disparate sailplane designs, scoring engines utilize dynamic handicapping matrices14. In the UK and Europe, gliders are indexed according to the BGA Handicap List, which assigns a percentage handicap based on the aircraft's performance potential and its reference configuration weight16.  
During on-site regional championships where diverse sailplane classes must compete in a single group, software solutions rely heavily on these handicaps to calculate adjusted speeds and distances, ensuring that lower-performing vintage gliders can compete fairly against modern carbon-fiber racing designs17. Under standard BGA rating calculations, speed and distance points are mathematically scaled according to these reference parameters, penalizing weight limit overages and accommodating specific class handicaps5.

## **Task Geometries, Observation Zones, and Start/Finish Safety Protocols**

At the core of gliding competition software is the definition of the spatial boundaries that a glider must cross to validate its flight path2. These boundaries, known as Observation Zones (OZs), are configured dynamically according to the task type and the sequence of the task points2.

       \[Start Cylinder\] 10km Radius  
       \+----------------------------+  
       |                            |  
       |         \* \[PEV Fix\]        | \----\> Starts the task clock inside  
       |        /                   |  
       \+-------/--------------------+  
              /  
             / (Leg 1\)  
            v  
       \[Turnpoint 1\] 400m Barrel Cylinder  
       \+-----+  
       |  \*  | \----\> Clipped for validation (1km distance deduction under BGA)  
       \+-----+  
            \\  
             \\ (Leg 2\)  
              v  
       \[Turnpoint 2\] FAI 90-Degree Sector  
             \\       /  
              \\ 45° /  
               \\   /   
                \\ /  
                 \* \[Way Point\]

### **Start Point Geometries and PEV Mechanics**

The initiation of a task is defined by crossing a Start Observation Zone2. Software suites must support two main start topologies:

* **Start Line:** A 1 km straight line (500 m radius) centered on the start point and oriented perpendicular to the course of the first task leg2. The start is validated when the glider's track transitions across this line from the reverse side to the forward course side8.  
* **Start Cylinder (Polish / Cylinder Start):** A circular zone centered on the start waypoint with a radius that is typically configured to at least 10 km25. This layout is used to mitigate the safety hazards of thermalling gaggles near a narrow start line by distributing aircraft over a broader geographical area25.

To optimize safety and fair play, start gates often utilize Pilot Event (PEV) start procedures25. A pilot triggers a PEV start by pressing the event button on their flight recorder, which logs a Pilot Event Marker (PEM) within the .IGC trace15. The start gate opens for that pilot only after a specified "wait time" (typically 5 to 10 minutes) and remains open for a "start window" (typically 5 to 10 minutes)25. The start window is expressed mathematically as:  
![][image2]  
![][image3]  
In a Cylinder Start scenario, the task clock and the credited start coordinates are established at the exact location of the pilot's latest PEV activated while inside the cylinder25. If a pilot triggers a subsequent PEV inside the cylinder, the previous start is invalidated, and a mandatory 10-minute separation interval is initiated25.  
If no PEV is logged within the cylinder, a fallback start is recorded when the glider exits the cylinder, which incurs a severe rule-based penalty25. Additionally, start limits may dictate a maximum ground speed and a maximum loss of height parameter to prevent high-speed diving starts25.

### **Turnpoint Geometries and Observation Zones**

Once the start is completed, the software validates sequential turnpoint OZs2:

* **FAI 90-Degree Sector:** A quadrant-shaped wedge centered on the waypoint, oriented symmetrically around the inbound and outbound leg bisector2. The sector covers 45 degrees on either side of the bisector, extending to an infinite distance for badge flights, or capped at a specified radius for competitions2.  
* **Cylinder Sector (Barrel):** A 360-degree circle with a 400 m or 500 m radius12. In standard BGA Rated Competitions and Ladder rules, using 500 m barrels simplifies tactical navigation but incurs a distance deduction of 1 km per turnpoint from the final scored distance12.  
* **Assigned Area (AAT) Zones:** Large circular or sector-shaped zones (e.g., 10 km to 30 km radius) that allow pilots to select their own optimal turn coordinates25. The software must constantly recalculate the optimized task distance based on the deepest verified fixes within these zones15.

To balance handicapped distances directly, the software can support Assigned Distance Tasks (ADTs)17. Unlike legacy Distance Handicapped Tasks (DHTs) that scale turnpoint barrels in the pilot's flight computer—often causing scoring anomalies when pilots land out—the ADT adjusts the task geometry within SeeYou17. This ensures that exact leg bearings and wind adjustments can be processed using real flight traces17.

| Turnpoint Geometry | Target Radius | Angular Span | Typical Application | Distance Impact |
| :---- | :---- | :---- | :---- | :---- |
| **Start Line** | 500 m2 | 180° (Perpendicular Line)2 | Standard Racing Tasks14 | No deduction |
| **Start Cylinder** | **![][image4]** \[cite: 25\] | 360°25 | Grand Prix, Gaggle Mitigation25 | Variable coordinates25 |
| **Standard Cylinder** | 400 m / 500 m12 | 360°22 | UK Rated / Club Comps21 | \-1 km per point (BGA)12 |
| **FAI Sector** | Infinite / 20 km2 | 90° (Symmetrical Bisector)2 | Badges, World Championships1 | No deduction |
| **Finish Ring** | 3,000 m31 | 360°22 | Safety Finish Boundaries31 | No deduction |

### **Finish Point Geometries and Safety Altitudes**

The completion of the task is determined by crossing either a Finish Line (similar in size to a start line) or a circular Finish Ring2.

* **Finish Ring:** Centered on the home airfield's reference point, this ring typically has a 3 km radius31. It is designed to prioritize safety; completing the high-speed task run 3 km away from the field allows pilots to decelerate and join the active landing circuit safely, rather than executing low-level, high-speed finishes directly over crowded runways31.  
* **Safety Altitudes:** Finish rings specify a minimum crossing altitude (e.g., 1,500 ft or 1,000 ft AAL)31. Under 2025 BGA Rated Rules, finishing below the specified ring altitude incurs a penalty that is deducted from speed points only, rather than invalidating the entire flight5.  
* **Continuous Descent Protocol:** To manage landing safety at busy regional contests, pilots must fly their final glide according to the "Continuous Descent/Level-principle"21. This prohibits sudden, abrupt pull-ups near the airfield boundary, and violations result in escalating point penalties21.

## **Avionics Syntax and Serialization Formats for Software Application Design**

To enable software applications to write valid electronic task declarations, developers must implement two main syntax standards: the IGC C-record block and the SeeYou .CUP task configuration9.

### **IGC C-Record Declaration Syntax**

The C-record block contains the official task declaration within an .IGC file33. It is placed in the file header, after the initial A (manufacturer ID) and H (header information) lines, but before any B (track point) records9.  
The block begins with a Master Task Line that outlines the parameters of the flight33:  
C DDMMYY HHMMSS DDMMYY XXXX NN TEXT\_DESCRIPTION  
The fields are defined as follows:

* C (Char 1): Record type identifier33.  
* DDMMYY HHMMSS (Char 2-13): The exact UTC date and time when the declaration was logged33.  
* DDMMYY (Char 14-19): The intended date of the flight33.  
* XXXX (Char 20-23): The task identification number (e.g., 0001 for the first task of the day)33.  
* NN (Char 24-25): The number of intermediate turnpoints, excluding the start and finish points33.  
* TEXT\_DESCRIPTION (Char 26+): An ASCII-only text description of the task33.

Subsequent lines define the geographical sequence of the task33. Coordinates must be written in Degrees, Minutes, and Decimal Minutes (DMD), with the decimal point omitted and its position implied by the formatting35:

* **Latitude (8 characters):** DDMMMMMN (Degrees: 2 chars, Minutes: 2 chars, Decimal Minutes: 3 chars, Hemisphere: N or S)35.  
* **Longitude (9 characters):** DDDMMMMME (Degrees: 3 chars, Minutes: 2 chars, Decimal Minutes: 3 chars, Hemisphere: E or W)35.

The sequential lines in the C-record block are ordered as follows:

> 1. **Takeoff Location:** (Optional) Written as a C-record, typically representing the home airfield33.  
> 2. **Start Point:** The geographical coordinate of the start line or cylinder center2.  
> 3. **Turnpoints (1 to N):** Sequential lines for each intermediate turnpoint2.  
> 4. **Finish Point:** The coordinate of the finish line or ring center2.  
> 5. **Landing Location:** (Optional) Typically matching the takeoff coordinate33.

#### **Example IGC C-Record Code Block (Aston Down 300km Triangle)**

C160825083000160825000102Aston Down 300k C5142512N00207831WAston Down Club C5142512N00207831WAston Down Start C5205120N00145200WTP1 Edgehill C5104320N00140200WTP2 Salisbury C5142512N00207831WAston Down Finish C5142512N00207831WAston Down Club (Citations must not reside within code blocks; the above coordinates are formatted using standard IGC DMD syntax33).

### **SeeYou CUP File Format Standard**

The SeeYou .CUP format is a flexible, comma-separated configuration format that contains both a waypoint database and defined task topologies within a single file30. The file is split into two sections by a case-sensitive separator line30:  
\-----Related Tasks-----  
The Waypoints section lists discrete points using CP1252 (Windows-1252) or UTF-8 character encoding30. Commas must be wrapped inside double quotes to protect field parsing30.  
"Name","Code","Country",Latitude,Longitude,Elevation,Style,RwDir,RwLen,RwWidth,Freq,"Description"  
The fields are defined as follows:

* **Name / Code / Country:** Identification metadata30.  
* **Latitude / Longitude:** Expressed in degrees and decimal minutes (DDMM.MMMN / DDDMM.MMME)30.  
* **Elevation:** Value with an appended unit (m or ft, e.g., 154.2m)30.  
* **Style:** Integer code (e.g., 1 for turnpoint, 2 for grass airfield, 5 for paved runway)30.  
* **RwDir / RwLen / RwWidth:** Runway characteristics for airfields30.  
* **Freq:** Radio frequency represented as a decimal string30.  
* **Description:** Double-quoted notes30.

The Tasks section, placed after the separator line, contains task definitions30. Each task is configured over sequential rows, starting with a Task Line that lists the waypoint sequence38:  
"300km Triangle","Aston Down Start","TP1 Edgehill","TP2 Salisbury","Aston Down Finish"  
This is immediately followed by a Task Options Line40: Options,NoStart=08:00:00,TaskTime=02:30:00,WpDis=False,NearDis=0.5km,NearAlt=300m,BeforePts=1,AfterPts=1,Bonus=0  
Where:

* NoStart / TaskTime: Standard temporal constraints30.  
* WpDis: True forces calculations directly between waypoints; False uses the deepest logged GPS fixes30.  
* BeforePts / AfterPts: Identifies the number of mandatory start and finish points (e.g., 1 designates a standard line/ring finish)30.  
* Bonus: Points awarded for crossing the finish line30.

Finally, individual Observation Zone lines are defined for each waypoint40: ObsZone=0,Style=2,R1=500m,A1=180,Line=1 ObsZone=1,Style=1,R1=400m,A1=360 ObsZone=2,Style=1,R1=400m,A1=360 ObsZone=3,Style=3,R1=3000m,A1=180,Line=1  
Here, Style configures the orientation type: 0 for absolute angle directions, 1 for symmetrical bisectors, 2 toward the next point, 3 toward the previous point, and 4 toward the start point30. The Line=1 parameter converts the circular radius R1 into a flat crossing line30.

### **LXNAV Dataport Protocol (v1.05) Syntax**

For developers targeting hardware integration, task declarations can be written directly to high-end avionics (e.g., LXNAV S80, S100, LX8000, or LX9000 systems) via serial or Bluetooth interfaces using the LXNAV Dataport Protocol27. System task definitions are declared using specialized $LLXVOZ and $LLXVTSK sentences27:  
$LLXVTSK,NoStart,TaskTime,WpDis,NearDis,NearAlt  
This sentence configures global task options, including start gate timings and validation tolerances27. It is followed by sequential $LLXVOZ lines for each task waypoint27:  
$LLXVOZ,WpIndex,Style,R1,A1,R2,A2,A12,Line,Reduce,MaxAlt,AATFlag  
Where:

* WpIndex / Style: The task waypoint index and orientation style27.  
* R1 / A1 / R2 / A2 / A12: Radii and angle sweeps defining keyholes or sectors27.  
* Line (Boolean): Designates line-crossing logic27.  
* Reduce (Boolean): Toggles sector reduction calculations for handicapped distance indexing27.  
* MaxAlt: Maximum allowable entry altitude27.  
* AATFlag (Boolean): Explicitly designates whether the point represents an Assigned Area sector27.

Implementing these protocols enables software applications to configure modern gliding computers programmatically, ensuring that task shapes, safety ring coordinates, and AAT sectors match the developer's system design27.

## **Platform-Specific Implementation, Verification, and Field Integration Guidelines**

When implementing task declaration features within mobile software architectures, developers must integrate their systems with existing aviation applications and verify data integrity11.

### **XCSoar Data Directory Architecture and Task Schemas**

XCSoar, an open-source tactical glide computer, runs on Android, Linux, and Windows environments, maintaining a specific file structure43.

\[XCSoarData Directory\]  
  |-- xcsoar-checklist.txt  \----\> Interactive checklist configuration \[cite: 34, 46\]  
  |-- default.prf           \----\> Active pilot/aircraft profiles \[cite: 34\]  
  |-- airspace.txt          \----\> Airspace boundaries in OpenAir format \[cite: 44, 47\]  
  |-- \[logs\]  
  |     \+-- \*.igc           \----\> Flight tracks with validation signatures \[cite: 11, 34\]  
  |-- \[tasks\]  
        \+-- \*.tsk           \----\> XCSoar XML task declarations \[cite: 34, 48\]

XCSoar stores planned flight paths natively as XML-formatted .tsk files34. However, it also natively imports and parses SeeYou .CUP task configurations, making .CUP the preferred standard for cross-platform task sharing34.

### **Hardware vs. Online Task Declarations**

To claim official flights, pilots must declare their tasks electronically8. In modern competition scoring, two declaration methods are valid, but they are governed by strict priority rules13:

* **Hardware Declarations (GNSS Flight Recorders):** The task is written directly to the memory of an IGC-approved secure flight recorder prior to takeoff2. This writes the task to the IGC file's C-record, making it the primary legal declaration for badges and world records2.  
* **Online Declarations (e.g., WeGlide / DAGR Platforms):** Pilots can declare a task online via authorized national platforms before takeoff13. Under WeGlide and DAEC rules, if an online declaration exists, any hardware task declaration stored within the flight recorder's C-record is void13. This online approach provides flexibility for pilots using non-IGC-approved equipment or mobile phones9.

For closed-course tasks, both declaration methods require that the start and finish coordinates are identical2.  
Online platforms also validate complex decentralized tasks, such as the Quadrilateral Task, which requires two distinct, non-overlapping triangular courses that share exactly one identical leg, yielding a ![][image5] bonus if minimum leg ratios are satisfied13.

               \* \[Common Apex 1\]  
              / \\  
             /   \\  
            /     \\  
           /       \\  
  \[Left\]  /         \\ \[Right\]  
 Triangle/           \\Triangle  
        /             \\  
       /               \\  
      \*-----------------\*  
\[Common Base Left\]  \[Common Base Right\]  
      \\               /  
       \\             /  
        \\           /  
         \\         /  
          \\       /  
           \\     /  
            \\   /  
             \\ /  
              \* \[Common Apex 2\]

### **Cryptographic Security (The G-Record Layer)**

The integrity of .IGC files is protected by a cryptographic signature block known as the G-record, which is written at the end of the file13.  
G0002A3F9D107B4...  
The flight recorder computes this signature over all preceding lines in the file, including the task definition header and each sequential GPS fix33. If a pilot or a third-party application modifies a single character—such as altering the coordinates in a C-record to correct a missed turnpoint—the security checksum fails validation11.  
To prevent validation failures, any application designed to generate .IGC declarations must write them *before* the flight begins8. If an application writes task information post-flight, it must strip the G-record or mark the file as unvalidated, rendering it ineligible for official contest points or FAI badges2.  
Furthermore, modern soaring rules mandate specific logging standards for gliders equipped with auxiliary propulsion, such as Front Electric Sustainers (FES) or pop-up turbo engines2. Flight recorders in these aircraft must log Engine Noise Levels (ENL) or utilize dedicated engine sensors to generate secondary trace files5. This data proves programmatically that the engine was not used during the competitive task performance5.

## **Conclusion**

Developing software for competitive gliding in the UK and Europe requires a detailed understanding of both flight geometries and complex data protocols. To deliver a professional-grade application, developers must support diverse task topologies—such as standard FAI sectors, cylinder starts, and large finish rings—while ensuring precise distance calculations using the WGS 84 ellipsoid datum2.  
By implementing robust parsing engines for IGC C-records and SeeYou .CUP configurations, developers can build tools that seamlessly bridge the gap between planning software and aircraft avionics30. Integrating these technical standards ensures that task declarations are written correctly before takeoff, preserving cryptographic file integrity and empowering pilots to validate their flights for national ladders, grand prix racing, and FAI badges2.

#### **Works cited**

> 1. 39th FAI WORLD GLIDING CHAMPIONSHIPS \- WGC 2025, [https://www.wgc2025.cz/wp-content/uploads/2025/02/LocalProcedures\_WGC2025\_v1.000.pdf](https://www.wgc2025.cz/wp-content/uploads/2025/02/LocalProcedures_WGC2025_v1.000.pdf)  
> 2. FAI-PERFORMANCES FOR BADGES AND RECORDS Sporting Code 3, 2021 Edition \- The Soaring Society of South Africa, [https://sssa.org.za/wp-content/uploads/2021/12/FAI-Badge-guide-Dec-21.pdf](https://sssa.org.za/wp-content/uploads/2021/12/FAI-Badge-guide-Dec-21.pdf)  
> 3. FÉDÉRATION AÉRONAUTIQUE INTERNATIONALE INTERNATIONAL GLIDING COMMISSION FAI AIRCRAFT CLASSES D AND DM GLIDERS AND MOTOR GLIDE, [https://www.gliding.cz/sk/Pla3BE.pdf](https://www.gliding.cz/sk/Pla3BE.pdf)  
> 4. Local Procedures 2025 \- Cotswold Competitions, [https://cotswoldcomps.co.uk/wp-content/uploads/2025/07/Local-Procedures-2025.pdf](https://cotswoldcomps.co.uk/wp-content/uploads/2025/07/Local-Procedures-2025.pdf)  
> 5. RULES FOR RATED COMPETITIONS 2025 Version 1.3 © British Gliding Association, 2025, [https://t2d.zweven.nl/wp-content/uploads/2025/04/2025-Rules-for-Rated-Competition.pdf](https://t2d.zweven.nl/wp-content/uploads/2025/04/2025-Rules-for-Rated-Competition.pdf)  
> 6. Badges and Certificates \- Pilot & Club Info \- British Gliding Association, [https://members.gliding.co.uk/pilotinformation/badges-certificates-and-claims/](https://members.gliding.co.uk/pilotinformation/badges-certificates-and-claims/)  
> 7. Competitions and Awards \- Pilot & Club Info \- British Gliding Association, [https://members.gliding.co.uk/competitions/](https://members.gliding.co.uk/competitions/)  
> 8. Cross-country (XC) task \- Naviter Knowledge base, [https://kb.naviter.com/en/kb/fly-cross-country-task-xc-task/](https://kb.naviter.com/en/kb/fly-cross-country-task-xc-task/)  
> 9. View topic \- Which flight instruments write C records \- new \- Paragliding Forum, [https://www.paraglidingforum.com/viewtopic.php?t=70580](https://www.paraglidingforum.com/viewtopic.php?t=70580)  
> 10. BGA Competition Scoring Guide 2019 \- Pilot & Club Info, [https://members.gliding.co.uk/library/information-for-organisers/bga-competition-scoring-guide-2019/?exact=no\&exact=yes\&postsperpage=10\&librarysearch=yes\&bgasearch\_parentcat=Any%20category\&bgasearch\_subcategory=0\&bgasearch\_type=Any%20type\&libreturn=1\&pagenum=20](https://members.gliding.co.uk/library/information-for-organisers/bga-competition-scoring-guide-2019/?exact=no&exact=yes&postsperpage=10&librarysearch=yes&bgasearch_parentcat=Any+category&bgasearch_subcategory=0&bgasearch_type=Any+type&libreturn=1&pagenum=20)  
> 11. Faq:IGC & OLC \- Xcsoar Wiki \- Fandom, [https://xcsoar.fandom.com/wiki/Faq:IGC\_%26\_OLC](https://xcsoar.fandom.com/wiki/Faq:IGC_%26_OLC)  
> 12. National Ladder Rules, [https://bgaladder.net/FileStore/PDF/RULES.pdf](https://bgaladder.net/FileStore/PDF/RULES.pdf)  
> 13. DAGR \- WeGlide Docs, [https://docs.weglide.org/contests/national/ssa\_dagr.html](https://docs.weglide.org/contests/national/ssa_dagr.html)  
> 14. Alternative Scoring \- Gliding.cz :-), [https://www.gliding.cz/sk/Pla3alte.pdf](https://www.gliding.cz/sk/Pla3alte.pdf)  
> 15. naviter/seeyou\_competition\_scripts: SeeYou Competition \- scoring scripts \- GitHub, [https://github.com/naviter/seeyou\_competition\_scripts](https://github.com/naviter/seeyou_competition_scripts)  
> 16. 2025 Club Class Nationals 26th July – 3rd August 2025 LONDON GLIDING CLUB INFORMATION & LOCAL RULES \- Soaring Spot, [https://www.soaringspot.com/uploads/049/4951/files/2025\_Club\_Class\_Nationals\_-\_Local\_Rules\_final\_V\_1.0.pdf](https://www.soaringspot.com/uploads/049/4951/files/2025_Club_Class_Nationals_-_Local_Rules_final_V_1.0.pdf)  
> 17. The Assigned Distance Task \- AWS, [https://bga-sg-uploads.s3.amazonaws.com/uploads/2017/03/AssignedDistanceTask.pdf](https://bga-sg-uploads.s3.amazonaws.com/uploads/2017/03/AssignedDistanceTask.pdf)  
> 18. Ladder Rules, [https://bgaladder.co.uk/Rules.asp](https://bgaladder.co.uk/Rules.asp)  
> 19. Gliding Badges and Diplomas Requirements BGA Jan 15 \- Saltby XC, [https://saltbyxc.weebly.com/uploads/8/6/4/6/8646301/1430311877\_glidingbadgesanddiplomas.pdf](https://saltbyxc.weebly.com/uploads/8/6/4/6/8646301/1430311877_glidingbadgesanddiplomas.pdf)  
> 20. Local procedures for Uppsala Masters 2026 and Swedish Nationals in Classes \- Soaring Spot, [https://www.soaringspot.com/uploads/052/5228/files/Uppsala\_Masters\_2026\_LP\_rev\_D.pdf](https://www.soaringspot.com/uploads/052/5228/files/Uppsala_Masters_2026_LP_rev_D.pdf)  
> 21. Kempencup 2025 \- Koninklijke Kempische Aeroclub, [https://www.kac.be/kempencup/rules.php](https://www.kac.be/kempencup/rules.php)  
> 22. IGC \- myGlidingClub, [https://myglidingclub.co.za/api/igc/igc.php](https://myglidingclub.co.za/api/igc/igc.php)  
> 23. SeeYou Competition \- Naviter.com, [http://download.naviter.com/docs/cucompetition.pdf](http://download.naviter.com/docs/cucompetition.pdf)  
> 24. Task \- Naviter Knowledge base, [https://legacy-kb.naviter.com/en/kb/task/](https://legacy-kb.naviter.com/en/kb/task/)  
> 25. Feature: Polish Start — declare task start inside start cylinder (PEV) · Issue \#2389 \- GitHub, [https://github.com/XCSoar/XCSoar/issues/2389](https://github.com/XCSoar/XCSoar/issues/2389)  
> 26. Managing flying risk \- flying in gliding competitions \- Pilot & Club Info, [https://members.gliding.co.uk/safety/managing-flying-risk-index/flying-in-gliding-competitions/](https://members.gliding.co.uk/safety/managing-flying-risk-index/flying-in-gliding-competitions/)  
> 27. LXNav S8/80/10/100 varios: Task declaration start finish/point types incorrect · Issue \#1737, [https://github.com/XCSoar/XCSoar/issues/1737](https://github.com/XCSoar/XCSoar/issues/1737)  
> 28. View topic \- Android Apps: XC Guide & PG Race \- new \- Paragliding Forum, [https://www.paraglidingforum.com/viewtopic.php?p=p659692](https://www.paraglidingforum.com/viewtopic.php?p=p659692)  
> 29. XCSoar Soaring Computer AAT Task Study, Part III \- Paynter's Palace, [https://www.fpaynter.com/2024/01/xcsoar-soaring-computer-aat-task-study-part-iii/](https://www.fpaynter.com/2024/01/xcsoar-soaring-computer-aat-task-study-part-iii/)  
> 30. SeeYou Waypoint file format description \- Naviter.com, [http://download.naviter.com/docs/cup\_format.pdf](http://download.naviter.com/docs/cup_format.pdf)  
> 31. Accident Aircraft Type and Registration: 1\) Discus B, G-DJMD 2\) Standard Cirrus, G-DCTB No & Type of Engines \- GOV.UK, [https://assets.publishing.service.gov.uk/media/68ff83f1a50917eae8b48378/Discus\_B\_G-DJMD\_Standard\_Cirrus\_G-DCTB\_12-25.pdf](https://assets.publishing.service.gov.uk/media/68ff83f1a50917eae8b48378/Discus_B_G-DJMD_Standard_Cirrus_G-DCTB_12-25.pdf)  
> 32. Standard, 15m and Open Class Nationals 2025 Local Procedures \- Soaring Spot, [https://www.soaringspot.com/uploads/050/5045/files/Approved\_BGA\_Lasham\_2025\_Standard\_15m\_Open\_Local\_Rules\_01.pdf](https://www.soaringspot.com/uploads/050/5045/files/Approved_BGA_Lasham_2025_Standard_15m_Open_Local_Rules_01.pdf)  
> 33. IGC FILE FORMAT REFERENCE AND DEVELOPERS' GUIDE \- Ian Forster-Lewis, [https://xp-soaring.github.io/igc\_file\_format/igc\_format\_2008.html](https://xp-soaring.github.io/igc_file_format/igc_format_2008.html)  
> 34. XCSoar-manual.pdf, [https://download.xcsoar.org/releases/7.43/XCSoar-manual.pdf](https://download.xcsoar.org/releases/7.43/XCSoar-manual.pdf)  
> 35. IGC Flight Verification Unit (FVU) Data File Standard, [https://www.gliding.ch/images/news/lx20/fichiers\_igc.htm](https://www.gliding.ch/images/news/lx20/fichiers_igc.htm)  
> 36. GPS Triangle Regulations for Sport Class-Gliders, [https://gps-triangle.net/wp-content/uploads/2020/03/regulations\_sport\_en\_V1.5.pdf](https://gps-triangle.net/wp-content/uploads/2020/03/regulations_sport_en_V1.5.pdf)  
> 37. gpsbabel/igc.cc at master \- GitHub, [https://github.com/GPSBabel/gpsbabel/blob/master/igc.cc](https://github.com/GPSBabel/gpsbabel/blob/master/igc.cc)  
> 38. SeeYou CUP file format description \- Naviter.com, [https://downloads.naviter.com/docs/SeeYou\_CUP\_file\_format.pdf](https://downloads.naviter.com/docs/SeeYou_CUP_file_format.pdf)  
> 39. CUP File Format Implementation Analysis \- Compliance Issues \#2031 \- GitHub, [https://github.com/XCSoar/XCSoar/issues/2031](https://github.com/XCSoar/XCSoar/issues/2031)  
> 40. SeeYou CUP file format description \- Naviter.com, [http://download.naviter.com/docs/CUP-file-format-description.pdf](http://download.naviter.com/docs/CUP-file-format-description.pdf)  
> 41. XCSoar in a Flash, [https://download.xcsoar.org/releases/7.21/XCSoar-in-a-flash.pdf](https://download.xcsoar.org/releases/7.21/XCSoar-in-a-flash.pdf)  
> 42. USER MANUAL \- LX90xx LX80xx \- LXNav, [https://gliding.lxnav.com/wp-content/uploads/manuals/lx90xx-80xxUserManualEnglishVer900rev57.pdf](https://gliding.lxnav.com/wp-content/uploads/manuals/lx90xx-80xxUserManualEnglishVer900rev57.pdf)  
> 43. XCSoar in a Flash, [https://download.xcsoar.org/releases/7.41/XCSoar-in-a-flash.pdf](https://download.xcsoar.org/releases/7.41/XCSoar-in-a-flash.pdf)  
> 44. View topic \- Valid and Invalid .IGC files? \- new \- Paragliding Forum, [https://www.paraglidingforum.com/viewtopic.php?t=2640](https://www.paraglidingforum.com/viewtopic.php?t=2640)  
> 45. XCSoar Configuration Update \- Geelong Gliding Club, [https://www.ggc.org.au/documents-and-forms/operations/coaching?download=83:xcsoar-introduction](https://www.ggc.org.au/documents-and-forms/operations/coaching?download=83:xcsoar-introduction)  
> 46. Checklists — XCSoar 7.45 documentation \- Read the Docs, [https://xcsoar.readthedocs.io/en/latest/checklist.html](https://xcsoar.readthedocs.io/en/latest/checklist.html)  
> 47. What is it? How to open a TSK file? \- FILExt, [https://filext.com/file-extension/TSK](https://filext.com/file-extension/TSK)  
> 48. Files, links and external websites commonly used by Booker Cross Country Glider Pilots., [https://bookergliding.co.uk/cross-country-information](https://bookergliding.co.uk/cross-country-information)  
> 49. IGC File Format homepage, [https://xp-soaring.github.io/igc\_file\_format/index.html](https://xp-soaring.github.io/igc_file_format/index.html)  
> 50. VINTAGE EASTER RALLY \- Gliding Australia Magazine, [https://magazine.glidingaustralia.org/mag/GlidingAustralia-Issue-6.pdf](https://magazine.glidingaustralia.org/mag/GlidingAustralia-Issue-6.pdf)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAABqklEQVR4Xu2VvytHURjGXyU/UqIsZqVkUfwHMkmyGKxSfkTEpCwmxcBgYlQGm2xiMzBRIjIhEROFRDxP51ze7/u953KJDPdTT/e8z3vOPe+5595zRTL+D23WiKHBGr9JPfTor89QU276nWOow5pJjEF91lRMQLfQPdRtcuQVqvHtSugBeoFGoRZowfe59H0SWYaexA2g+nPT7xxA6yreh7ZUTDg+FFf7K59oakKFlUv+pIRehW9X+Vhj43FJuYURocJ2JX8SQm/RxBodF8oXtzCOUGHRNlusz1eiy7eboR6T+zY/LSzylqAb5U1C7SpODW86YE2JL4CEfE0RdKHiOnFf9abyPoWTDFpTwgWEfA3Pswj9EZVBhyqXCAcNWVPCBYT8iCmoVcWn0KqKT1Q7EU4ybE1wJ/EF0AutugQ6Nx77z6t4VrUT4cARa4JOCRfWaE0PT3yLLWxOtYNEB+SMTXiY61XxtPfi4D14XFi2oTUVJ27lCnQt7rGf+euV5J87peIK2YH2xP1aCnJ6OLiFoQmL5WMxfPn5W/szjqxhqBW36A2byMjIyEjJGwIEdzOptpE5AAAAAElFTkSuQmCC>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA3CAYAAACxQxY4AAADRklEQVR4Xu3dzattYxgA8JeUr3wkHwNxC3EHopDEPyAigzu5USQGhoo7M1TkZmKsTBiZEFKG8lEyEBMG7r0DMZDPkm/e56712u9+9rrnnC13n72P36+e1vs879pnv2eNntbXLgUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1slf28Tps13Xyo1lca19/DHbda3kdeYAAJhzSplvEr6t8XGXv9SN180XNS7t8tzsvJbydfFbN441P9flR7oxAMBxx1IeDcQFXf5AN14376Y8N2y3pPxkez0XJlyR8rzmF1IOAFDuTHluIPL8unq0LK591XbSsD2c8rzmR1IOADDnprLYQKxCXAbcKi6a7XpCse7DubhiO2nYeo+V3TneAMAG+6HGB7m4AU4ri41Pa4Y+K8M9Ym3+1hq/jvmLNd7v5j4dxwfH/I0aP47jKdHg9vHORG0r8V3P5OIS9te4PRcBgL0tGohzc3EDvFkWG7YQtUMpD6/W+L2r39ON+79zSTfeiWXPsE2t+d96KxcAgL3pRA3EtTXuGsdX1rijDE+XHvhnj8ETZXgFSMzdPda2O8sUftkmLpvtOinWPbX2qD2e8tA3bG+P2yaeim0PBnzYT+zAf9GwnVPj4m57YY2zx7mby/wxv77Mjm/8rcu7OQBgD4omZaqBeLkbfzdu/+xq7TOvjNv3Uj2at6vG8ckS3/V5Lpah/mWNT2oc7erRsMX/8FRZbNhCW/tDc9XtLdOw3Vemj3ec1bt63J5Rhsu9rSmL15iE/nNPTtQAgP+ZvhFo459T7bYyPE161hit3qz69RpNrOHpXCzzZ9ge7CdG8bl2VmsZyzRsW4nvj/sJf6rxdVePhvnecb7RsAEA5flu3JqHvmH7ZtxOvc+tiRv9d0Os4dlcLEPD1v8KwkfdOMRlx91sgL6vcWaNr8rsPrrzatw/jmNtrTnUsAEAx8V9aXEvVdMatn1dLVyT8k12fi6sUFxGnnJq2fpnwuISKgBAua4MZ3NuyBMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALBp/gYtp60wJCTuOwAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA3CAYAAACxQxY4AAAETUlEQVR4Xu3cS6h9UxgA8OX9fgtRhDwjRFGSgWQgoigp+mfAQFImHgMlyoCUJAMRySMTjxQZmGHgMWBgKIkUIgMhYn2dtTrrrrvPPefe7j13/93fr77WWt8595x19z21vrv2PjslAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJjlwhz/rhH/TJ86Ov1c+9hv+tTR2N2Odz+/PgCAJfguxwmlv2davQi/043HYo+0cq6/5PiyGb/S9Mdkdzrep+e4vxnHXJ/qxgDAEnzU9N9Mq3d4LunGY/FNN47i4chmvKvpL8PHfWKG/nj3Rc+Yjnc7t6Hi8vduDAAsQSzI1/bJkbq6G/fFRP/4Vvu0Tyxg7KcVz236b6XVc43TuwDAkvUL8jJ8PSe+mD51povS9sy99VmfWEDM+fE+OVJjLy4BYEfYO81fkM9L85+zHX7L8UmXezpN5vpkjs9z3FzyL5f8qzleK/1wV+k/X8ZnlvG7Zdw7IE0KxRpfdeOItSxyvOdZz8/3c+sjTnmuJd7rsT45w145HumTA+5L6/sdAGDHey/H331ywBgX2JjToX0yrZzrrH7rthy3N+PLmv48691hW/R4L+rHPrGJNqO4nGWrXhcA/pdi4Rw6PbdvjnubcbvA3pDjgmZ8fY5Lm/GJOW5sxkP+nBM/TZ8606xFf1aRVvt3lPbw+kCa/VrzrLdgGzrex+Q4JMfROQ4qEYVond+DOU4u/X1yXFf67+f4OU2O91Z4IK0+Lvunyfzi1ikx55h7zDvmenaaXkN4eWn7z8GpOY5NK1/3nBzXlH681sFp8nrxPkfkOCzHUeVxANiRYuHsT4tFsXZn6T9a2rrAtrtDkYvFN2610ebi1Fh4tslvtlPS6mKiinzc6iPa9p5sMY7iZ+jnau7bFdn5NlKw9cc71PePU6zh7dJ+UNrwUGnrc6Mo2sodtnifF/pkmn4G4m8fBVzsxFUflvbWNP0M1WPanr6uv0P7t/i1yz1T2ntKCwA0nusTaXiBrf34pmT7+IElYjHfDkMFWaj5KPZCLQjC3Wmyc3hVk1vEegu2WertQeLbulek6e1JYufyjRznp+l1dm3BFjtsyxY7XnFdY1xDGLf4aHdDa8F2U5P7o7RDn52hXP0n4YkcD6fhohEAyF4q7felrYvpX6WtudOa8fFp8g3Pi8v49eaxZZpXsIXYeYvTc61ZP7eWod2yjVqriIldyxe7XNzgNk4fX1nGyxRziC9g/JAmO21VLdhuaXL1M9N+83fod20Lv6HHAYABZ/SJIu7YX097xunTOCXW3rw2nNWNdweLfhtyq8TOVeiPe72pblzPNRYbvRfbcaWNHboqiue4dq11UmnjGjkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2Fr/AXG/6kc7jEVPAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEMAAAAWCAYAAACbiSE3AAAAnUlEQVR4XmNgGAWjYBSMglFAEXAF4v9AnIUuMZKBNQMkULrRJUYyUAXin0C8DF1iJAMRIH4PxIfQJUYy4ADi+0B8DYiZ0eRGJBAD4g9AvANdYiQBdSD+BcQL0SVGErBjgNQsbegSIwlEMoy2ORhyGSCB4IcuMdJAAxAboQuOglEwCpCBNBB7E4ktoHqGLQA1u82JxJpQPaNgFIwQAAAaYhfSEotEvQAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACYAAAAZCAYAAABdEVzWAAABoUlEQVR4Xu2VvytGYRTHj5IfKRGLIoMSWRT/gUySLAarlN2mLCbFwGAQo9VAShGLDChRIjIhGUzkRyK+p+dczj3vc7uu+5LhfurTe873uT+e933e+1yijP9Dtw08tNrgN2mBz/L5CtvDw5+cwV4bxlEP320ojMI7+AgHzBjD5zVIXQmf4Bschp1wTo65kWMSwSf6JnYM11V/BLdVz9jzdF8jn/yLJmYNPlDuDco9GcNZhdTV0mtsP0I/WMJauARvKfeCB56M4Wze9BrdF1KKJWR8E4taXpu/wH6pO+CgGUvMIqyTOs3EgmyB3HUCxmCP6r9FFdxUfdqJWYrgteqbyT3V+p5e7IXzPTHezwL0Q1QGT9RYiFnYZLJ8Tmwcdqn+Ai6r/lzVIVbhljG4GdfBE3cvmYWzqG9dAq9MxsfPqH5K1bH4foU+T8Zw1mZDgXd8i53YtKpj8U2M4WxI9ROS+Zgkt11YduCK6iOXUrNPbgO8FLneU+Ol5CayCw/JvVoK1HgAL2HUDYvp68vwn59fa3/GqQ0MjeQ22w07kJGRkZGQDwfihIIaWCAzAAAAAElFTkSuQmCC>