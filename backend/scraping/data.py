from models import Base
from config.db import engine

def create_all_tables():
    """
    Create all tables defined in the SQLAlchemy Base metadata.
    Use this script to initialize your database schema.
    """
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)
    print("All tables created.")

if __name__ == "__main__":
    create_all_tables()
