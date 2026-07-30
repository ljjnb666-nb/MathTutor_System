"""Apply Alembic migrations and seed required reference data."""

from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.core.db_seed import seed_default_data
from app.models import *  # noqa: F403,F401
from app.models.base import Base, engine


def _build_alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return config


def _has_application_tables() -> bool:
    inspector = inspect(engine)
    return bool(inspector.get_table_names())


def main() -> None:
    config = _build_alembic_config()
    if _has_application_tables():
        command.upgrade(config, "head")
    else:
        Base.metadata.create_all(bind=engine)
        command.stamp(config, "head")
    seed_default_data()
    print("Database bootstrap complete.")


if __name__ == "__main__":
    main()
