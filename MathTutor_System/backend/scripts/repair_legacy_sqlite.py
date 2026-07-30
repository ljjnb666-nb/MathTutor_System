"""One-off compatibility fixes for legacy SQLite databases."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text

from app.models.base import engine


def _is_sqlite() -> bool:
    return "sqlite" in str(engine.url)


def _column_names(table_name: str) -> set[str]:
    with engine.connect() as conn:
        info = conn.execute(text(f"SELECT name FROM pragma_table_info('{table_name}')"))
        return {row[0] for row in info.fetchall()}


def _add_column_if_missing(table_name: str, column_name: str, ddl: str) -> None:
    if column_name in _column_names(table_name):
        return
    with engine.connect() as conn:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {ddl}"))
        conn.commit()


def _create_index_if_missing(index_name: str, ddl: str) -> None:
    with engine.connect() as conn:
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {ddl}"))
        conn.commit()


def repair_legacy_sqlite(*, drop_obsolete_mistake_records: bool = False) -> None:
    if not _is_sqlite():
        raise RuntimeError("repair_legacy_sqlite only supports SQLite databases.")

    _add_column_if_missing("questions", "student_id", "student_id INTEGER")
    _create_index_if_missing("ix_questions_student_id", "questions (student_id)")

    _add_column_if_missing("question_bank", "images", "images TEXT DEFAULT '[]'")
    _add_column_if_missing("orders", "period_months", "period_months INTEGER DEFAULT 1 NOT NULL")
    _add_column_if_missing("mistake_records", "next_review_date", "next_review_date DATE")
    _add_column_if_missing("mistake_records", "mastered_at", "mastered_at DATETIME")
    _add_column_if_missing("mistake_records", "options", "options TEXT")
    _create_index_if_missing("ix_mistake_records_next_review_date", "mistake_records (next_review_date)")

    _add_column_if_missing("schedules", "recurrence_type", "recurrence_type VARCHAR(16)")
    _add_column_if_missing("schedules", "recurrence_weekdays", "recurrence_weekdays TEXT")

    _add_column_if_missing("students", "login_code", "login_code VARCHAR(32)")
    _add_column_if_missing("students", "hashed_password", "hashed_password VARCHAR(256)")
    _add_column_if_missing("students", "user_id", "user_id INTEGER")
    _create_index_if_missing("ix_students_login_code", "students (login_code)")
    _create_index_if_missing("ix_students_user_id", "students (user_id)")

    _add_column_if_missing("exams", "graded_at", "graded_at DATETIME")
    _add_column_if_missing("exams", "grade_summary", "grade_summary TEXT")
    _add_column_if_missing("exams", "grade_results", "grade_results TEXT")
    _add_column_if_missing("exams", "assignment_date", "assignment_date DATE")
    _create_index_if_missing("ix_exams_assignment_date", "exams (assignment_date)")

    if drop_obsolete_mistake_records:
        names = _column_names("mistake_records")
        if "status" not in names or "topic" not in names:
            with engine.connect() as conn:
                conn.execute(text("DROP TABLE mistake_records"))
                conn.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair legacy SQLite schema drift outside runtime startup.")
    parser.add_argument(
        "--drop-obsolete-mistake-records",
        action="store_true",
        help="Allow dropping the old mistake_records table when it is incompatible.",
    )
    args = parser.parse_args()
    repair_legacy_sqlite(drop_obsolete_mistake_records=args.drop_obsolete_mistake_records)
    print("Legacy SQLite repair complete.")


if __name__ == "__main__":
    main()
