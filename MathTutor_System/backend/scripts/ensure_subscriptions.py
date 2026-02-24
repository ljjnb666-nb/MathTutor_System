r"""
补全订阅：确保 plans 表有默认套餐，并为所有无订阅的用户创建订阅（默认免费版）。
适用于：从旧版升级后首次引入套餐、或数据修复。
用法（在 backend 目录下执行）：
  .venv\Scripts\python.exe scripts/ensure_subscriptions.py
  仅指定用户：
  .venv\Scripts\python.exe scripts/ensure_subscriptions.py --username admin
  为补全的用户指定套餐（free / basic / pro）：
  .venv\Scripts\python.exe scripts/ensure_subscriptions.py --plan basic
"""
import argparse
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.models.base import SessionLocal
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.user import User


def ensure_plans(db) -> int:
    """若无套餐则插入默认三档；返回免费版 plan_id。"""
    if db.query(Plan).count() > 0:
        p = db.query(Plan).filter(Plan.code == "free").first()
        return p.id if p else None
    db.add(Plan(
        code="free",
        name="免费版",
        max_students=3,
        features={"magic_ppt": False, "rag": False},
        sort_order=0,
        price_monthly=0,
        price_yearly=0,
    ))
    db.add(Plan(
        code="basic",
        name="基础版",
        max_students=15,
        features={"magic_ppt": False, "rag": True},
        sort_order=1,
        price_monthly=19.9,
        price_yearly=199,
    ))
    db.add(Plan(
        code="pro",
        name="专业版",
        max_students=50,
        features={"magic_ppt": True, "rag": True},
        sort_order=2,
        price_monthly=29.9,
        price_yearly=299,
    ))
    db.commit()
    return db.query(Plan).filter(Plan.code == "free").first().id


def main() -> None:
    parser = argparse.ArgumentParser(description="补全用户订阅：确保默认套餐存在，并为无订阅用户创建订阅")
    parser.add_argument("--username", type=str, default=None, help="仅处理该用户名；不传则处理所有用户")
    parser.add_argument("--plan", type=str, default="free", choices=("free", "basic", "pro"), help="为补全用户绑定的套餐 code，默认 free")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        plan_id = ensure_plans(db)
        if not plan_id:
            print("未找到免费版套餐，请检查 plans 表。")
            return
        if args.plan != "free":
            target_plan = db.query(Plan).filter(Plan.code == args.plan).first()
            if not target_plan:
                print(f"套餐 {args.plan!r} 不存在。")
                return
            plan_id = target_plan.id

        q = db.query(User).filter(User.is_active == True)
        if args.username is not None:
            q = q.filter(User.username == args.username)
        users = q.all()
        if not users:
            print("没有符合条件的用户。")
            return

        created = 0
        for user in users:
            sub = db.query(Subscription).filter(Subscription.user_id == user.id).first()
            if sub is None:
                db.add(Subscription(user_id=user.id, plan_id=plan_id, status="active"))
                db.commit()
                created += 1
                print(f"  已为用户 {user.username!r} (id={user.id}) 创建订阅，套餐 plan_id={plan_id}")

        if created == 0:
            print("所有用户均已有订阅，无需补全。")
        else:
            print(f"共补全 {created} 个用户的订阅。")
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
