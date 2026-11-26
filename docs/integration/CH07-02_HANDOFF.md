# WARETRACE CH07-02 HANDOFF

## Result

Implemented one backend-only inventory audit workflow:

**Start audit → capture manual/CSV observations → compare against a frozen
expected-stock snapshot → persist findings → review and resolve findings.**

Audits never update `expected_inventory`, handling units, or warehouse
movements. No frontend or RAG code was changed.

## Repository state

- Branch: `focus/challenge07-audit-intelligence`
- HEAD: `719d503d54798f22f056dc28982f5cfb9483ebee`
- Existing CH07-01 changes remain uncommitted and preserved.
- CH07-02 changes are also uncommitted. No commit, push, deployment, or local
  application-database migration was performed.

## CH07-02 files

- `backend/alembic/versions/0005_inventory_audits.py` — forward-only migration
- `backend/app/models/audit.py` — audit, snapshot, observation, finding and
  action models
- `backend/app/models/__init__.py` — model registration
- `backend/app/schemas/audit.py` — request/response validation
- `backend/app/services/reconciliation.py` — snapshots, CSV validation,
  comparison, idempotency and review transitions
- `backend/app/api/v1/audits.py` — audit endpoints
- `backend/app/api/v1/router.py` — route registration
- `backend/tests/api/test_audits.py` — end-to-end audit API tests
- `docs/integration/CH07-02_HANDOFF.md` — this handoff

Historical migrations and the pre-existing inventory services were not changed.

## Persistence and comparison rules

The migration adds:

1. `inventory_audit` — warehouse, starter, required `OPERATIONAL` or
   `SIMULATED` classification, request key, state and snapshot time.
2. `inventory_audit_snapshot` — expected inventory row ID, bin/SKU IDs,
   expected quantity and revision at audit start.
3. `stock_observation` — one observation per audit/bin/SKU pair, actor,
   `MANUAL`/`CSV` source and optional exact handling-unit codes.
4. `audit_finding` — comparison result or sufficiently identified HU anomaly.
5. `audit_finding_action` — append-only review/resolution history with actor,
   action, transition, note and timestamp.

Snapshot rows exist for expected inventory records present at audit start. For
an observed bin/SKU pair absent from that snapshot, the expected quantity is
zero at the snapshot time. An **omitted observation is never converted to zero**
and produces no finding.

For each submitted observation:

`discrepancy_qty = observed_qty - snapshot_expected_qty`

- Negative: `MISSING`
- Positive: `EXCESS`
- Zero: `MATCH`

Comparison rejects with `409` if the expected inventory row for an observed
pair was inserted, deleted, replaced, or its quantity/revision changed after
the snapshot. The audit remains open with no partial findings, so the operator
must start a fresh audit against the new baseline.

An unregistered-HU finding requires an exact supplied HU code absent from the
registered records. A misplaced-HU finding requires an exact registered HU
code, matching SKU, and a recorded bin different from the observed bin. A code
whose registered SKU does not match is not classified as misplaced.

## API contracts

All routes are under `/api/v1`.

| Method and path | Contract |
|---|---|
| `POST /audits` | Start audit. Body: `warehouse_id`, unique `request_key`, `started_by`, required `classification`. Returns `201` and snapshot metadata. |
| `GET /audits?warehouse_id=...` | List up to 100 newest audits; warehouse filter optional. |
| `GET /audits/{audit_id}` | Read audit and its data classification/state. |
| `GET /audits/{audit_id}/snapshot` | Read the immutable expected-stock snapshot captured when the audit started. |
| `POST /audits/{audit_id}/observations` | Add one manual observation. Body: `bin_id`, `sku_id`, nonnegative `observed_qty`, `observed_by`, optional `handling_unit_codes`. |
| `POST /audits/{audit_id}/observations/import` | Multipart CSV import; fields `observed_by` and `file`. Required CSV columns: `bin_id,sku_id,observed_qty`; optional `handling_unit_codes` uses `|` between codes. |
| `GET /audits/{audit_id}/observations` | Read observations, including source and inherited `OPERATIONAL`/`SIMULATED` classification. |
| `POST /audits/{audit_id}/compare` | Generate findings. Repeating after success returns the same comparison. |
| `GET /audits/{audit_id}/findings` | Read stock and HU findings. |
| `POST /audits/{audit_id}/findings/{finding_id}/actions` | Body: `action` (`REVIEW` or `RESOLVE`), `actor`, optional `note`. Only `OPEN → REVIEWED → RESOLVED` is accepted. |
| `GET /audits/{audit_id}/findings/{finding_id}/actions` | Read append-only action history. |

Unknown warehouse/bin/SKU/finding references return `404`; invalid input returns
`422`; duplicate records, invalid state transitions and stale snapshots return
`409`. CSV files are UTF-8, at most 2 MiB and 5,000 data rows; all rows are
validated before the batch is committed.

### Idempotency

- `request_key` is globally unique; reusing it returns `409`.
- A bin/SKU pair can be observed only once within an audit. Manual duplicates,
  duplicate CSV rows, and re-imports return `409`; they never overwrite counts.
- CSV import is one transaction. Invalid references or a duplicate reject the
  entire batch.
- Finding keys are unique within an audit. A successful comparison freezes the
  audit and subsequent compare calls return persisted findings instead of
  creating duplicates.
- Review actions are append-only. A repeated or out-of-order action returns
  `409`; action history remains queryable.

## Reproducible synthetic example

Run the backend locally, then use existing catalog endpoints to obtain the
`RIX-DEMO` warehouse ID, the `A-01` bin ID and the `SKU-001` ID. The demo seed
has expected quantity `8` for that pair.

```powershell
$base = "http://127.0.0.1:8000/api/v1"
$warehouseId = "<RIX-DEMO warehouse UUID>"
$binId = "<A-01 bin UUID>"
$skuId = "<SKU-001 UUID>"

$audit = Invoke-RestMethod -Method Post -Uri "$base/audits" `
  -ContentType "application/json" `
  -Body (@{
    warehouse_id = $warehouseId
    request_key = "ch07-02-synthetic-run-001"
    started_by = "demo-operator"
    classification = "SIMULATED"
  } | ConvertTo-Json)

Invoke-RestMethod -Method Post `
  -Uri "$base/audits/$($audit.id)/observations" `
  -ContentType "application/json" `
  -Body (@{
    bin_id = $binId
    sku_id = $skuId
    observed_qty = 0
    observed_by = "demo-counter"
    handling_unit_codes = @()
  } | ConvertTo-Json)

Invoke-RestMethod -Method Post -Uri "$base/audits/$($audit.id)/compare"
Invoke-RestMethod -Method Get -Uri "$base/audits/$($audit.id)/findings"
```

Expected result: a `MISSING` finding with `expected_qty = 8`,
`observed_qty = 0`, and `discrepancy_qty = -8`. The observation response and
audit both identify the data as `SIMULATED`. Reviewing is performed with a
`REVIEW` action by a named actor, followed by `RESOLVE` when appropriate.
Neither action nor comparison changes expected stock.

## Validation results

- Backend: **54 passed**, one existing Starlette/httpx deprecation warning.
- Ruff: passed for `backend/app`, `backend/alembic`, and `backend/tests`.
- Black check: passed for the same paths.
- Alembic: a disposable SQLite database was upgraded from
  `0004_handling_unit_inspections` to `0005_inventory_audits`; current revision
  was `0005_inventory_audits (head)` and `alembic check` reported no pending
  schema changes.
- The project’s local database was inspected and remains at
  `0004_handling_unit_inspections`; it was intentionally not migrated.
- `git diff --check`: passed.
- Frontend tests/build were not rerun because no frontend files were changed.

Reproduce the backend checks from the repository root:

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
& .\backend\.venv\Scripts\python.exe -m ruff check backend\app backend\alembic backend\tests
& .\backend\.venv\Scripts\python.exe -m black --check backend\app backend\alembic backend\tests
```

The migration is forward-only. Its `downgrade()` intentionally raises instead
of dropping audit evidence.

## Security and remaining blockers

- Writes use the existing production-mode guard. With
  `WARETRACE_ENVIRONMENT=production`, audit creation, observation, comparison
  and review writes return `403`. Local development remains unauthenticated.
- `started_by`, `observed_by` and review `actor` are supplied strings, not
  authenticated identities. The API does not prove a reviewer is a supervisor.
  Add authentication/authorization and trusted actor identity before any public
  deployment or operational use.
- CSV content is validated but not retained as an uploaded file; row values and
  actor/source are persisted.
- Validation used SQLite. PostgreSQL behavior, concurrency/load, UI integration
  and hosted CI execution remain unverified.
- No stock auto-adjustment, movement registration, notification, or frontend
  work was added. CH07-02 is complete for review; do not begin frontend work
  until approved.
