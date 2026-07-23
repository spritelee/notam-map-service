import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

# Fallback to local postgres for testing if no env var is provided
TESTING = os.getenv("TESTING", "false").lower() == "true"

# Fallback to local sqlite if running in Cloud Run or testing, otherwise local postgres
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if os.getenv("K_SERVICE") or TESTING:
        DATABASE_URL = "sqlite+aiosqlite:///notam_db.sqlite"
    else:
        DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/notam_db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

