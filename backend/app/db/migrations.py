from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _column_sql(table_name: str, column_name: str) -> str | None:
    if table_name == "documents":
        mapping = {
            "is_deleted": "BOOLEAN NOT NULL DEFAULT FALSE",
            "review_note": "TEXT",
            "approved_at": "TIMESTAMP WITH TIME ZONE",
            "rejected_at": "TIMESTAMP WITH TIME ZONE",
            "deleted_at": "TIMESTAMP WITH TIME ZONE",
        }
        return mapping.get(column_name)
    return None


def migrate_database(engine: Engine) -> None:
    inspector = inspect(engine)

    if "documents" in inspector.get_table_names():
        existing = {column["name"] for column in inspector.get_columns("documents")}
        for column_name in ("is_deleted", "review_note", "approved_at", "rejected_at", "deleted_at"):
            if column_name in existing:
                continue
            column_sql = _column_sql("documents", column_name)
            if not column_sql:
                continue
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TABLE documents ADD COLUMN {column_name} {column_sql}"))

