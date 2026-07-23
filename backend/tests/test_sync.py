import sys
from unittest.mock import MagicMock

# Mock google.cloud and google.cloud.firestore to bypass ADC requirements
test_docs = {}

class MockDoc:
    def __init__(self, exists, data=None):
        self.exists = exists
        self._data = data or {}
    def to_dict(self):
        return self._data

class MockDocRef:
    def __init__(self, doc_id):
        self.doc_id = doc_id
    async def get(self):
        if self.doc_id in test_docs:
            return MockDoc(True, test_docs[self.doc_id])
        return MockDoc(False)
    async def set(self, data):
        test_docs[self.doc_id] = data

class MockCollection:
    def document(self, doc_id):
        return MockDocRef(doc_id)

class MockFirestoreClient:
    def __init__(self, *args, **kwargs):
        pass
    def collection(self, name):
        return MockCollection()

mock_firestore_module = MagicMock()
mock_firestore_module.AsyncClient = MockFirestoreClient
mock_firestore_module.SERVER_TIMESTAMP = "mock_timestamp"

mock_google_cloud = MagicMock()
mock_google_cloud.firestore = mock_firestore_module

sys.modules['google.cloud'] = mock_google_cloud
sys.modules['google.cloud.firestore'] = mock_firestore_module

# Now we can import the app and other components
import pytest
from fastapi.testclient import TestClient
from backend.main import app, generate_cup_task, generate_tsk_task

@pytest.fixture
def client():
    test_docs.clear()
    with TestClient(app) as c:
        yield c

def test_generate_cup_task():
    waypoints = [
        [-1.0322, 51.1856],
        [-1.5000, 52.0000]
    ]
    bga_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-1.0322, 51.1856]},
            "properties": {"code": "LSH", "name": "Lasham Airfield"}
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-1.5000, 52.0000]},
            "properties": {"code": "XYZ", "name": "Test Turnpoint"}
        }
    ]
    
    obs_zones = [
        {"type": "Line", "radius": 5000, "angle": 180},
        {"type": "Sector", "radius": 20000, "angle": 90}
    ]
    
    cup = generate_cup_task(waypoints, bga_features, obs_zones)
    assert "name,code,country,lat,lon" in cup
    assert "__Tasks__" in cup
    assert '"LSH Lasham Airfield"' in cup
    assert '"XYZ Test Turnpoint"' in cup
    assert "ObsZone=0,Style=2,R1=5000m,A1=180,Line=1" in cup
    assert "ObsZone=1,Style=1,R1=20000m,A1=90" in cup

def test_generate_tsk_task():
    waypoints = [
        [-1.0322, 51.1856],
        [-1.5000, 52.0000]
    ]
    bga_features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-1.0322, 51.1856]},
            "properties": {"code": "LSH", "name": "Lasham Airfield"}
        },
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [-1.5000, 52.0000]},
            "properties": {"code": "XYZ", "name": "Test Turnpoint"}
        }
    ]
    
    obs_zones = [
        {"type": "Line", "radius": 5000, "angle": 180},
        {"type": "Sector", "radius": 20000, "angle": 90}
    ]
    
    tsk = generate_tsk_task(waypoints, bga_features, obs_zones)
    assert "<Task type=\"RT\"" in tsk
    assert "latitude=\"51.18560\"" in tsk
    assert "longitude=\"-1.03220\"" in tsk
    assert '<ObservationZone type="Line" radius="5000" />' in tsk
    assert '<ObservationZone type="Sector" radius="20000" angle="90" />' in tsk

def test_api_task_share_lifecycle(client):
    # 1. Share a task
    payload = {
        "waypoints": [
            [-1.0322, 51.1856],
            [-1.5000, 52.0000]
        ],
        "corridor_nm": 15.0,
        "observation_zones": [
            {"type": "Line", "radius": 5000, "angle": 180},
            {"type": "Sector", "radius": 20000, "angle": 90}
        ]
    }
    resp = client.post("/api/task/share", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "share_id" in data
    assert "share_url" in data
    share_id = data["share_id"]
    
    # 2. Get shared task metadata
    resp_get = client.get(f"/api/task/share/{share_id}")
    assert resp_get.status_code == 200
    get_data = resp_get.json()
    assert get_data["share_id"] == share_id
    assert get_data["corridor_nm"] == 15.0
    assert len(get_data["waypoints"]) == 2
    assert get_data["observation_zones"] is not None
    assert get_data["observation_zones"][0]["type"] == "Line"
    assert get_data["observation_zones"][0]["radius"] == 5000
    assert get_data["observation_zones"][1]["type"] == "Sector"
    assert get_data["observation_zones"][1]["radius"] == 20000
    
    # 3. Get CUP download
    resp_cup = client.get(f"/api/task/share/{share_id}/cup")
    assert resp_cup.status_code == 200
    assert "name,code,country,lat,lon" in resp_cup.text
    assert "ObsZone=0,Style=2,R1=5000m,A1=180,Line=1" in resp_cup.text
    assert "ObsZone=1,Style=1,R1=20000m,A1=90" in resp_cup.text
    
    # 4. Get TSK download
    resp_tsk = client.get(f"/api/task/share/{share_id}/tsk")
    assert resp_tsk.status_code == 200
    assert "<Task type=" in resp_tsk.text
    assert '<ObservationZone type="Line" radius="5000" />' in resp_tsk.text
    assert '<ObservationZone type="Sector" radius="20000" angle="90" />' in resp_tsk.text
    
    # 5. Get OpenAir download
    resp_air = client.get(f"/api/task/share/{share_id}/openair")
    assert resp_air.status_code == 200
    assert "OpenAir" in resp_air.text

def test_api_sync_weglide_mock(client):
    payload = {
        "waypoints": [
            [-1.0322, 51.1856],
            [-1.5000, 52.0000]
        ],
        "weglide_api_key": "dummy_key",
        "mock": True
    }
    resp = client.post("/api/sync/weglide", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "Simulated WeGlide Sync Successful" in data["message"]
    assert len(data["logs"]) > 0

def test_api_sync_cloud_drive_mock(client):
    payload = {
        "waypoints": [
            [-1.0322, 51.1856],
            [-1.5000, 52.0000]
        ],
        "corridor_nm": 10.0,
        "provider": "dropbox",
        "access_token": "dummy_token",
        "observation_zones": [
            {"type": "Line", "radius": 5000, "angle": 180},
            {"type": "Sector", "radius": 20000, "angle": 90}
        ],
        "mock": True
    }
    resp = client.post("/api/sync/cloud-drive", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "Simulated Dropbox Sync Successful" in data["message"]
    assert len(data["logs"]) > 0
