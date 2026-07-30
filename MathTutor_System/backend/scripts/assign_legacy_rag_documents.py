"""Explicitly assign ownerless legacy RAG documents to one teacher.

Default mode is dry-run. This script is never imported or executed by app startup.
"""
from __future__ import annotations

import argparse
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models.base import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import rag_document_store as store  # noqa: E402


class LegacyMigrationError(RuntimeError):
    pass


def find_target_user(db, *, username: str | None = None, user_id: int | None = None) -> User:
    if not username and user_id is None:
        raise LegacyMigrationError("Specify --username or --user-id.")
    query = db.query(User)
    user = query.filter(User.id == user_id).first() if user_id is not None else query.filter(User.username == username).first()
    if user is None:
        raise LegacyMigrationError("Target user not found.")
    return user


def ownerless_registry_entries() -> list[dict]:
    return [item for item in store.read_documents_registry() if item.get("owner_user_id") in (None, "", 0)]


def ownerless_chroma_chunks(source: str) -> tuple[list[str], list[dict], list[str]]:
    coll = store.get_collection_only()
    data = coll.get(where={"source": source}, include=["metadatas", "documents"])
    ids = data.get("ids") or []
    metadatas = data.get("metadatas") or []
    docs = data.get("documents") or []
    out_ids, out_meta, out_docs = [], [], []
    for row_id, metadata, doc in zip(ids, metadatas, docs):
        meta = metadata or {}
        if meta.get("owner_user_id") in (None, "", 0):
            out_ids.append(row_id)
            out_meta.append(meta)
            out_docs.append(doc)
    return out_ids, out_meta, out_docs


def assign_legacy_rag_documents(db, *, username: str | None = None, user_id: int | None = None, dry_run: bool = True) -> dict:
    user = find_target_user(db, username=username, user_id=user_id)
    registry_entries = ownerless_registry_entries()
    plan = []
    for item in registry_entries:
        source = (item.get("source") or "").strip()
        ids, metadatas, docs = ownerless_chroma_chunks(source)
        plan.append({"source": source, "registry_entry": item, "chunk_count": len(ids)})
        if dry_run or not ids:
            continue
        document_id = (item.get("document_id") or "").strip() or str(uuid.uuid4())
        created_at = item.get("created_at") or datetime.now(UTC).isoformat()
        new_metadatas = []
        for index, meta in enumerate(metadatas):
            next_meta = dict(meta)
            next_meta.update(
                {
                    "document_id": document_id,
                    "owner_user_id": int(user.id),
                    "source": source,
                    "created_at": created_at,
                    "chunk_index": next_meta.get("chunk_index", index),
                    "knowledge_point": next_meta.get("knowledge_point") or item.get("knowledge_point") or "",
                    "chunk_type": next_meta.get("chunk_type") or item.get("chunk_type") or next_meta.get("type") or "legacy",
                }
            )
            new_metadatas.append(next_meta)
        coll = store.get_collection_only()
        coll.update(ids=ids, metadatas=new_metadatas)
        store.registry_add(
            source,
            len(ids),
            item.get("knowledge_points") or [],
            owner_user_id=user.id,
            document_id=document_id,
            knowledge_point=item.get("knowledge_point") or "",
            chunk_type=item.get("chunk_type") or "legacy",
            created_at=created_at,
        )
    return {"dry_run": dry_run, "target_user_id": user.id, "documents": plan}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username")
    parser.add_argument("--user-id", type=int)
    parser.add_argument("--apply", action="store_true", help="Apply changes. Omit for dry-run.")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        result = assign_legacy_rag_documents(db, username=args.username, user_id=args.user_id, dry_run=not args.apply)
    except LegacyMigrationError as exc:
        print(f"ERROR: {exc}")
        return 2
    finally:
        db.close()
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
