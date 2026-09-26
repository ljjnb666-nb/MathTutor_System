"""
真实 SQLite 并发回归：支付回调的并发幂等（PAY-CONC-01/02/03/05）。

不使用内存库或单会话模拟：每个用例建立文件型 SQLite 数据库，
由多个独立线程/会话在 threading.Barrier 协调下同时发起支付申请，
最终从第三个全新会话读取已提交的持久化状态作为唯一证据。

幂等凭据来自数据库条件抢占（UPDATE ... WHERE status != 'paid'），
不依赖任何进程内锁；SQLite deferred 事务的写锁升级冲突由
order_payment_service 内部整体重试消化。
"""
import shutil
import tempfile
import threading
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models.base import Base
from app.models.order import Order
from app.models.plan import Plan
from app.models.subscription import Subscription
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.services import order_payment_service as service

FROZEN_NOW = datetime(2026, 1, 1, 12, 0, 0)
TEST_TMP_DIR = Path(__file__).resolve().parent / ".tmp_payment_concurrency_runs"


@pytest.fixture
def concurrency_tmp(request):
    """每个测试一个独立临时目录（避免依赖系统 %TEMP% 的 pytest tmp_path 根目录权限）。"""
    if TEST_TMP_DIR.exists():
        shutil.rmtree(TEST_TMP_DIR, ignore_errors=True)
    TEST_TMP_DIR.mkdir(parents=True, exist_ok=True)
    case_dir = Path(tempfile.mkdtemp(dir=TEST_TMP_DIR))
    request.addfinalizer(lambda: shutil.rmtree(TEST_TMP_DIR, ignore_errors=True))
    return case_dir


def make_engine(case_dir):
    engine = create_engine(
        f"sqlite:///{case_dir.as_posix()}/payment-concurrency.db",
        connect_args={"check_same_thread": False, "timeout": 15},
        poolclass=NullPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Plan.__table__,
            Order.__table__,
            Subscription.__table__,
            SubscriptionHistory.__table__,
        ],
    )
    return engine


def seed_user_and_plan(db):
    db.add_all(
        [
            User(id=1, username="teacher", hashed_password="x", role="teacher", is_active=True),
            Plan(
                id=1,
                code="basic",
                name="基础版",
                max_students=10,
                features={},
                sort_order=1,
                price_monthly=10,
                price_yearly=100,
            ),
        ]
    )
    db.commit()


def seed_pending_order(db, out_trade_no, *, period_months=1):
    order = Order(
        user_id=1,
        plan_id=1,
        amount=10,
        currency="CNY",
        status="pending",
        payment_method="alipay",
        period_months=period_months,
        out_trade_no=out_trade_no,
    )
    db.add(order)
    db.commit()


def run_concurrently(SessionLocal, jobs):
    """并发执行 jobs；返回 {name: 返回值} 与 {name: 未捕获异常}。"""
    barrier = threading.Barrier(len(jobs), timeout=15)
    results, errors = {}, {}

    def worker(name, job):
        db = SessionLocal()
        try:
            barrier.wait()
            results[name] = job(db)
        except Exception as exc:  # 并发竞争下不允许异常逃逸
            errors[name] = exc
        finally:
            db.close()

    threads = [threading.Thread(target=worker, args=(name, job)) for name, job in jobs]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    return results, errors


def test_same_order_concurrent_callbacks_apply_subscription_once(concurrency_tmp, monkeypatch):
    """PAY-CONC-01/02/03：同一订单并发回调只产生一次权益生效。"""
    monkeypatch.setattr(service, "utc_now", lambda: FROZEN_NOW)
    engine = make_engine(concurrency_tmp)
    SessionLocal = sessionmaker(bind=engine)
    seed = SessionLocal()
    seed_user_and_plan(seed)
    seed_pending_order(seed, "order-race")
    seed.close()

    trades = {"a": "trade-A", "b": "trade-B"}
    results, errors = run_concurrently(
        SessionLocal,
        [
            ("a", lambda db: service.apply_paid_order(
                db, out_trade_no="order-race", third_trade_no=trades["a"])),
            ("b", lambda db: service.apply_paid_order(
                db, out_trade_no="order-race", third_trade_no=trades["b"])),
        ],
    )

    assert not errors, errors
    assert sorted(results.values()) == ["处理成功", "已处理"]
    winner = next(name for name, msg in results.items() if msg == "处理成功")

    verify = SessionLocal()
    orders = verify.query(Order).filter(Order.out_trade_no == "order-race").all()
    subs = verify.query(Subscription).all()
    histories = verify.query(SubscriptionHistory).all()
    verify.close()

    assert len(orders) == 1
    assert orders[0].status == "paid"
    # 最终支付单号必须是抢占成功那次回调写入的，重放方不得改写
    assert orders[0].third_party_trade_no == trades[winner]
    assert orders[0].paid_at == FROZEN_NOW
    assert len(subs) == 1
    assert subs[0].plan_id == 1
    assert subs[0].status == "active"
    # 恰好一次 30 天延长，无双重续期
    assert subs[0].period_end == FROZEN_NOW + timedelta(days=30)
    assert len(histories) == 1


def test_distinct_orders_same_user_concurrent_both_entitlements_kept(concurrency_tmp, monkeypatch):
    """PAY-CONC-05：同用户两笔合法订单并发到账，两份权益都保留。"""
    monkeypatch.setattr(service, "utc_now", lambda: FROZEN_NOW)
    engine = make_engine(concurrency_tmp)
    SessionLocal = sessionmaker(bind=engine)
    seed = SessionLocal()
    seed_user_and_plan(seed)
    seed_pending_order(seed, "order-d1")
    seed_pending_order(seed, "order-d2")
    seed.close()

    results, errors = run_concurrently(
        SessionLocal,
        [
            ("a", lambda db: service.apply_paid_order(
                db, out_trade_no="order-d1", third_trade_no="trade-1")),
            ("b", lambda db: service.apply_paid_order(
                db, out_trade_no="order-d2", third_trade_no="trade-2")),
        ],
    )

    assert not errors, errors
    assert results == {"a": "处理成功", "b": "处理成功"}

    verify = SessionLocal()
    orders = verify.query(Order).order_by(Order.out_trade_no).all()
    subs = verify.query(Subscription).all()
    histories = verify.query(SubscriptionHistory).all()
    verify.close()

    assert len(orders) == 2
    assert all(order.status == "paid" for order in orders)
    assert len(subs) == 1
    assert subs[0].period_start == FROZEN_NOW
    # 项目规则每月 30 天：两笔 1 个月订单合计约 60 天权益，一笔都不丢
    assert subs[0].period_end == FROZEN_NOW + timedelta(days=60)
    assert len(histories) == 2
