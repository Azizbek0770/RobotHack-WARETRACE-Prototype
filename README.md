# WARETRACE

### Warehouse intelligence, built on records you can trust.

WARETRACE is a warehouse-operations prototype focused on making inventory,
handling units, and their movement easier to understand and verify. The idea is
simple: useful automation starts with reliable operational data. Robots are
helpful; robots with trustworthy inventory are considerably less surprising.

I’m building WARETRACE as a practical foundation for warehouse visibility,
traceability, and decision support—not as a claim that every planned workflow
is already production-ready.

## Project status

### Challenge 07 MVP focus

WARETRACE is currently being simplified around one hackathon problem:
inventory discrepancies and costly manual investigations. The MVP uses
persisted expected inventory and separately labeled synthetic or imported
observations to prioritize explainable discrepancies. It does not silently
correct stock or claim that a robot, RAG system or external WMS is complete.

Available workflows include warehouse catalog, handling units, barcode
identification, quality inspection, read-only 3D visualization, and inventory
audits. The audit workflow records manual or CSV observations against an
immutable expected-stock snapshot, then supports deterministic findings and
supervisor review without automatically changing inventory. Robot automation,
RAG retrieval and repackaging remain incomplete.

**This is an early-stage prototype.** The current web app is a foundation
dashboard with live warehouse metrics and operational screens. The active API
provides health, warehouse catalog, handling-unit, inspection, and inventory
audit endpoints. Some experimental modules remain source-only or require
further verification; check the status labels in the app before treating them
as operational features.

## What works today

### Web application

- React and TypeScript application served by Vite.
- Shows backend connection status and lets you retry the health check.
- Provides inventory, handling-unit, scan/identify, inspection, and inventory
  audit screens alongside the read-only 3D warehouse view.
- The audit screen supports SIMULATED or OPERATIONAL sessions, manual counts,
  validated CSV import, snapshot comparison, finding evidence, and recorded
  supervisor review/resolution.
- Non-matching audit findings highlight their persisted bin IDs in the 3D view.

### API and data

- FastAPI service with interactive OpenAPI documentation.
- SQLAlchemy data model for warehouses, zones, storage bins, SKUs, handling
  units, expected inventory, and warehouse events.
- Alembic migrations for the warehouse, inventory, and handling-unit event
  tables.
- Read-only catalog endpoints for warehouses, zones, bins, SKUs, and expected
  inventory.
- Handling-unit creation, lookup, movement, and event-history endpoints.
- Audit sessions, immutable expected-stock snapshots, observations,
  deterministic findings, and append-only supervisor actions.
- Version checks and transactional inventory updates for handling-unit moves.
- A synthetic demo warehouse seeder, restricted to development mode.

Handling-unit moves are intentionally constrained: a destination must be an
accessible bin in a storage zone at an active warehouse; cross-warehouse moves
are not supported. Bin capacity currently represents aggregate expected units,
not geometric volume or weight.

### Planned and in-progress areas

The repository also contains early work for robot automation, repacking,
vision/OCR, knowledge retrieval, and an operational assistant. Treat these as
development work rather than released capabilities.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI, Pydantic |
| Persistence | SQLAlchemy, Alembic; SQLite by default |
| PostgreSQL support | Psycopg driver is included; configure a database URL to use it |
| Tests and quality | pytest, Vitest, Ruff, Black, ESLint, TypeScript |

## Run locally

### Requirements

- Python 3.11 or newer
- Node.js and npm compatible with the versions in `frontend/package-lock.json`
- PowerShell on Windows (commands below use PowerShell syntax)

The default database is a local SQLite file at `backend/.local/waretrace.sqlite3`.
The development frontend runs on port `5173` and proxies `/api` requests to the
backend at `http://127.0.0.1:8000`.

### 1. Install backend dependencies

Run these commands from the repository root:

```powershell
py -3.11 -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install --upgrade pip
.\backend\.venv\Scripts\python.exe -m pip install -e "backend[dev]"
```

### 2. Create and seed the local database

```powershell
Push-Location backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.db.seed_demo
Pop-Location
```

The seed command creates synthetic demo data only when the demo warehouse is
not already present. It refuses to run unless
`WARETRACE_ENVIRONMENT=development`.

### 3. Start the API

In a PowerShell terminal:

```powershell
Push-Location backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Keep this terminal open while using the app. The API health check is available
at `http://127.0.0.1:8000/api/v1/health`; interactive API documentation is at
`http://127.0.0.1:8000/docs`.

### 4. Start the frontend

In a second terminal from the repository root:

```powershell
Push-Location frontend
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The Vite
development server forwards `/api` requests to the backend.

## Configuration

Settings are read from environment variables prefixed with `WARETRACE_`.
The backend also reads a root-level `.env` file when present. `.env.example`
shows the development, API-prefix, and CORS settings; keep local secrets and
credentials out of version control.

| Variable | Purpose | Default |
| --- | --- | --- |
| `WARETRACE_ENVIRONMENT` | Runtime environment (`development`, `test`, or `production`) | `development` |
| `WARETRACE_API_PREFIX` | Prefix for API routes | `/api/v1` |
| `WARETRACE_CORS_ORIGINS` | JSON array of allowed browser origins | `http://localhost:5173`, `http://127.0.0.1:5173` |
| `WARETRACE_DATABASE_URL` | SQLAlchemy database URL | Local SQLite database |
| `VITE_API_BASE_URL` | Frontend API base URL | `/api/v1` |

For example, set `WARETRACE_DATABASE_URL` in the environment before starting
the backend to point SQLAlchemy at a different database. Run Alembic migrations
against that same database before starting the application.

## API overview

Unless changed with `WARETRACE_API_PREFIX`, the API base is `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health and version |
| `GET` | `/warehouses` | Paginated warehouse list |
| `GET` | `/warehouses/{warehouse_id}/zones` | Zones for a warehouse |
| `GET` | `/zones/{zone_id}/bins` | Bins for a zone |
| `GET` | `/skus` | Paginated SKU list; supports search |
| `GET` | `/inventory/expected?warehouse_id={uuid}` | Expected inventory for a warehouse |
| `POST` | `/handling-units` | Create a handling unit |
| `GET` | `/handling-units` | Paginated handling-unit list; supports search |
| `GET` | `/handling-units/by-code/{external_code}` | Find a handling unit by external code |
| `GET` | `/handling-units/{hu_id}` | Get a handling unit |
| `POST` | `/handling-units/{hu_id}/move` | Move a handling unit to a storage bin |
| `GET` | `/handling-units/{hu_id}/events` | Paginated handling-unit event history |
| `POST` | `/audits` | Start an audit and capture its expected-stock snapshot |
| `POST` | `/audits/{audit_id}/observations` | Record a manual stock observation |
| `POST` | `/audits/{audit_id}/observations/import` | Import validated CSV observations |
| `GET` | `/audits/{audit_id}/snapshot` | Read the immutable audit-start snapshot |
| `POST` | `/audits/{audit_id}/compare` | Compare observations and create deterministic findings |
| `GET` | `/audits/{audit_id}/findings` | Read discrepancy and handling-unit findings |
| `POST` | `/audits/{audit_id}/findings/{finding_id}/actions` | Record supervisor review or resolution |

Paginated endpoints use `page` and `page_size` query parameters. For exact
request and response schemas, visit `/docs` while the backend is running.

## Data model at a glance

```text
Warehouse
└── Zone
    └── Storage bin
        ├── Handling units
        └── Expected inventory (SKU quantities)

SKU ── Handling units
Handling unit ── Warehouse events
Inventory audit ── Expected-stock snapshot
Inventory audit ── Stock observations ── Findings ── Supervisor actions
```

Warehouse events record creation and movement details, including before/after
state and version information. The API uses version checks to reject stale
handling-unit updates rather than quietly letting the last request win.

## Project layout

```text
backend/
  app/
    api/v1/       Active API routes and additional workflow route modules
    core/         Settings and error handling
    db/           SQLAlchemy session and development demo seeder
    models/       Warehouse and inventory data models
    schemas/      API request and response schemas
    services/     Warehouse operations and prototype services
    knowledge/    Knowledge-retrieval interfaces and adapter
    simulation/   Grid and pathfinding utilities
    vision/       Image decoding and OCR utilities
  alembic/        Database migrations
  tests/          Backend tests
frontend/
  src/app/        Active application shell and navigation
  src/api/        Shared API clients
  src/features/   Dashboard, inventory, audit, inspection, and 3D screens
data/fixtures/    Sample warehouse and inventory data
```

## Tests and checks

From the repository root:

```powershell
Push-Location backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check app tests alembic
.\.venv\Scripts\python.exe -m black --check app tests alembic
Pop-Location
```

Frontend checks:

```powershell
Push-Location frontend
npm test
npm run lint
npm run build
Pop-Location
```

## Current limitations

- This is a prototype, not a production deployment.
- The active frontend includes operational screens, but this is not yet a
  complete warehouse-management system.
- Audit actors are recorded as labels; the demo does not authenticate
  supervisor identities or roles. Do not expose the development API to
  untrusted networks or use it for real operational data.
- The demo seeder creates synthetic data; it is not an import pipeline for
  production inventory.
- A containerized deployment is not currently configured.

## About

Built by **Azizbek0770**.

- GitHub: [@Azizbek0770](https://github.com/Azizbek0770)
- Instagram: [@abrideout](https://www.instagram.com/abrideout/)