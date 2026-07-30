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


def _new_chunk_payload(item: dict, user: User, source: str, metadatas: list[dict], docs: list[str]) -> tuple[str, list[str], list[dict]]:
    document_id = str(uuid.uuid4())
    created_at = item.get("created_at") or datetime.now(UTC).isoformat()
    new_ids = [f"{document_id}:{index}" for index in range(len(docs))]
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
    return document_id, new_ids, new_metadatas


def _cleanup_new_chunks(coll, ids: list[str]) -> None:
    if not ids:
        return
    try:
        coll.delete(ids=ids)
    except Exception:
        pass


def _owned_document_exists(source: str, owner_user_id: int) -> bool:
    return any(
        (item.get("source") or "").strip() == source and int(item.get("owner_user_id") or -1) == int(owner_user_id)
        for item in store.read_documents_registry()
    )


def _write_migrated_registry_entry(
    *,
    legacy_entry: dict,
    source: str,
    owner_user_id: int,
    document_id: str,
    chunk_count: int,
    created_at: str,
) -> None:
    """Replace only ownerless registry entries for this source with the owned document."""
    source_key = (source or "").strip()
    items = []
    for item in store.read_documents_registry():
        item_source = (item.get("source") or "").strip()
        item_owner = item.get("owner_user_id")
        is_ownerless_source = item_source == source_key and item_owner in (None, "", 0)
        is_same_owned_doc = (
            item_source == source_key
            and int(item_owner or -1) == int(owner_user_id)
            and (item.get("document_id") or "").strip() == document_id
        )
        if is_ownerless_source or is_same_owned_doc:
            continue
        items.append(item)
    items.append(
        {
            "document_id": document_id,
            "owner_user_id": int(owner_user_id),
            "source": source_key,
            "knowledge_point": legacy_entry.get("knowledge_point") or "",
            "chunk_type": legacy_entry.get("chunk_type") or "legacy",
            "created_at": created_at,
            "chunk_count": chunk_count,
            "knowledge_points": legacy_entry.get("knowledge_points") or [],
        }
    )
    store.write_documents_registry(items)


def assign_legacy_rag_documents(db, *, username: str | None = None, user_id: int | None = None, dry_run: bool = True) -> dict:
    user = find_target_user(db, username=username, user_id=user_id)
    registry_entries = ownerless_registry_entries()
    plan = []
    warnings: list[dict] = []
    migrated = 0
    for item in registry_entries:
        source = (item.get("source") or "").strip()
        if _owned_document_exists(source, user.id):
            continue
        legacy_ids, metadatas, docs = ownerless_chroma_chunks(source)
        plan.append({"source": source, "registry_entry": item, "chunk_count": len(legacy_ids)})
        if dry_run or not legacy_ids:
            continue
        coll = store.get_collection_only()
        document_id, new_ids, new_metadatas = _new_chunk_payload(item, user, source, metadatas, docs)
        try:
            coll.add(ids=new_ids, documents=docs, metadatas=new_metadatas)
            verify = coll.get(where={"document_id": document_id}, include=["metadatas"])
            if len(verify.get("ids") or []) != len(legacy_ids):
                raise LegacyMigrationError(f"Copied chunk count mismatch for {source}.")
            _write_migrated_registry_entry(
                legacy_entry=item,
                source=source,
                owner_user_id=user.id,
                document_id=document_id,
                chunk_count=len(new_ids),
                created_at=new_metadatas[0].get("created_at") if new_metadatas else datetime.now(UTC).isoformat(),
            )
        except Exception:
            _cleanup_new_chunks(coll, new_ids)
            raise
        try:
            coll.delete(ids=legacy_ids)
        except Exception as exc:
            warnings.append({"source": source, "legacy_chunk_ids": legacy_ids, "message": f"Legacy cleanup failed: {exc}"})
        migrated += 1
    return {"dry_run": dry_run, "target_user_id": user.id, "documents": plan, "migrated": migrated, "warnings": warnings}


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
