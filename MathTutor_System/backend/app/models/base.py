"""
SQLAlchemy base, engine, session, and shared column helpers.
"""
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, Integer, create_engine
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import DATABASE_URL


def utc_now():
    """Return a naive UTC timestamp for compatibility with existing DateTime columns."""
    return datetime.now(UTC).replace(tzinfo=None)


def pk_column():
    return Column(Integer, primary_key=True, autoincrement=True)


def created_at_column():
    return Column(DateTime, default=utc_now, nullable=False)


def updated_at_column():
    return Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)


def json_list_column(*, nullable: bool = False):
    return Column(JSON, default=list, nullable=nullable)


def json_dict_column(*, nullable: bool = False):
    return Column(JSON, default=dict, nullable=nullable)


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)
Base = declarative_base()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
