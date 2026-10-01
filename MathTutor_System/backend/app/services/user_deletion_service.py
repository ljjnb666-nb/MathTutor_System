"""Recoverable cross-store deletion; the durable barrier survives any later failure."""
from sqlalchemy.orm import Session

from app.models.user import User, USER_DELETION_ACTIVE, USER_DELETION_DELETING
from app.services.rag_document_store import rag_mutation_guard, rag_purge_owner
from app.services.user_admin_service import (
    UserAdminServiceError, delete_user_and_related,
    lock_and_preflight_user_deletion, utc_now,
)


def delete_user_lifecycle(db: Session, user_id: int, current_user_id: int) -> None:
    if user_id == current_user_id:
        raise UserAdminServiceError(400, "不能删除当前登录账号")
    with rag_mutation_guard():
        try:
            user, _ = lock_and_preflight_user_deletion(db, user_id, current_user_id)
            if user.deletion_state not in (USER_DELETION_ACTIVE, USER_DELETION_DELETING):
                raise UserAdminServiceError(409, "用户删除状态异常，请先修复数据")
            # Tighten corrupt deleting rows; never reactivate or replace the timestamp.
            user.deletion_state = USER_DELETION_DELETING
            subject = user.auth_subject
            user.is_active = False
            if user.deletion_started_at is None:
                user.deletion_started_at = utc_now()
            db.commit()
        except Exception:
            db.rollback()
            raise
        try:
            # Reacquire the account-instance row after the independent commit.
            # Hold it through physical purge and final SQL to fence other processes,
            # including another DELETE followed by numeric ID reuse.
            target = db.query(User).filter(
                User.id == user_id, User.auth_subject == subject,
            ).populate_existing().with_for_update().first()
            if target is None:
                raise UserAdminServiceError(404, "用户不存在")
            result = rag_purge_owner(user_id)
            if result.remaining_chunk_count != 0 or result.remaining_registry_count != 0:
                raise RuntimeError("RAG purge did not converge")
        except UserAdminServiceError:
            db.rollback()
            raise
        except Exception as exc:
            db.rollback()
            raise UserAdminServiceError(
                503, "用户删除暂未完成，知识库清理失败，请稍后重试"
            ) from exc
        # The SQL service reacquires locks and reruns the shared preflight.
        delete_user_and_related(db, user_id, current_user_id)
