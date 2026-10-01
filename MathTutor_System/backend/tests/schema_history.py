"""Remove descendant student-auth fields when constructing historical schemas."""
from sqlalchemy import inspect, text


def drop_student_auth_subject(connection) -> None:
    inspector = inspect(connection)
    if "students" not in inspector.get_table_names():
        return
    if "auth_subject" in {column["name"] for column in inspector.get_columns("students")}:
        connection.execute(text("DROP INDEX ix_students_auth_subject"))
        connection.execute(text("ALTER TABLE students DROP COLUMN auth_subject"))
