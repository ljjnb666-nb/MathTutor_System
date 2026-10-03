"""Every non-allowlisted endpoint must reject anonymous access with 401.

The allowlist is exhaustive on purpose: landing/health, public plan catalog,
payment provider callbacks (signature is their authority), and the two token
endpoints. Anything else answering anonymously is a BLOCKER.
"""
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models.base import Base, get_db

# path → {method: expected}
PUBLIC_ENDPOINTS = {
    "/": {"GET": 200},
    "/favicon.ico": {"GET": 204},
    "/health": {"GET": 200},
    "/api/health": {"GET": 200},
    "/api/plans/": {"GET": 200},
    "/api/payment/config": {"GET": 200},
    "/api/payment/notify/alipay": {"POST": 200},   # provider callbacks: signature is the authority
    "/api/payment/notify/wechat": {"POST": 200},
    "/api/payment/notify": {"POST": 501},
    "/api/token": {"POST": {200, 401, 422}},        # bad/missing credentials, still public
    "/api/student/token": {"POST": {200, 401, 422}},
    "/docs": {"GET": 200},
    "/openapi.json": {"GET": 200},
}


def _client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
    session.close()
    engine.dispose()


def test_every_route_enforces_auth():
    client = next(_client())
    seen = set()
    offenders = []
    for route in app.routes:
        if not hasattr(route, "methods") or not hasattr(route, "path"):
            continue
        if not route.path.startswith("/api"):
            continue  # framework/mounted routes covered by the allowlist below
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            key = (method, route.path)
            if key in seen:
                continue
            seen.add(key)
            template = route.path
            for param in route.param_convertors or {}:
                template = template.replace("{" + param + "}", "1")
            if template in PUBLIC_ENDPOINTS and method in PUBLIC_ENDPOINTS[template]:
                continue
            response = client.request(method, template)
            if response.status_code != 401:
                offenders.append((method, template, response.status_code))
    assert not offenders, f"endpoints reachable without auth: {offenders}"


def test_allowlisted_public_endpoints_behave():
    client = next(_client())
    for path, expectations in PUBLIC_ENDPOINTS.items():
        for method, expected in expectations.items():
            response = client.request(method, path)
            expected_codes = expected if isinstance(expected, set) else {expected}
            assert response.status_code in expected_codes, (method, path, response.status_code)


def test_payments_callbacks_reject_unsigned_but_stay_public():
    client = next(_client())
    # Unsigned alipay notify: rejected by signature, not by login requirement.
    response = client.post("/api/payment/notify/alipay", data={})
    assert response.status_code == 200
    assert response.text == "failure"
    # Unsigned wechat notify: rejected by signature/decrypt, not by login.
    response = client.post("/api/payment/notify/wechat", json={})
    assert response.status_code == 200
    assert response.json()["code"] == "FAIL"
