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

**This is an early-stage prototype.** The current web app is a foundation
dashboard that checks whether the API is reachable and shows the planned
platform modules. The active API provides health, warehouse catalog, and
handling-unit endpoints. Other workflows appear in the source tree as
development work, but are not all connected to the running application yet.

The dashboard currently labels the project **S00 — Foundation**, with
**S01 — Warehouse Core** as its next milestone. Some warehouse-core data and
API functionality is already present in the backend; the dashboard does not
yet expose it as a complete operator interface.

## What works today

### Web application

- React and TypeScript application served by Vite.
- Shows backend connection status and lets you retry the health check.
- Presents inventory, receiving, repacking, simulation, knowledge, and
  assistant areas as planned capabilities.

### API and data

- FastAPI service with interactive OpenAPI documentation.
- SQLAlchemy data model for warehouses, zones, storage bins, SKUs, handling
  units, expected inventory, and warehouse events.
- Alembic migrations for the warehouse, inventory, and handling-unit event
  tables.
- Read-only catalog endpoints for warehouses, zones, bins, SKUs, and expected
  inventory.
- Handling-unit creation, lookup, movement, and event-history endpoints.
- Version checks and transactional inventory updates for handling-unit moves.
- A synthetic demo warehouse seeder, restricted to development mode.

Handling-unit moves are intentionally constrained: a destination must be an
accessible bin in a storage zone at an active warehouse; cross-warehouse moves
are not supported. Bin capacity currently represents aggregate expected units,
not geometric volume or weight.

### Planned and in-progress areas

The repository also contains early modules and UI screens for receiving and
inspection, repacking, warehouse audits and simulation, vision/OCR, knowledge
retrieval, and an operational assistant. They are not all mounted in the
active API or presented as working flows in the current dashboard. Treat them
as development work rather than released capabilities.

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
  src/app/        Active foundation dashboard
  src/api/        API client and health check
  src/features/   Planned and prototype workflow screens
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
- The active frontend is a connectivity and project-status dashboard, not yet
  a complete warehouse operations console.
- Only the health, catalog, and handling-unit routers are registered in the
  active API. Other workflow code is not necessarily reachable through HTTP.
- The demo API has no authentication or authorization. Do not expose it to
  untrusted networks or use it for real operational data.
- The demo seeder creates synthetic data; it is not an import pipeline for
  production inventory.
- A containerized deployment is not currently configured.

## About

Built by **Azizbek0770**.

- GitHub: [@Azizbek0770](https://github.com/Azizbek0770)
- Instagram: [@abrideout](https://www.instagram.com/abrideout/)