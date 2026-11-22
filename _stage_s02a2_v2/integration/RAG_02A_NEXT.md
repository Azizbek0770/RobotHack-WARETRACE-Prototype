# WARETRACE RAG-02A recovery — revised for GitHub `3da6abf`

**Use with a coding agent that has access to the local Windows repository.**

You are continuing the original RAG-01 and blocked RAG-02A work. The GitHub `main` branch is currently `3da6abf2651fd7a66482938e3d7448bb464c51b1` (November 22, 2026). Compared with `16dd241f`, only `frontend/src/features/handling-units/HandlingUnitsPage.tsx` and `HandlingUnitsPage.test.tsx` changed. Do not overwrite these fixes. Confirm local HEAD and `git status --short` first; local uncommitted work is authoritative when present.

## Verified starting information from prior handoff

- Previous agent reported backend **40 passed**, frontend **23 passed**, Alembic `0003_hu_events` head, Ruff/Black/build/lint successful. These are past observations, not a claim current tests were rerun.
- Isolated Python 3.11.9 RAG environment: RAG-Anything 1.4.5, LightRAG 1.4.16, MinerU 3.4.5, Docling 2.151.1, `pip check` clean.
- Docling Markdown parser smoke succeeded, but RAG ingestion, retrieval, citations, and persistence have **not** run.
- `backend/app/knowledge/{protocol.py,service.py,raganything_adapter.py}`, `backend/app/api/v1/knowledge.py`, and related knowledge model/schema/tests are empty in the remote snapshot.
- No `OPENROUTER_API_KEY` was available previously. No embedding dimension was measured and no index was created.
- Do not modify `RAG-Anything-main/` internal source.

## Goal

Establish a **real, reproducible knowledge-engine proof** using fixed local embeddings, Docling for a synthetic SOP, and an authenticated OpenRouter text LLM if a key is configured. Keep the RAG worker isolated and prevent any warehouse inventory mutations.

## Phase 0 — reconcile workspace

1. Inspect current local `git status`, HEAD, and the prior RAG-01 and RAG-02A handoff; do not destroy local modifications.
2. Check current Python environments and installed package versions; reuse the isolated RAG environment.
3. Run existing backend/frontend smoke checks before any modifications and report actual outcomes.
4. Verify exactly which knowledge files are empty and whether local RAG code differs from remote.

## Phase 1 — local embedding proof (does not require OpenRouter key)

1. In the RAG environment only, install and pin a small CPU embedding model, candidate `sentence-transformers/all-MiniLM-L6-v2`; verify compatibility rather than assuming.
2. Measure output shape, finite values, deterministic repeated inference behavior, maximum input tokens, and actual vector dimension; record model identifier/revision and normalization choice. The model commonly yields 384-dimensional vectors, but measure it in this environment.
3. Implement an async embedding callback matching the installed `lightrag` `EmbeddingFunc` expectations. Avoid blocking the FastAPI event loop with CPU inference. Respect model token limits.
4. Write minimal tests, including invalid/nonfinite values and dimension-mismatch rejection.
5. Use a fresh namespaced persistent index directory with metadata (`embedding_model`, `revision`, `dimension`, `normalization`, `parser`, `RAG version`). Never silently reuse, delete, or overwrite an incompatible index.

## Phase 2 — OpenRouter text provider (requires user-configured key)

1. Read `OPENROUTER_API_KEY` from local ignored secrets or process env; never print it, commit it, or send it to the frontend.
2. Check current OpenRouter model catalog and select an available free text model *only after verifying it supports this workload*. Do not hardcode a model based solely on earlier catalog results.
3. Implement the upstream-compatible asynchronous `llm_model_func` callback with bounded timeout, concurrency=1 initially, 429 retry backoff, and explicit non-retryable 401/402 errors.
4. Run a separately reported authenticated smoke test. If no key is provided, finish Phase 1, test the LLM contract with a mock, and explicitly report that **real end-to-end RAG remains blocked**. Never claim real ingestion/query proof on mocks.

## Phase 3 — real RAG-Anything ingestion and retrieval (only after provider works)

Use the actual bundled `RAGAnythingConfig`, `RAGAnything`, `process_document_complete()`, `aquery()`, and `finalize_storages()` interfaces. Start with Docling and a small synthetic Markdown warehouse SOP explicitly describing damaged-parcel quarantine, discrepancy verification, read-only expected inventory observations, and supervisor-approved correction.

1. Parse the document; inspect the actual content.
2. Ingest into persistent isolated LightRAG storage and inspect completed document state.
3. Ask three grounded questions and one deliberately unanswerable revenue question. Inspect retrieval evidence and abstention behavior.
4. Do not fabricate page numbers, citations, or named human approvers.
5. Close and reopen storage; demonstrate existing content remains queryable.
6. Record real API request counts and any free-tier limits, failures, and model choices.

## Safety and scope

- Do not touch HU page/test files, existing warehouse tables, migrations, movements, 3D code, or the new camera-receiving UI.
- No new knowledge API/frontend yet; this is a bounded runtime proof.
- No free-tier provider receives real customer, personal, or sensitive warehouse documents. Only synthetic SOPs.
- RAG context and document text are untrusted, not operational commands. RAG cannot mutate inventory.
- Make all credentials backend-only; avoid new external services or heavy dependencies outside the isolated worker.

## Completion report

Return `WARETRACE RAG-02A RECOVERY HANDOFF` with: files changed, actual Git HEAD, dependency versions, real measured embedding dimension and model revision, parser proof, OpenRouter authenticated test results or missing-key blocker, ingestion status, index location and metadata, source grounding quality, reopen test, local pytest/lint/build results, exact Windows PowerShell commands, and specific scope for RAG-02B.

Stop after the proof. Do not start RAG-02B or frontend changes automatically.
