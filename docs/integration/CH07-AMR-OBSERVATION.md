# WARETRACE AMR-assisted observation concept

## Scope

This is a narrow audit-ingestion contract, not a robotics integration. It
records a scanner or explicitly simulated AMR count as an immutable audit
observation. It does not control a robot, move handling units, change expected
inventory, or authenticate a device.

Existing observation sources remain available: `MANUAL` and `CSV`. Device
events add `SCANNER` and `SIMULATED_AMR`.

## Event contract

Submit a JSON body to:

```text
POST /api/v1/audits/{audit_id}/observations/events
```

```json
{
  "source": "SIMULATED_AMR",
  "event_id": "sim-amr-rix-demo-0001",
  "device_id": "sim-amr-01",
  "observed_at": "2026-11-27T07:45:00Z",
  "bin_id": "<bin UUID in the selected audit warehouse>",
  "sku_id": "<registered SKU UUID>",
  "observed_qty": 6,
  "observed_by": "sim-amr-01",
  "handling_unit_codes": []
}
```

Fields:

- `source`: `SCANNER` or `SIMULATED_AMR`; this endpoint does not accept
  `MANUAL`/`CSV`.
- `event_id`, `device_id`: non-empty strings, maximum 120 characters.
- `observed_at`: ISO-8601 datetime with timezone; the API normalizes it to UTC.
- `bin_id`, `sku_id`: existing database UUIDs; bin must belong to the audit's
  warehouse.
- `observed_qty`: integer >= 0.
- `observed_by`: actor label, 3-120 characters.
- `handling_unit_codes`: optional list using existing HU identity validation.

The endpoint returns the persisted `StockObservationRead`, including `source`,
`source_device_id`, `source_event_id`, `source_observed_at`, and inherited audit
`classification`.

Idempotency and validation:

- `event_id` is unique within an audit. Replaying it returns HTTP 409.
- An audit accepts only one observation per bin/SKU pair, regardless of source;
  another event for that pair returns HTTP 409.
- `SIMULATED_AMR` events require an audit classified `SIMULATED`.
- Unknown audit/bin/SKU references return HTTP 404; a bin from another
  warehouse returns HTTP 422.
- Events cannot be added once an audit is compared.
- Writes follow the existing local-development-only operational-write guard.

## Demo

Use the isolated database setup from [CH07-03_HANDOFF.md](./CH07-03_HANDOFF.md)
and start a new `SIMULATED` audit. Get the IDs for bin `A-01` and SKU `SKU-001`
from the UI or catalog API, then use the JSON above with those IDs. In the seeded
demo, expected stock for that pair is 8; an observation of 6 yields a
deterministic `MISSING` finding with delta `-2` after comparison. The bin is
highlighted in the audit's 3D view as soon as the event is loaded. Expected
stock remains 8.

`data/fixtures/simulated_amr_observation.json` is a request-body example; its
bin and SKU placeholders must be replaced with UUIDs from the selected
database. Submit it with PowerShell:

```powershell
$auditId = "<open audit UUID>"
$event = Get-Content data\fixtures\simulated_amr_observation.json -Raw | ConvertFrom-Json
$event.bin_id = "<A-01 UUID from this database>"
$event.sku_id = "<SKU-001 UUID from this database>"
$response = Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/api/v1/audits/$auditId/observations/events" `
  -ContentType "application/json" -Body ($event | ConvertTo-Json)
$response | Select-Object source, source_device_id, source_event_id, observed_qty, classification
```

Return to the audit page and click **Refresh evidence**. The observation
appears with its simulated source and event ID, and the affected bin is
highlighted before comparison. Compare to create the `MISSING -2` finding, then
use the existing supervisor review/resolution flow.

## Real versus simulated

- **Real application behavior:** API validation, audit/bin/SKU foreign-key
  checks, provenance persistence, event replay rejection, deterministic
  reconciliation, and UUID-based 3D highlighting.
- **Simulated:** `SIMULATED_AMR` is only a software event source. No vehicle,
  scanner, sensor or physical stock count is connected.
- **Not verified as hardware provenance:** `SCANNER`, `device_id`, and
  `observed_by` are caller-supplied labels. There is no device authentication,
  message signing, transport protocol, localization, motion planning, or robot
  control. Do not treat these labels as proof of physical observation.

Expected inventory is never updated by this endpoint or by audit comparison.
