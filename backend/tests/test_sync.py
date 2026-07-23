import pytest
from fastapi.testclient import TestClient
from backend.main import app, generate_cup_task, generate_tsk_task

@pytest.fixture
def client():
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
    
    cup = generate_cup_task(waypoints, bga_features)
    assert "name,code,country,lat,lon" in cup
    assert "__Tasks__" in cup
    assert '"LSH Lasham Airfield"' in cup
    assert '"XYZ Test Turnpoint"' in cup

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
    
    tsk = generate_tsk_task(waypoints, bga_features)
    assert "<Task type=\"RT\"" in tsk
    assert "latitude=\"51.18560\"" in tsk
    assert "longitude=\"-1.03220\"" in tsk

def test_api_task_share_lifecycle(client):
    # 1. Share a task
    payload = {
        "waypoints": [
            [-1.0322, 51.1856],
            [-1.5000, 52.0000]
        ],
        "corridor_nm": 15.0
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
    
    # 3. Get CUP download
    resp_cup = client.get(f"/api/task/share/{share_id}/cup")
    assert resp_cup.status_code == 200
    assert "name,code,country,lat,lon" in resp_cup.text
    
    # 4. Get TSK download
    resp_tsk = client.get(f"/api/task/share/{share_id}/tsk")
    assert resp_tsk.status_code == 200
    assert "<Task type=" in resp_tsk.text
    
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
        "mock": True
    }
    resp = client.post("/api/sync/cloud-drive", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "Simulated Dropbox Sync Successful" in data["message"]
    assert len(data["logs"]) > 0
