"""Fence owner writes against account deletion and numeric ID reuse."""
from app.models.base import SessionLocal
from app.models.user import User, USER_DELETION_ACTIVE
from app.services.rag_document_store import rag_mutation_guard


class StaleRAGAccountError(RuntimeError):
    def __init__(self):
        super().__init__("账号已进入删除流程，上传已取消")


def write_rag_for_account_instance(owner_user_id, owner_auth_subject, write):
    with rag_mutation_guard():
        with SessionLocal() as db:
            with db.begin():
                user = db.query(User).filter(
                    User.id == owner_user_id,
                    User.auth_subject == owner_auth_subject,
                ).with_for_update().first()
                if user is None or not user.is_active or user.deletion_state != USER_DELETION_ACTIVE:
                    raise StaleRAGAccountError()
                return write()
