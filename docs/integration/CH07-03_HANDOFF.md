# WARETRACE CH07-03 HANDOFF

## Repository state

- Branch: `focus/challenge07-audit-intelligence`
- Local HEAD: `719d503`
- The working tree includes uncommitted CH07-01/CH07-02 work as well as this
  task's changes. All existing local changes were preserved; nothing was
  committed or pushed.

## Result

Implemented the operator-facing inventory audit workflow in the existing React
application. The screen creates or reopens an audit, records manual counts or
validated CSV observations, compares them with the audit-start snapshot,
prioritizes and filters findings, shows evidence, and records supervisor review
and resolution. It does not adjust expected inventory.

Non-match findings highlight their persisted bin UUID in the existing 3D
warehouse viewer. Existing navigation, scanner, inspection, handling-unit,
inventory, and standalone 3D screens remain in place.

Finding severity is deterministic: stock `MISSING`/`EXCESS` is HIGH, handling
unit identity findings are MEDIUM, and `MATCH` is LOW. Ordering is by status
(open, reviewed, resolved), finding class (stock, HU identity, match), larger
absolute stock variance, then bin/SKU code and finding ID.

## Files changed for CH07-03

- `frontend/src/app/App.tsx`, `frontend/src/app/App.test.tsx` — audit navigation
  and navigation coverage.
- `frontend/tests/inventory.test.tsx` — updates the dashboard status assertion
  for the now-available CH07 MVP.
- `frontend/src/features/audit/api.ts` — typed and runtime-validated audit API
  client.
- `frontend/src/features/audit/AuditPage.tsx` — audit workflow, evidence,
  computed metrics, deterministic finding order, and embedded 3D viewer.
- `frontend/src/features/audit/AuditPage.test.tsx` — simulated correct-count,
  discrepancy, supervisor-action, stable-bin-ID, and no-inventory-write flow.
- `frontend/src/features/dashboard/DashboardPage.tsx` — marks the CH07 MVP
  audit module as available.
- `frontend/src/features/warehouse-3d/components/Warehouse3DViewer.tsx`,
  `WarehouseScene.tsx`, `WarehouseZone.tsx`, `WarehouseBin.tsx`, and
  `warehouseMaterials.ts` — optional affected-bin highlighting, preserving
  existing selection, hover, and inaccessible-bin states.
- `frontend/src/styles/global.css` — audit workspace and responsive styles.
- `backend/app/api/v1/audits.py`, `backend/app/services/reconciliation.py`,
  `backend/app/schemas/audit.py`, and `backend/tests/api/test_audits.py` —
  read-only snapshot endpoint and its test. No new migration was needed;
  CH07-02 migration `0005_inventory_audits` supplies the audit tables.
- `README.md` and `docs/integration/CH07-02_HANDOFF.md` — current capability
  status and snapshot API contract.

## Verification

Validation was run against the current local working tree:

- Backend: `54 passed`; one existing Starlette/httpx deprecation warning.
- Backend Ruff and Black check: passed.
- Frontend: `58 passed` across 14 test files.
- Frontend ESLint: passed.
- Frontend production build: passed. Vite reports the existing 3D chunk exceeds
  its 500 kB advisory threshold.
- The focused frontend workflow test also verifies deterministic ordering
  (larger stock variance first), type filtering, UUID-based highlights, and no
  call to the existing expected-inventory API.
- Disposable SQLite migration: upgraded to `0005_inventory_audits (head)`;
  `alembic check` reported no pending schema changes.
- Local browser/API run used a separately migrated and seeded SQLite database,
  not the repository's default database:
  - Correct SIMULATED observation: expected 8, observed 8, result `MATCH`,
    delta 0.
  - New SIMULATED observation: expected 8, observed 0, result `MISSING`,
    delta -8, severity HIGH.
  - Evidence showed the audit-start snapshot revision and persisted bin UUID
    `34f9ae2f-760a-4802-94b0-72802272d160`.
  - Recorded REVIEW and RESOLVE actions; metrics updated to 0 open and 1
    resolved finding.
  - The 3D viewer displayed one affected bin and focused the same UUID. An
    affected-bin screenshot was captured during browser verification.
  - Read-only database verification after both audits found A-01/SKU-001 still
    at expected quantity 8, revision 1; total expected units remained 55.

## Reproduce quality checks

Run from the repository root:

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
& .\backend\.venv\Scripts\python.exe -m ruff check backend\app backend\alembic backend\tests
& .\backend\.venv\Scripts\python.exe -m black --check backend\app backend\alembic backend\tests
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

For a disposable migration check, select a fresh filename under `$env:TEMP`:

```powershell
$checkDb = Join-Path $env:TEMP "waretrace-ch07-migration-check.sqlite3"
if (Test-Path $checkDb) { throw "Choose a fresh migration-check filename." }
$env:WARETRACE_DATABASE_URL = "sqlite+pysqlite:///" + ($checkDb -replace '\\', '/')
$env:WARETRACE_ENVIRONMENT = "development"
& .\backend\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini upgrade head
if (-not $?) { throw "Alembic upgrade failed." }
& .\backend\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini current
if (-not $?) { throw "Alembic current failed." }
& .\backend\.venv\Scripts\python.exe -m alembic -c backend/alembic.ini check
if (-not $?) { throw "Alembic check failed." }
```

## Local demo commands (Windows PowerShell)

Use a fresh filename in `$env:TEMP`. If the example file already exists, change
the filename in both terminals rather than reusing a database with old demo
audits.

Terminal 1 — migrate, seed, and run the backend:

```powershell
$demoDb = Join-Path $env:TEMP "waretrace-ch07-03-demo.sqlite3"
if (Test-Path $demoDb) { throw "Choose a fresh demo database filename." }
$env:WARETRACE_DATABASE_URL = "sqlite+pysqlite:///" + ($demoDb -replace '\\', '/')
$env:WARETRACE_ENVIRONMENT = "development"

Push-Location backend
& .\.venv\Scripts\python.exe -m alembic -c alembic.ini upgrade head
if (-not $?) { throw "Alembic upgrade failed." }
& .\.venv\Scripts\python.exe -m app.db.seed_demo
if (-not $?) { throw "Demo seeding failed." }
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 — run the frontend in a second terminal:

```powershell
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173`, select **Inventory Audit**, and follow this demo:

1. Start a SIMULATED audit.
2. Record `A-01` / `SKU-001` with quantity `8`; confirm expected quantity 8.
3. Compare; confirm a `MATCH` result.
4. Start another SIMULATED audit for the same bin/SKU; record quantity `0`.
5. Compare; inspect the HIGH `MISSING` finding (`-8`).
6. Enter a supervisor actor, record review, then resolve the finding.
7. Confirm the resolved action history, updated metrics, and highlighted 3D bin.

The only backend URL used is `127.0.0.1:8000`; the Vite proxy forwards local
browser API requests to it. Do not expose this development setup publicly.

## Limitations and remaining risks

- The supervisor actor is a recorded label, not an authenticated identity or
  role. Production deployment requires proper authentication and authorization.
- Data shown in the 3D view remains the existing warehouse snapshot; audit
  highlighting adds context but does not alter physical or expected stock.
- Runtime browser logs included the existing `THREE.Clock` deprecation warning.
- The browser screenshot was captured during this session and is not checked
  into the repository.
- No production deployment, authentication change, migration, or push was
  performed for CH07-03.

## Next step

Review the CH07-03 operator flow and security boundary before proceeding.
Potential follow-up work is production-grade supervisor authorization and
additional browser coverage for CSV import and stale-snapshot error handling.
