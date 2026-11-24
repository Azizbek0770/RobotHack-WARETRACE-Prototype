# Isolated WARETRACE RAG worker

This development worker is separate from the FastAPI warehouse API. It has no
database session, inventory, movement, or receiving-write interface.

The local embedding is pinned to
`sentence-transformers/all-MiniLM-L6-v2` revision
`1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. Its vectors use L2 normalization.
The installed model token limit and actual vector dimension are measured at
runtime. Inputs exceeding that limit are rejected rather than silently
truncated.

`verify_embedding` writes compatibility metadata into a fresh namespaced
directory under `WARETRACE_RAG_ROOT` (or `%LOCALAPPDATA%\WARETRACE\rag\indexes`).
Existing metadata must match exactly; an unmanaged non-empty directory or an
incompatible index is never overwritten or deleted. This step does not
initialize LightRAG storage or ingest a document.

Install `requirements.txt` only into the isolated Python 3.11 RAG environment.
RAG-Anything remains the bundled upstream package; do not install dependencies
into `backend\.venv` for this worker.

Example PowerShell commands, run from the repository root:

```powershell
$ragPython = "$HOME\.copilot\session-state\cf0e11b6-41eb-49bd-9916-7cdea60534c1\files\rag311-venv\Scripts\python.exe"
$env:HF_HOME = "$HOME\.copilot\session-state\cf0e11b6-41eb-49bd-9916-7cdea60534c1\files\hf-home"
$env:WARETRACE_RAG_ROOT = "$HOME\.copilot\session-state\cf0e11b6-41eb-49bd-9916-7cdea60534c1\files\waretrace-rag-02a\indexes"
& $ragPython -m pip install -r backend\rag_worker\requirements.txt
& $ragPython -m unittest discover -s backend\rag_worker\tests -v
& $ragPython -m backend.rag_worker.verify_embedding
```

The OpenRouter text callback is implemented with bounded concurrency,
timeouts, bounded 429 retry backoff, and explicit 401/402/404 handling. It reads
`OPENROUTER_API_KEY` from the environment and accepts `OPENROUTER_TEXT_MODEL`
with a configurable default. The real text-provider test and document ingestion
remain gated on a configured key and a current provider-verifiable model.
