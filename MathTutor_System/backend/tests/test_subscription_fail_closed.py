"""SEC-02: entitlement checks must fail closed for non-admins."""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.subscription import (
    BROKEN_PLAN_DETAIL,
    INACTIVE_SUBSCRIPTION_DETAIL,
    get_current_subscription,
    require_feature,
    require_plan_capacity,
)
from app.models.base import Base
from app.models.plan import Plan
from app.models.student import Student
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User


def make_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(
        engine,
        tables=[
        User.__table__,
        Plan.__table__,
        Subscription.__table__,
        SubscriptionHistory.__table__,
        Student.__table__,
    ],
    )
    return sessionmaker(bind=engine)()


def seed(db, *, role="teacher", sub_status="active", students=0):
    plan = Plan(code="pro", name="专业版", max_students=5, features={"rag": True, "magic_ppt": True})
    db.add(plan)
    user = User(id=1, username="t1", hashed_password="x", role=role, is_active=True)
    db.add(user)
    db.flush()
    sub = Subscription(user_id=1, plan_id=plan.id, status=sub_status)
    db.add(sub)
    for i in range(students):
        db.add(Student(user_id=1, name=f"s{i}", grade="8", class_name="1"))
    db.commit()
    db.refresh(sub)
    return user, sub, plan


def test_require_feature_grants_active_paid_feature():
    db = make_db()
    user, sub, _ = seed(db)
    require_feature(sub, "rag", user, db)  # must not raise


def test_require_feature_admin_bypass_survives_corrupted_entitlement():
    """Admin keeps the explicit bypass even for broken/inactive subscription rows."""
    db = make_db()
    admin = User(id=2, username="a1", hashed_password="x", role="admin", is_active=True)
    broken = Subscription(user_id=2, plan_id=999999, status="expired")
    db.add_all([admin, broken])
    db.commit()
    db.refresh(broken)
    require_feature(broken, "rag", admin, db)  # must not raise
    require_plan_capacity(admin, broken, db)  # must not raise


def test_require_feature_inactive_subscription_rejected():
    db = make_db()
    user, sub, _ = seed(db, sub_status="expired")
    with pytest.raises(HTTPException) as exc:
        require_feature(sub, "rag", user, db)
    assert exc.value.status_code == 403
    assert exc.value.detail == INACTIVE_SUBSCRIPTION_DETAIL


def _dangling_plan_id(db, sub):
    """subscriptions.plan_id is NOT NULL, so corruption is modelled as a dangling id."""
    sub.plan_id = 999999
    db.commit()
    db.refresh(sub)
    return sub


def test_require_feature_missing_plan_fails_closed_503():
    db = make_db()
    user, sub, _ = seed(db)
    _dangling_plan_id(db, sub)
    with pytest.raises(HTTPException) as exc:
        require_feature(sub, "rag", user, db)
    assert exc.value.status_code == 503
    assert exc.value.detail == BROKEN_PLAN_DETAIL


def test_require_feature_missing_flag_rejected():
    db = make_db()
    user, sub, plan = seed(db)
    plan.features = {"rag": False}
    db.commit()
    with pytest.raises(HTTPException) as exc:
        require_feature(sub, "rag", user, db)
    assert exc.value.status_code == 403
    assert "升级" in exc.value.detail


def test_capacity_missing_plan_fails_closed_503():
    db = make_db()
    user, sub, _ = seed(db)
    _dangling_plan_id(db, sub)
    with pytest.raises(HTTPException) as exc:
        require_plan_capacity(user, sub, db)
    assert exc.value.status_code == 503


def test_capacity_inactive_subscription_rejected():
    """RB01: expired/inactive subscription must not spend the stored plan's capacity."""
    db = make_db()
    user, sub, _ = seed(db, sub_status="expired", students=0)
    with pytest.raises(HTTPException) as exc:
        require_plan_capacity(user, sub, db)
    assert exc.value.status_code == 403
    assert exc.value.detail == INACTIVE_SUBSCRIPTION_DETAIL


def test_create_student_for_user_rejects_expired_subscription_without_side_effects():
    """RB01 end-to-end service path: expired sub + pro plan + room to spare → no Student row."""
    from app.schemas.student_dto import StudentCreate
    from app.services.student_service import create_student_for_user

    db = make_db()
    # get_current_subscription 需要 free 套餐存在；订阅本身保持 expired+pro。
    db.add(Plan(code="free", name="免费版", max_students=3, features={}))
    user, sub, _ = seed(db, sub_status="expired", students=1)  # well under pro.max_students=5
    with pytest.raises(HTTPException) as exc:
        create_student_for_user(db, StudentCreate(name="新生", grade="8", class_name="1"), user)
    assert exc.value.status_code == 403
    assert exc.value.detail == INACTIVE_SUBSCRIPTION_DETAIL
    assert db.query(Student).filter(Student.name == "新生").count() == 0
    assert db.query(Student).count() == 1  # zero side effects


def test_capacity_still_enforces_limit():
    db = make_db()
    user, sub, _ = seed(db, students=5)
    with pytest.raises(HTTPException) as exc:
        require_plan_capacity(user, sub, db)
    assert exc.value.status_code == 403


def test_expired_period_end_downgrades_to_free_instead_of_failing():
    """既有的到期自动降级逻辑不得被 fail-closed 破坏。"""
    db = make_db()
    user, sub, _ = seed(db)
    free = Plan(code="free", name="免费版", max_students=3, features={})
    db.add(free)
    sub.period_end = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
    db.commit()

    refreshed = get_current_subscription(user, db)
    assert refreshed.plan.code == "free"
    assert refreshed.status == "active"
    assert refreshed.period_end is None
