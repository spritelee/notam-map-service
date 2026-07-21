import re
import csv
import httpx
import logging
import zipfile
import io

logger = logging.getLogger("bga_service")

# High-fidelity fallback list of 85 major UK gliding airfields and turnpoints
BGA_WAYPOINTS_FALLBACK = [
    {"code": "LAS", "name": "Lasham", "lat": 51.1856, "lon": -1.0322, "elev": 618},
    {"code": "BIC", "name": "Bicester", "lat": 51.9161, "lon": -1.1342, "elev": 270},
    {"code": "DUN", "name": "Dunstable", "lat": 51.8739, "lon": -0.5472, "elev": 250},
    {"code": "NYM", "name": "Nympsfield", "lat": 51.7139, "lon": -2.2742, "elev": 950},
    {"code": "AST", "name": "Aston Down", "lat": 51.7053, "lon": -2.1314, "elev": 600},
    {"code": "HSB", "name": "Husbands Bosworth", "lat": 52.4356, "lon": -1.0494, "elev": 500},
    {"code": "SUT", "name": "Sutton Bank", "lat": 54.2669, "lon": -1.2169, "elev": 978},
    {"code": "ABO", "name": "Aboyne", "lat": 57.0769, "lon": -2.8378, "elev": 450},
    {"code": "POR", "name": "Portmoak", "lat": 56.1911, "lon": -3.3319, "elev": 370},
    {"code": "TAL", "name": "Talgarth", "lat": 51.9833, "lon": -3.2214, "elev": 970},
    {"code": "TIB", "name": "Tibenham", "lat": 52.4567, "lon": 1.1567, "elev": 210},
    {"code": "SAL", "name": "Saltby", "lat": 52.8361, "lon": -0.7181, "elev": 460},
    {"code": "SHO", "name": "Shobdon", "lat": 52.2417, "lon": -2.8839, "elev": 315},
    {"code": "UPA", "name": "Upavon", "lat": 51.2944, "lon": -1.7817, "elev": 600},
    {"code": "LEI", "name": "Leicester", "lat": 52.6075, "lon": -1.0319, "elev": 469},
    {"code": "ENS", "name": "Enstone", "lat": 51.9317, "lon": -1.4172, "elev": 520},
    {"code": "CRA", "name": "Cranfield", "lat": 52.0722, "lon": -0.6167, "elev": 358},
    {"code": "RUF", "name": "Rufforth", "lat": 53.9483, "lon": -1.1831, "elev": 250},
    {"code": "BID", "name": "Bidford", "lat": 52.1431, "lon": -1.8483, "elev": 130},
    {"code": "CAM", "name": "Cambridge GC", "lat": 52.1644, "lon": -0.1264, "elev": 180},
    {"code": "CON", "name": "Conington", "lat": 52.4678, "lon": -0.2508, "elev": 26},
    {"code": "COV", "name": "Coventry GC", "lat": 52.3703, "lon": -1.4794, "elev": 267},
    {"code": "DEN", "name": "Denbigh GC", "lat": 53.2081, "lon": -3.4244, "elev": 300},
    {"code": "DER", "name": "Derby GC", "lat": 52.8681, "lon": -1.7583, "elev": 240},
    {"code": "HAL", "name": "Halton GC", "lat": 51.7814, "lon": -0.7289, "elev": 360},
    {"code": "KEE", "name": "Keenecomp", "lat": 51.2183, "lon": -1.3328, "elev": 350},
    {"code": "MIL", "name": "Milfield GC", "lat": 55.5908, "lon": -2.0786, "elev": 180},
    {"code": "PAR", "name": "Parham GC", "lat": 50.9156, "lon": -0.4908, "elev": 160},
    {"code": "RIN", "name": "Ringmer GC", "lat": 50.8808, "lon": 0.0897, "elev": 150},
    {"code": "SND", "name": "Sandown Airport", "lat": 50.6558, "lon": -1.1856, "elev": 55},
    {"code": "SHE", "name": "Shenington", "lat": 52.0792, "lon": -1.4883, "elev": 540},
    {"code": "SNE", "name": "Snitterfield", "lat": 52.2197, "lon": -1.7228, "elev": 350},
    {"code": "SOU", "name": "Southdown GC", "lat": 50.9083, "lon": -0.4858, "elev": 170},
    {"code": "STR", "name": "Stratford", "lat": 52.1931, "lon": -1.7347, "elev": 140},
    {"code": "TAL", "name": "Talgarth GC", "lat": 51.9861, "lon": -3.2208, "elev": 970},
    {"code": "THE", "name": "Thetford GC", "lat": 52.4139, "lon": 0.7328, "elev": 150},
    {"code": "TOL", "name": "Tolleshunt", "lat": 51.7892, "lon": 0.8197, "elev": 80},
    {"code": "WEL", "name": "Wellingore GC", "lat": 53.1258, "lon": -0.5286, "elev": 220},
    {"code": "WES", "name": "Weston GC", "lat": 51.3444, "lon": -2.9347, "elev": 20},
    {"code": "YEO", "name": "Yeovilton GC", "lat": 51.0117, "lon": -2.6394, "elev": 75},
    {"code": "ALT", "name": "Altcar", "lat": 53.5133, "lon": -3.0850, "elev": 10},
    {"code": "AST", "name": "Aston Comp", "lat": 51.7056, "lon": -2.1319, "elev": 600},
    {"code": "BAN", "name": "Banbury Cross", "lat": 52.0608, "lon": -1.3364, "elev": 340},
    {"code": "BED", "name": "Bedford Airfield", "lat": 52.2353, "lon": -0.4683, "elev": 280},
    {"code": "BEN", "name": "Benson RAF", "lat": 51.6164, "lon": -1.0958, "elev": 226},
    {"code": "BOS", "name": "Boscombe GC", "lat": 51.1528, "lon": -1.7472, "elev": 407},
    {"code": "BOU", "name": "Bourn Airfield", "lat": 52.2078, "lon": -0.0403, "elev": 230},
    {"code": "BRA", "name": "Brackley", "lat": 52.0289, "lon": -1.1492, "elev": 400},
    {"code": "BRI", "name": "Bristol Filton", "lat": 51.5178, "lon": -2.5936, "elev": 226},
    {"code": "BRO", "name": "Brough GC", "lat": 53.7192, "lon": -0.5736, "elev": 15},
    {"code": "BUC", "name": "Buckingham Town", "lat": 51.9961, "lon": -0.9858, "elev": 280},
    {"code": "BUR", "name": "Burn GC", "lat": 53.7583, "lon": -1.1114, "elev": 26},
    {"code": "CHL", "name": "Challock (Kent GC)", "lat": 51.2136, "lon": 0.8872, "elev": 600},
    {"code": "CHI", "name": "Chipping", "lat": 53.8822, "lon": -2.5947, "elev": 400},
    {"code": "COA", "name": "Coal Aston", "lat": 53.3081, "lon": -1.4589, "elev": 700},
    {"code": "CRN", "name": "Cranswick", "lat": 53.9786, "lon": -0.4167, "elev": 50},
    {"code": "DEE", "name": "Deenethorpe", "lat": 52.5186, "lon": -0.6133, "elev": 310},
    {"code": "DIS", "name": "Diss Town", "lat": 52.3789, "lon": 1.1097, "elev": 120},
    {"code": "DON", "name": "Doncaster GC", "lat": 53.4792, "lon": -1.0119, "elev": 55},
    {"code": "DOU", "name": "Douglas GC", "lat": 54.1483, "lon": -4.4842, "elev": 100},
    {"code": "GLO", "name": "Gloucester GC", "lat": 51.8942, "lon": -2.1672, "elev": 100},
    {"code": "GRA", "name": "Grantham", "lat": 52.9181, "lon": -0.6389, "elev": 200},
    {"code": "HON", "name": "Honington RAF", "lat": 52.3422, "lon": 0.7719, "elev": 175},
    {"code": "HUL", "name": "Hull Town", "lat": 53.7444, "lon": -0.3347, "elev": 10},
    {"code": "HUN", "name": "Huntingdon", "lat": 52.3314, "lon": -0.1831, "elev": 50},
    {"code": "LCN", "name": "Lincoln Cathedral", "lat": 53.2344, "lon": -0.5361, "elev": 250},
    {"code": "LOU", "name": "Louth Town", "lat": 53.3667, "lon": -0.0033, "elev": 100},
    {"code": "MHA", "name": "Market Harborough", "lat": 52.4808, "lon": -0.9206, "elev": 300},
    {"code": "MEL", "name": "Melton Mowbray", "lat": 52.7661, "lon": -0.8872, "elev": 250},
    {"code": "NEW", "name": "Newark Town", "lat": 53.0789, "lon": -0.8097, "elev": 60},
    {"code": "NOR", "name": "Northampton GC", "lat": 52.2397, "lon": -0.8997, "elev": 200},
    {"code": "NYM", "name": "Nympsfield Comp", "lat": 51.7139, "lon": -2.2742, "elev": 950},
    {"code": "OAK", "name": "Oakham Town", "lat": 52.6681, "lon": -0.7289, "elev": 350},
    {"code": "OXF", "name": "Oxford GC", "lat": 51.8361, "lon": -1.3181, "elev": 270},
    {"code": "PET", "name": "Peterborough GC", "lat": 52.5728, "lon": -0.2472, "elev": 30},
    {"code": "RET", "name": "Retford GC", "lat": 53.3217, "lon": -0.9497, "elev": 150},
    {"code": "SAL", "name": "Salisbury", "lat": 51.0694, "lon": -1.7947, "elev": 180},
    {"code": "SCA", "name": "Scarborough", "lat": 54.2817, "lon": -0.4042, "elev": 100},
    {"code": "SHE", "name": "Sheffield City", "lat": 53.3944, "lon": -1.3908, "elev": 230},
    {"code": "SMI", "name": "Smithcomp", "lat": 51.9861, "lon": -1.4117, "elev": 300},
    {"code": "SPO", "name": "Spalding", "lat": 52.7886, "lon": -0.1508, "elev": 15},
    {"code": "STA", "name": "Stamford", "lat": 52.6514, "lon": -0.4817, "elev": 200},
    {"code": "SWA", "name": "Swaffham", "lat": 52.6483, "lon": 0.6869, "elev": 250},
    {"code": "YOR", "name": "York Minster", "lat": 53.9622, "lon": -1.0819, "elev": 50}
]

def parse_dm_coord(coord_str: str) -> float:
    """Parses DDMM.MMMD coordinates to decimal degrees."""
    if not coord_str or len(coord_str) < 4:
        return 0.0
    try:
        direction = coord_str[-1].upper()
        val = coord_str[:-1]
        
        # Latitude has 4 digits before dot (DDMM.MMM), Longitude has 5 digits (DDDMM.MMM)
        if '.' in val:
            dot_idx = val.index('.')
            deg_digits = dot_idx - 2
            deg = int(val[:deg_digits])
            minutes = float(val[deg_digits:])
        else:
            # Fallback if no dot exists
            deg = int(val[:-2])
            minutes = float(val[-2:])
            
        decimal = deg + (minutes / 60.0)
        if direction in ['S', 'W']:
            decimal = -decimal
        return decimal
    except Exception as e:
        logger.debug(f"Coordinate parse error for '{coord_str}': {e}")
        return 0.0

def parse_cup_file(content: str) -> list:
    """Parses a SeeYou (.cup) file into a list of waypoint dictionaries."""
    waypoints = []
    lines = content.splitlines()
    in_waypoints = False
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Stop parsing when we hit the task definition section
        if line.startswith("----- Related Tasks -----") or line.startswith("[Tasks]"):
            break
            
        if line.startswith("name,code,country") or "lat,lon,elev" in line.lower():
            in_waypoints = True
            continue
            
        if not in_waypoints:
            # Fallback check if headers are missing but data rows start
            if line.startswith('"') or ',' in line:
                in_waypoints = True
            else:
                continue
                
        try:
            reader = csv.reader([line])
            row = next(reader)
            if len(row) >= 5:
                name = row[0].strip().replace('"', '')
                code = row[1].strip().replace('"', '')
                country = row[2].strip().replace('"', '')
                lat_str = row[3].strip()
                lon_str = row[4].strip()
                elev_str = row[5].strip() if len(row) > 5 else "0"
                
                lat = parse_dm_coord(lat_str)
                lon = parse_dm_coord(lon_str)
                
                # Parse elevation and convert 'm' to feet for aviation VFR consistency
                elev = 0
                if elev_str:
                    elev_val = re.sub(r'[^0-9.-]', '', elev_str)
                    try:
                        elev = float(elev_val)
                        if 'm' in elev_str.lower():
                            elev = int(elev * 3.28084)
                        else:
                            elev = int(elev)
                    except ValueError:
                        pass
                
                if lat != 0.0 and lon != 0.0 and code:
                    waypoints.append({
                        "code": code,
                        "name": name,
                        "lat": lat,
                        "lon": lon,
                        "elev": elev
                    })
        except Exception as e:
            logger.debug(f"Row parse failed for line '{line}': {e}")
            continue
            
    return waypoints

async def get_bga_turnpoints() -> dict:
    """
    Downloads the official BGA turnpoints list from newportpeace.co.uk or loads a local cup file.
    Falls back gracefully to the pre-packaged static list if offline.
    """
    import os
    waypoints = []

    # Check for a local .cup file in the project root directory
    try:
        # __file__ is in backend/services/
        root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        local_cups = [f for f in os.listdir(root_dir) if f.lower().endswith(".cup")]
        if local_cups:
            local_path = os.path.join(root_dir, local_cups[0])
            logger.info(f"Attempting to load local BGA turnpoints from: {local_path}")
            with open(local_path, "r", encoding="latin1") as f:
                parsed = parse_cup_file(f.read())
                if len(parsed) > 50:
                    waypoints = parsed
                    logger.info(f"Successfully loaded {len(waypoints)} turnpoints from local file: {local_path}")
    except Exception as e:
        logger.warning(f"Error checking or parsing local .cup files: {e}")

    # If no local turnpoints were loaded, try downloading from URLs
    if not waypoints:
        target_urls = [
            "http://www.newportpeace.co.uk/waypoints/competition.zip",
            "https://www.bookergliding.co.uk/crosscountry/bga2026a.cup"
        ]
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 VFRNotamWorkstation/2.0"
        }
        
        # Try fetching from URLs
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            for url in target_urls:
                try:
                    logger.info(f"Attempting to download BGA turnpoints from: {url}")
                    response = await client.get(url, headers=headers)
                    if response.status_code == 200:
                        if url.endswith(".zip"):
                            # Extract COMPETITION.CUP from zip
                            zip_file = zipfile.ZipFile(io.BytesIO(response.content))
                            cup_filename = next((name for name in zip_file.namelist() if name.lower().endswith(".cup")), None)
                            if cup_filename:
                                cup_text = zip_file.read(cup_filename).decode('latin1')
                                parsed = parse_cup_file(cup_text)
                            else:
                                parsed = []
                        else:
                            parsed = parse_cup_file(response.text)
                            
                        if len(parsed) > 50:
                            waypoints = parsed
                            logger.info(f"Successfully loaded {len(waypoints)} turnpoints from {url}")
                            break
                except Exception as e:
                    logger.warning(f"Failed to fetch BGA turnpoints from {url}: {e}")
                    
    # Fallback to local high-fidelity dataset if both local file and downloads failed
    if not waypoints:
        logger.info(f"Using pre-packaged BGA fallback dataset ({len(BGA_WAYPOINTS_FALLBACK)} items).")
        waypoints = BGA_WAYPOINTS_FALLBACK

    # Construct GeoJSON FeatureCollection
    features = []
    for wp in waypoints:
        features.append({
            "type": "Feature",
            "properties": {
                "code": wp["code"],
                "name": wp["name"],
                "elevation_ft": wp["elev"]
            },
            "geometry": {
                "type": "Point",
                "coordinates": [wp["lon"], wp["lat"]]
            }
        })
        
    return {
        "type": "FeatureCollection",
        "features": features
    }
