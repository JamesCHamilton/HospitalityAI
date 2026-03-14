import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load .env file if present for local dev environments
load_dotenv()

# Database URL pulled from environment variable, fallback to local SQLite for dev
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///local_default.sqlite3")

# Create the SQLAlchemy engine
engine = create_engine(DATABASE_URL)

# Create a configured "Session" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """
    Dependency function to get a SQLAlchemy session.
    Use in FastAPI routes with: db = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
