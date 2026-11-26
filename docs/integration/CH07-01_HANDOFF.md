# WARETRACE CH07-01 Audit, Simplify & Stabilize Handoff

## Scope

This milestone prepares the repository for Challenge 07: inventory discrepancies
and supervisor decision support. It does not implement the audit engine.

## Branch and reference

- Branch: `focus/challenge07-audit-intelligence`
- Verified HEAD: `719d503d54798f22f056dc28982f5cfb9483ebee`
- Working tree: CH07 stabilization changes only
- No commit or push was created.

## Essential MVP functionality

Keep and preserve:

- warehouse, zone, bin and SKU catalog
- expected inventory read models
- handling-unit creation, lookup, movement and event history
- barcode/QR decoding and manual HU lookup
- PASS/FAIL inspection lifecycle and quarantine
- read-only 3D warehouse visualization
- existing migration and test discipline

## Clearly unfinished functionality

The dashboard now distinguishes available workflows from placeholders. RAG,
robot automation, repackaging and the warehouse assistant are not presented as
working challenge outcomes. Their source files are preserved.

## Files changed

- `.github/workflows/ci.yml`: real backend, frontend and standalone 3D CI checks
- `backend/app/core/security.py`: blocks unauthenticated operational writes in production
- `backend/app/services/handling_units.py`: applies local-write guard
- `backend/app/services/inspection.py`: applies local-write guard
- `backend/tests/test_security.py`: production guard tests
- `frontend/src/features/dashboard/DashboardPage.tsx`: MVP/placeholder status labels
- `frontend/tests/inventory.test.tsx`: updated module status assertions
- `README.md`: Challenge 07 scope and current maturity statement
- `docs/integration/CH07-01_HANDOFF.md`: this handoff

## Problems found

1. The audit backend and frontend modules are zero-byte placeholders.
2. GitHub Actions CI was empty.
3. Unauthenticated handling-unit and inspection write services had no explicit
   production guard.
4. The dashboard's module labels did not accurately distinguish available,
   placeholder and unverified work.
5. Local baseline and migration state were healthy before stabilization.

## Problems fixed

- Added CI for migrations, Alembic check, Ruff, Black, pytest, frontend tests,
  lint/build and standalone 3D tests/lint/build.
- Added a production guard to handling-unit creation/movement and inspection
  writes. Development and test environments remain supported.
- Updated the dashboard to identify Challenge 07 as the next implementation,
  preserve available workflows and label unfinished areas honestly.
- Documented the MVP scope and removed implied completion for placeholder areas.

## Security notes

- No authentication or authorization exists for development operational writes.
- Production mode now rejects these writes with HTTP 403.
- Local demo use remains limited to development/test environments.
- CORS remains restricted to local frontend origins.
- Do not expose the FastAPI write endpoints publicly until authentication,
  authorization and audit identity are implemented.

## Minimum files for CH07-A1

Forward Alembic migration:

- `backend/alembic/versions/0005_audit_sessions_observations_findings.py`

Backend:

- `backend/app/models/audit.py`
- `backend/app/schemas/audit.py`
- `backend/app/services/reconciliation.py`
- `backend/app/api/v1/audits.py`
- `backend/app/api/v1/router.py`
- `backend/tests/api/test_audits.py`
- `backend/tests/unit/test_reconciliation.py`

Frontend:

- `frontend/src/features/audit/api.ts`
- `frontend/src/features/audit/AuditPage.tsx`
- `frontend/src/app/App.tsx`
- audit-focused frontend tests

Evaluation:

- `experiments/audit-evaluation/generate_dataset.py`
- `experiments/audit-evaluation/evaluate.py`
- `experiments/audit-evaluation/README.md`

No audit source file will be implemented by CH07-01.

## Actual test results

- Backend pytest: 47 passed
- Backend Ruff: passed
- Backend Black check: passed
- Alembic: `0004_handling_unit_inspections` head, no pending schema changes
- Main frontend Vitest: 56 passed
- Main frontend production build: passed
- Main frontend ESLint: passed
- Standalone 3D Vitest: 19 passed
- Standalone 3D TypeScript lint: passed
- Standalone 3D build: passed
- CI workflow YAML: parsed successfully

Known warnings:

- One Starlette/FastAPI `httpx2` deprecation warning remains.
- The standalone 3D build emits a large-chunk warning.
- The standalone Vite configuration emits a future `__dirname` warning.
- The integrated 3D lazy chunk exceeds the 500 kB warning threshold.

## Remaining blockers

- Audit data models and reconciliation are absent.
- Audit UI is empty.
- No synthetic observation import workflow exists.
- No real sponsor baseline or IN3 data is validated.
- RAG ingestion/retrieval is unverified.
- No authenticated operator identity or notification delivery exists.
- PostgreSQL parity is not yet validated.

## Next implementation

CH07-A1 should implement one narrow vertical slice:

1. audit session
2. batch observations
3. deterministic reconciliation
4. persisted finding
5. supervisor review status without stock mutation

Stop for review before implementing CH07-A1.
