import httpx

from app.services import gemini_rest_service


def test_resolve_gemini_proxy_prefers_env(monkeypatch):
    monkeypatch.setenv("LLM_HTTPS_PROXY", "http://127.0.0.1:7897")
    monkeypatch.setenv("HTTPS_PROXY", "http://example.invalid:8080")

    assert gemini_rest_service.resolve_gemini_proxy() == "http://127.0.0.1:7897"


def test_gemini_rest_sync_retries_socks5_as_http(monkeypatch):
    proxies_seen: list[str | None] = []

    class FakeResponse:
        status_code = 200
        text = ""

        def raise_for_status(self):
            return None

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": "ok"}],
                        }
                    }
                ]
            }

    class FakeClient:
        def __init__(self, proxy=None, timeout=None, trust_env=None):
            self.proxy = proxy

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            proxies_seen.append(self.proxy)
            if self.proxy and str(self.proxy).startswith("socks5://"):
                raise RuntimeError("socks connect failed")
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)

    result = gemini_rest_service.gemini_rest_sync(
        prompt="hello",
        api_key="key",
        model="gemini-1.5-flash",
        temperature=0.2,
        max_tokens=100,
        proxy_url="socks5://127.0.0.1:7897",
    )

    assert result == "ok"
    assert proxies_seen == ["socks5://127.0.0.1:7897", "http://127.0.0.1:7897"]
