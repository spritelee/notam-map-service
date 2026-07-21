import logging

logger = logging.getLogger(__name__)

class SkyLinkClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key
        self.base_url = "https://skylink.api.example.com/v1"
        
    async def fetch_active_notams(self, location_code: str = "EGTT") -> list[dict]:
        """
        Fetches active NOTAMs for a specific FIR or location code.
        """
        logger.info(f"Fetching active NOTAMs for {location_code} from SkyLink API")
        
        # STUB: In production, we use httpx.AsyncClient to make the GET request
        # e.g., async with httpx.AsyncClient() as client:
        #           response = await client.get(f"{self.base_url}/notams?location={location_code}")
        
        # Mock response mimicking a raw NOTAM
        return [
            {
                "id": "EGTT/QWVLW/IV/M/W/000/030/5322N00047W021",
                "hazard_category": "TDA",
                "raw_e_text": "FORMATION TRANSIT BY RED ARROWS ACFT ROUTING: 530858N 0003125W RAF WADDINGTON 0935 ...",
                "valid_from": "2026-07-22T09:00:00Z",
                "valid_to": "2026-07-22T10:00:00Z",
                "altitude_lower": "SFC",
                "altitude_upper": "FL100"
            }
        ]
