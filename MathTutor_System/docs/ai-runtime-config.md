# AI runtime configuration (PHASE 2C-1)

`AppSettings` is the environment ingestion boundary. The application ingests a
snapshot at startup; restart after changing environment configuration.
`app/core/ai_runtime.py` owns provider transports, canonical URLs, model defaults,
LLM resolution and separate embedding resolution. HTTP dependencies only collect
headers and apply deployment policy. Adapters consume resolved values.

## Generation and chat

Server mode uses `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_API_VERSION`
and `LLM_MODEL`. DeepSeek can use `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` and
`DEEPSEEK_MODEL`; Gemini can use `GOOGLE_API_KEY` or `GEMINI_API_KEY`.
These fallbacks stay within the corresponding provider.

Empty model selects the existing product default: DeepSeek `deepseek-v4-flash`,
OpenAI `gpt-4.1-mini`, Gemini `gemini-2.5-flash`. Other providers require an
explicit model. Anthropic native transport is unimplemented and fails with
`LLM_CONFIG_UNSUPPORTED_PROVIDER` / `unsupported_provider`; its UI option is hidden.
No model versions were upgraded.

Any `x-llm-*` header, including empty or unknown headers, enters client mode.
Production (`ENV=production` or `DEBUG=false`) always rejects client mode with
403, even with `ALLOW_CLIENT_LLM_CONFIG=true`. Development client mode requires
a non-empty `x-llm-api-key`; missing keys fail with 400 and
`LLM_CONFIG_MISSING_KEY`. Client fields never inherit server keys or routing
fields. The frontend sends no LLM headers when its active key is empty.

Server configurations without a key remain inspectable by status/test and allow
RAG with independent embedding credentials. Generation adapters reject missing
keys before constructing any transport.

## Requests, retries and proxy

`AI_REQUEST_TIMEOUT` defaults to 120 seconds. `/llm/test` replaces the transport
timeout and its outer deadline with `AI_TEST_TIMEOUT` (default 30 seconds).
`AI_MAX_RETRIES` defaults to 2 and must be between 0 and 5. Generation and
non-streaming chat own this retry budget and disable SDK retries. Streaming
OpenAI chat lets the SDK retry request establishment; it never replays delivered
chunks. Practice draft schema repair (three attempts) is a separate business
operation. Gemini SOCKS-to-HTTP connection recovery and Windows proxy recovery
are transport recovery, separate from provider request retries.

Proxy precedence is `LLM_HTTPS_PROXY`, then `HTTPS_PROXY`, captured by AppSettings
and passed explicitly to clients with environment proxy discovery disabled.
Gemini retains Windows system proxy detection when this value is empty.
`LLM_HTTP_PROXY` / `HTTP_PROXY` are ingested for compatibility; all approved AI
endpoints use HTTPS. Proxy URLs and credentials are excluded from runtime repr
and configuration logs.

Both server and client Base URLs use the same SSRF guard: HTTPS, no userinfo,
fragment or query, port 443, public IPs, every DNS result public, and provider
canonical host. `custom` additionally requires `ALLOW_CUSTOM_LLM_BASE_URL=true`
and an explicit `CLIENT_LLM_ALLOWED_HOSTS` entry. Previously unvalidated server
URLs, including local HTTP endpoints, now fail closed.

## Embedding capability

If any `EMBEDDING_*` field is supplied, resolution uses that explicit capability
configuration and requires `EMBEDDING_PROVIDER` plus `EMBEDDING_API_KEY`; it never
borrows a generation key to complete a partial configuration. Empty model/base
use the embedding policy defaults. Generation models are never embedding models.

With no explicit embedding fields, legacy fallback prefers `DEEPSEEK_API_KEY`,
then `GOOGLE_API_KEY` / `GEMINI_API_KEY`, then `LLM_API_KEY` only for its declared
provider and implemented embedding adapter. RAG upload uses a separate HTTP embedding dependency, independent of generation
model/transport readiness. Server request configuration uses this capability resolver. A client with an implemented embedding
adapter may supply its own key and base URL; unsupported client capabilities
fall back to a valid server embedding configuration, otherwise fail with
`EMBEDDING_CONFIG_ERROR`. Anthropic credentials never reach OpenAI or Gemini
embedding adapters. The registry records adapters implemented by this repository;
it does not assert current external provider API availability.

## Scope

The production-dead `llm_engine.py` was removed after checking imports and call
sites. Generation, exams, verification, chat, probes, Teacher Agent, practice
artifacts, Word/PDF parsing and PPT use the same LLM policy. RAG uploads preserve
the resolved configuration and its provenance across background execution.
No database migrations, tenant lifecycle, confirmation workflow, formula
rendering, payments, subscriptions, navigation or visual redesign were changed.
