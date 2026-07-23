from sqlalchemy import Column, String, DateTime, Text, Float
from geoalchemy2 import Geometry
import datetime
from .database import Base

class Notam(Base):
    __tablename__ = "notams"

    id = Column(String, primary_key=True, index=True)
    hazard_type = Column(String, index=True)
    description = Column(Text)
    altitude_limits = Column(String)
    start_time = Column(DateTime, index=True)
    end_time = Column(DateTime, index=True)
    
    # Store the parsed geographical footprint
    # SRID 4326 is standard WGS84 (Longitude, Latitude)
    geom = Column(Geometry(geometry_type='GEOMETRY', srid=4326))


class SharedTask(Base):
    __tablename__ = "shared_tasks"

    id = Column(String, primary_key=True, index=True)
    waypoints = Column(Text)  # JSON-serialized list of [[lng, lat], ...]
    corridor_nm = Column(Float, default=20.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

