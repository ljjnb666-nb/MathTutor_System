"""Application startup helpers."""

from app.core.db_seed import seed_default_data


def initialize_application_data() -> None:
    """Seed required reference data without mutating schema at runtime."""
    seed_default_data()
