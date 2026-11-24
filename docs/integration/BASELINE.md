# WARETRACE Phase 0 Integration Baseline

## Repository state

- HEAD: `e3794f7c18c3dbb987b9dba18baedf346cd4b1db`
- HEAD subject: `dependencies`
- Parent: `ce086db 3D warehouse #twin`
- Integration branch: `waretrace-system-integration`
- Local worktree before Phase 0 edits: clean
- Remote verification: this report reflects the local working tree, not an assumption
  that a remote commit or branch is current.
- `_stage_s02a2_v2/` is tracked in the repository. It contains the receiving
  patch staging area, backups, integration script, style fragment and RAG note.
  It has not been deleted or rewritten.

## Baseline implementation state

### Operational backend

The live FastAPI application exposes exactly 12 OpenAPI paths:

- `GET /api/v1/health`
- `GET /api/v1/warehouses`
- `GET /api/v1/warehouses/{warehouse_id}/zones`
- `GET /api/v1/zones/{zone_id}/bins`
- `GET /api/v1/skus`
- `GET /api/v1/inventory/expected`
- `POST /api/v1/handling-units`
- `GET /api/v1/handling-units`
- `GET /api/v1/handling-units/by-code/{external_code}`
- `GET /api/v1/handling-units/{hu_id}`
- `POST /api/v1/handling-units/{hu_id}/move`
- `GET /api/v1/handling-units/{hu_id}/events`
- `POST /api/v1/intake/decode`

Only health, catalog, handling-unit and intake routers are included by
`backend/app/api/v1/router.py`.

The live health response is:

```json
{"status":"ok","service":"waretrace-api","version":"0.1.0"}
```

The warehouse catalog contract contains paginated warehouses, SKUs and expected
inventory, plus array responses for zones and bins. Expected inventory includes
`sku`, `bin`, `expected_qty`, `source` and optimistic `revision`.

Handling-unit creation starts in `RECEIVED`; moves require a storage-zone
destination, active warehouse, accessible bin and sufficient aggregate bin
capacity. Movements use an expected handling-unit version and row locking,
then update expected inventory and create warehouse events.

The decoder accepts PNG and JPEG, enforces a 3 MiB limit and returns decoded
values plus symbology. It does not create or move stock.

### Frontend

The active React shell exposes Overview, Inventory & Locations, Handling Units
and Scan & Identify. The intake screen supports manual lookup, image upload,
camera capture, multiple-code selection and read-only handling-unit lookup.

The frontend uses relative `/api/v1` requests. It has no direct independent
warehouse inventory store.

### 3D warehouse

The standalone 3D twin is a separate Vite application. It contains coordinate
mapping, REST provider pagination, demo/live provider separation, bin selection,
optional realtime invalidation, and no inventory write behavior.

The standalone API provider contract matches the live warehouse, zones, bins and
expected-inventory endpoints. It rejects live failures rather than silently
falling back to demo data. WebSocket support exists only as an optional
client and is disabled until a real backend stream exists.

The standalone build currently exceeds the Vite 500 kB chunk warning threshold:
`dist/assets/index-C5IG4TWC.css` and a 1.256 MB JavaScript bundle (342.33 kB
gzip). Its Vite configuration also emits a future `__dirname` compatibility
warning.

### RAG foundation

`backend/rag_worker/` contains an isolated local Sentence Transformers embedding
runtime, measured 384-dimensional model metadata, index compatibility
metadata and mock callback tests. It is not mounted in FastAPI and does not
contain a complete knowledge ingestion/query implementation.

The isolated RAG environment was previously documented and reused only for
this integration phase. No OpenRouter key is assumed. No real end-to-end RAG
ingestion or retrieval proof is claimed.

## Database and migrations

Alembic reports:

- Revision: `0003_hu_events`
- Status: head
- Pending schema changes: none

Migrations present:

- `0001_warehouse_locations.py`
- `0002_inventory_core.py`
- `0003_hu_events.py`

Existing migrations must not be rewritten or modified.

## Placeholder and incomplete modules

The following source areas are zero-byte placeholders and must not be described
as implemented:

- Health: package `__init__.py` files are excluded from this classification.
- API route placeholders:
  `assistant.py`, `audits.py`, `inspections.py`, `inventory.py`,
  `knowledge.py`, `repacking.py`, `simulation.py`, `warehouses.py`
- Schema placeholders:
  `assistant.py`, `audit.py`, `inspection.py`, `knowledge.py`,
  `repacking.py`, `simulation.py`, `warehouse.py`
- Model placeholders:
  `audit.py`, `inspection.py`, `knowledge.py`, `repacking.py`
- Service placeholders:
  `inventory.py`, `inspection.py`, `reconciliation.py`, `repacking.py`
- Simulation placeholders:
  `audit_simulator.py`, `grid.py`, `pathfinding.py`
- Vision placeholder:
  `ocr.py`
- Knowledge placeholders:
  `protocol.py`, `service.py`, `raganything_adapter.py`
- Knowledge tests:
  `test_ingestion.py`, `test_retrieval.py`
- Planned unit/API tests:
  `test_audits.py`, `test_handling_units.py`, `test_inspections.py`,
  `test_database.py`, `test_warehouse_flow.py`, `test_pathfinding.py`,
  `test_reconciliation.py`, `test_repacking.py`

`conftest.py` is also zero bytes, but pytest fixtures are not currently
required for the collected baseline suite.

## Verified baseline results

| Check | Result |
| --- | --- |
| Backend pytest | PASS — 40 tests passed |
| Alembic current/check | PASS — `0003_hu_events` head, no drift |
| Backend Ruff | PASS |
| Backend Black check | PASS — 72 files unchanged |
| Main frontend Vitest | PASS — 9 files, 35 tests |
| Main frontend build | PASS |
| Main frontend ESLint | PASS |
| Standalone 3D Vitest | PASS — 4 files, 19 tests |
| Standalone 3D TypeScript lint | PASS |
| Standalone 3D build | PASS with chunk-size and Vite compatibility warnings |
| Live health/OpenAPI smoke | PASS — health OK; 12 mounted paths |
| RAG real ingestion | NOT RUN |

## Risks and mismatches

1. Several frontend features and backend modules exist in source but are not
   reachable through the active API.
2. No authentication or authorization exists on operational write endpoints.
3. No physical-inspection records or forward-only inspection migration exist.
4. No audit-session, observation, discrepancy or notification model is
   currently implemented.
5. No RAG provider credentials or real ingest/query proof are established.
6. `_stage_s02a2_v2/` is tracked and contains staged source plus recovery copies.
   It should be reviewed before cleanup, not deleted automatically.
7. The standalone 3D bundle is large and should be integrated with code
   splitting rather than copied as a second application shell.
8. WebSocket event streams do not exist in FastAPI; any realtime integration
   must remain disabled until a backend contract is implemented.
9. The handling-unit movement service supports storage moves but not an
   inspection-gated lifecycle.
10. The `README` and source tree must not be used to claim planned modules are
    complete.

## Intended change sequence

Gate 0: complete.

1. Phase 1: stabilize and verify scanner/handling-unit receiving behavior.
2. Phase 2: integrate the existing 3D twin read-only REST feature.
3. Phase 3: add forward-only inspection and quarantine lifecycle support.
4. Phase 4: complete RAG ingestion and grounded retrieval with local
   embeddings and only a verified provider.
5. Phase 5: add simulated, labeled audit observations and deterministic
   reconciliation without stock mutation.
6. Phase 6: persist anomaly findings and in-app development notifications.
7. Phase 7: add packaging and reproducible business scenarios.
8. Add cross-feature integration tests and complete the integration handoff.

No source implementation is included in this Gate 0 document. The next
implementation track is the scanner/handling-unit workflow, after which all
applicable backend and frontend checks must be rerun.

## Phase 1 receiving verification

Gate 1: PASS.

- Live demo warehouse `RIX-DEMO` is seeded and accessible.
- Live lookup of `HU-0001` returns the persisted `a3132...` handling unit,
  SKU-001 / Calibration Kit, quantity 8, bin A-01, status `STORED`, and version
  1. The UUIDs above are environment-specific and must not be copied into
  source fixtures.
- An unknown code returns HTTP 404.
- A real ZXing-generated QR PNG encoding `HU-0001` decodes to
  `{"value":"HU-0001","symbology":"QR Code"}` and HTTP 200.
- A real ZXing-generated Code 128 PNG encoding `HU-0001` decodes to
  `{"value":"HU-0001","symbology":"Code 128"}` and HTTP 200.
- Corrupt image PNG input returns HTTP 400.
- Unsupported text upload returns HTTP 415.
- An image over 3 MiB returns HTTP 413.
- The decoder and frontend tests cover blank images and malformed/deployed API
  responses; the frontend tests cover manual lookup, URL rejection,
  multiple-code choice, oversized input and camera track cleanup.
- Focused backend receiving/handling-unit tests: 23 passed.
- Focused frontend receiving/handling-unit tests: 19 passed across 4 files.
- No receiving source change was needed for Phase 1.

## Phase 2 3D warehouse verification

Gate 2: PASS.

- The standalone 3D implementation is copied into the isolated host feature
  `frontend/src/features/warehouse-3d/`.
- The main application navigation has a `3D Warehouse` entry and a lazy-loaded
  dedicated read-only page.
- The host page visibly labels the provider `LIVE API · READ ONLY`.
- `three`, `@react-three/fiber`, `@react-three/drei`, `lucide-react` and
  `@types/three` are dependencies of the main frontend only.
- The viewer uses the standalone REST provider with full-page pagination,
  cancellation and honest live API errors. WebSocket is explicitly disabled.
- The live backend smoke returned one `RIX-DEMO` warehouse, three zones and
  twelve bins. The live A-01 bin ID matched the persistent backend record;
  its 8 unit SKU-001 row contributed to the 55-unit expected stock total.
- The frontend development server responded HTTP 200.
- Main frontend Vitest: 13 files, 55 tests passed.
- Main frontend production build: passed.
- Main frontend ESLint: passed after narrow copied-component lint annotations
  for intentional Three.js camera/scene mutations and async snapshot loading.
- Backend regression: 40 tests passed.
- Standalone 3D Vitest: 4 files, 19 tests passed.
- Standalone 3D TypeScript lint: passed.
- Standalone 3D build: passed with existing bundle-size and Vite compatibility
  warnings.

## Phase 4 RAG provider verification

Gate 4: BLOCKED for real ingestion only.

- The local CPU embedding foundation remains implemented and measured:
  384 dimensions, 256 maximum sequence tokens, revision
  `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, L2 normalization.
- The isolated RAG worker suite has 14 passing tests.
- An OpenRouter text callback is implemented with:
  environment-only API-key lookup,
  configurable model,
  30-second default timeout,
  concurrency 1,
  bounded 429 retries,
  explicit 401/402/404 handling,
  no credential or document-content logging.
- Public catalog re-check currently lists
  `nvidia/nemotron-3.5-lightning:free` as text-to-text with zero prompt and
  completion pricing.
- No `OPENROUTER_API_KEY` is configured in the environment or ignored `.env`.
- Authenticated model smoke, real ingestion, retrieval evidence and storage
  reopen are NOT RUN.
- Knowledge API and knowledge UI remain placeholders and no mocked success is
  presented as a real RAG result.

## Phase 3 inspection verification

Gate 3: PASS.

- Forward migration `0004_handling_unit_inspections` passed upgrade/current/check
  on a disposable SQLite database and on the existing local development SQLite
  database.
- The inspection model records final PASS/FAIL decisions, checklist answers,
  damage notes, evidence metadata/checksum, development actor identity and
  audit timestamps.
- PASS sets a handling unit to `INSPECTION_REQUIRED`.
- FAIL sets a handling unit to `QUARANTINED`.
- Normal movement now requires a PASS for `RECEIVED` and
  `INSPECTION_REQUIRED` units. Existing `STORED` historical units remain
  movable under the existing movement rules.
- One final inspection per handling unit is enforced.
- Disposable live API smoke:
  - direct storage before inspection returned 409
  - PASS followed by storage returned `STORED`, version 3
  - FAIL returned `QUARANTINED`
  - normal storage after FAIL returned 409
- Backend tests: 44 passed.
- Frontend tests: 56 passed.
- Frontend build and ESLint: passed.
