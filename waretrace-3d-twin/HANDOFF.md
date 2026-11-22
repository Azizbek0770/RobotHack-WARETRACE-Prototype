# WARETRACE 3D Warehouse Digital Twin — Engineering Handoff Guide

> **Audience:** Next coding agent or frontend engineer integrating this standalone 3D warehouse visualization module into the main **WARETRACE** React + FastAPI repository.
> **Scope of this deliverable:** Standalone, embeddable 3D warehouse digital twin (`waretrace-warehouse-3d`). It intentionally contains **no backend**, **no inventory mutation/CRUD**, **no auth UI**, and **no AI/RAG features**.

---

## 1. Executive Summary & Architectural Design

This module renders a real-time, interactive **Three.js / React Three Fiber** 3D digital twin of a WARETRACE warehouse. It was engineered around strict separation of concerns so you can embed `<Warehouse3DViewer />` into an existing WARETRACE route/tab without duplicating your API client, breaking existing navigation, or coupling Three.js components to raw backend HTTP schemas.

### Layered Architecture

1. **Contracts & Pure Domain Logic (`src/data/`)** — Zero React or Three.js dependencies.
   - `contracts.ts` — Raw FastAPI response shapes (`Warehouse`, `Zone`, `StorageBin`, `ExpectedInventory`, `PaginatedResponse<T>`) + normalized domain types (`WarehouseSnapshot`, `NormalizedZone`, `NormalizedBin`, `WarehouseStats`, `HandlingUnitNote`) + proposed WebSocket contract (`WarehouseRealtimeEvent`, `WarehouseRealtimeClient`).
   - `warehouseCoordinates.ts` — Zone-local `(grid_x, grid_y)` to 3D world-space `(x, y, z)` transformation engine and explicit `WAREHOUSE_VISUALIZATION_ASSUMPTIONS`.
   - `warehouseMapper.ts` — Pure normalizer (`buildWarehouseSnapshot`), unit-based capacity math (`calculateCapacityUtilization`), multi-SKU bin aggregation, and search/lookup helpers (`findBinById`, `findBinByCode`, `searchBins`).
   - `demoWarehouse.ts` — Deterministic `RIX-DEMO` offline fixture (3 zones, 12 bins, 55 expected stored units, plus 2 separate non-stock handling units `HU-0009` and `HU-0010`).

2. **Data & Sync Boundary (`src/services/`)** — Provider abstraction so the 3D scene never touches `fetch` or raw JSON directly.
   - `warehouseProvider.ts` — `WarehouseDataProvider` interface and structured `WarehouseProviderError` (`NETWORK_ERROR | HTTP_ERROR | NOT_FOUND | INVALID_RESPONSE | ABORTED`).
   - `apiProvider.ts` — Production REST adapter targeting WARETRACE FastAPI endpoints with full multi-page pagination and `AbortController` propagation.
   - `demoProvider.ts` — Offline fixture provider implementing the identical `WarehouseDataProvider` interface.
   - `realtimeClient.ts` — Optional native `WebSocket` adapter (`WebSocketWarehouseRealtimeClient`), disabled by default, supporting runtime schema validation, active warehouse ID filtering, duplicate `event_id` suppression, monotonic per-entity `version` protection, exponential backoff with jitter, and REST reconciliation on reconnect.

3. **3D Visualization Layer (`src/components/`)** — Procedural WebGL geometry (zero external `.glb`, `.hdr`, or texture URLs).
   - `Warehouse3DViewer.tsx` — **Primary integration entry point.** Manages snapshot loading via `dataProvider`, optional `realtimeClient` invalidation -> REST re-fetch, WebGL context-loss recovery, and honest error display.
   - `WarehouseScene.tsx` — Procedural `RoomEnvironment` PMREM reflections, warm/cool 3-point industrial lighting, horizon fog, and zone filtering.
   - `WarehouseFloor.tsx` — Troweled concrete floor slab, cutaway North/West walls, structural columns, cantilevered North eave roof trusses, high-bay LEDs, and `DOCK 01` / `DOCK 02` loading doors.
   - `WarehouseZone.tsx` — Color-coded zone pads (`RECV` cyan `#35D6F2`, `ST-A` muted steel-green `#5EA88A`, `QUAR` amber `#FFB547`), quarantine safety fence + caution striping, overhead & floor zone signage, and unassigned receiving staging pallets.
   - `WarehouseRack.tsx` — Multi-part composite racks tailored per `ZoneKind`.
   - `WarehouseBin.tsx` — Drag-safe raycasting hit proxy (ignores OrbitControls drags `> 6px`), luminous `#407BFF` electric-blue selected outline, `#35D6F2` hover highlight + hover-only tooltip, and unmistakable `#EF4444` red inaccessible bar/frame.
   - `ParcelMesh.tsx` — Composite wooden EUR pallets + quantity-driven corrugated cardboard boxes with shipping labels, plus amber-banded quarantine crates (`HU-0010`).
   - `SceneCamera.tsx` — `OrbitControls` with strict floor-clipping guards (`maxPolarAngle`, `target.y >= 0.4`, `camera.y >= 1.15`), exponential damping (`THREE.MathUtils.damp`), adaptive mobile/square framing, and immediate cancellation on manual drag.
   - `warehouseMaterials.ts` — Procedural `CanvasTexture` generators (albedo in `SRGBColorSpace`, bump in linear space, anisotropy clamped) and software-WebGL detection (`isSoftwareWebGL()`).

4. **Reference UI Chrome (`src/ui/` + `src/App.tsx`)** — Optional standalone shell (`WarehouseToolbar`, `ZoneFilters`, `BinDetailsPanel`). You can either reuse these directly inside a WARETRACE page or replace them with WARETRACE's native UI components while keeping `<Warehouse3DViewer />`.

---

## 2. Critical Invariants (DO NOT BREAK During Integration)

When integrating into WARETRACE, preserve these exact behavioral invariants:

1. **Zone-Local Coordinates Are Never Global:**
   - Database `(grid_x, grid_y)` values are local to each zone.
   - Always route bins through `computeZoneLocalOrigin()` + `zoneLocalGridToWorld()` in `warehouseCoordinates.ts`. Never plot raw `(grid_x, grid_y)` directly as global `(x, z)` coordinates.
2. **Never Silently Fall Back to Demo Data on Live API Failure:**
   - If `ApiWarehouseProvider` fails (404, 500, CORS, auth 401, timeout), the error MUST remain visible to the user and the scene/stats MUST clear rather than displaying synthetic `RIX-DEMO` stock.
3. **Pagination Must Fetch All Pages:**
   - Both `/api/v1/warehouses` and `/api/v1/inventory/expected?warehouse_id=...` return `{ items, page, page_size, total }`. Keep `fetchAllPages` (or replicate its loop in your host adapter) so inventory beyond page 1 is never silently dropped.
4. **Multiple SKUs Per Bin & Unknown Capacity (`null`):**
   - Never assume 1 SKU per bin—`NormalizedBin.inventoryLines` is always an array.
   - Utilization is strictly **unit-based** (`totalExpectedUnits / capacityUnits * 100`), never physical volume. When `capacity_units === null`, display `"Not specified"`.
5. **Non-Stock Handling Units Are Excluded from Expected Stored Stock:**
   - Unassigned `RECEIVED` HUs (e.g., `HU-0009`) and `QUARANTINED` HUs (e.g., `HU-0010`) must never be added into `stats.expectedStoredUnits`.
6. **WebSocket Payloads Are Invalidation Signals, Not Authoritative State:**
   - Never mutate inventory directly from a WebSocket payload. `Warehouse3DViewer` intentionally treats validated WebSocket events and reconnect events as triggers to re-fetch authoritative REST records via `dataProvider`.
   - Keep WebSocket **disabled by default** until a real WARETRACE backend WS endpoint is implemented and `VITE_WAREHOUSE_WS_URL` is explicitly configured.
7. **Performance & On-Demand Rendering:**
   - Keep `<Canvas frameloop="demand" ...>` in `Warehouse3DViewer.tsx` and never apply CSS `backdrop-filter` / `backdrop-blur` over the WebGL canvas. This keeps CPU/GPU usage low on Windows development laptops and headless/VDI environments.
8. **Visualization Assumptions Must Stay Labeled:**
   - Physical floor/rack/aisle dimensions in `WAREHOUSE_VISUALIZATION_ASSUMPTIONS` are illustrative defaults. If WARETRACE later adds real facility geometry fields to its database, override `zoneTransformOverrides` in `buildWarehouseSnapshot()` cleanly without breaking the fallback defaults.

---

## 3. Step-by-Step Host Integration Plan (Recommended Order)

Follow this incremental, reversible sequence in the target WARETRACE repository:

### Step 1 — Check Host React & Tailwind Versions
Inspect the host WARETRACE `frontend/package.json`:
- **React 19 host:** Install `three`, `@react-three/fiber@^9`, `@react-three/drei@^10`, `lucide-react`, and devDependencies `@types/three`, `vitest`.
- **React 18 host:** Install `three`, `@react-three/fiber@^8.17.10`, `@react-three/drei@^9.120.4`, `lucide-react`, and devDependencies `@types/three`, `vitest`.
- **Styling:** Components use standard Tailwind utility classes (`#091321`, `#0D1B2E`, `#142439`, `#35D6F2`, `#407BFF`, `#FFB547`). If the host uses Tailwind v3 instead of v4, verify arbitrary hex colors work (they do in Tailwind v3.0+) and copy the `.wt-scroll` scrollbar helper from `src/styles.css` into the host's global CSS.

### Step 2 — Copy Module Files Into an Isolated Feature Folder
Copy `src/index.ts`, `src/data/`, `src/services/`, `src/components/`, `src/ui/` (optional), and `src/tests/` into:
```text
frontend/src/features/warehouse-3d/
```
*(Or `frontend/src/three/` if your host project uses that convention—all internal imports inside this module are relative, so moving the folder requires zero import path rewrites!)*

### Step 3 — Wire Host Authentication & Existing API Client
Do **not** hardcode `http://localhost:8000` inside components. Choose one of two clean options:
- **Option A (Fastest — Inject Host `fetch` / Headers into `ApiWarehouseProvider`):**
  ```ts
  const provider = new ApiWarehouseProvider({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    // Or pass custom fetchFn that refreshes tokens / attaches cookies:
    fetchFn: (input, init) => fetch(input, { ...init, credentials: 'include' }),
  });
  ```
- **Option B (Zero Duplication — Wrap Host Axios/TanStack Client):**
  Implement `WarehouseDataProvider` calling your existing host API client methods and returning `buildWarehouseSnapshot({ warehouse, zones, bins, expectedInventory, source: 'api' })`. See `INTEGRATION.md` Section 5 for the exact template.

### Step 4 — Verify Vite Dev Proxy & FastAPI CORS
Ensure the host `vite.config.ts` proxies `/api` to FastAPI (e.g., `http://127.0.0.1:8000`) and verify the 4 live endpoints match exact response contracts:
- `GET /api/v1/warehouses?page=1&page_size=50` -> `{ items: Warehouse[], page, page_size, total }`
- `GET /api/v1/warehouses/{warehouse_id}/zones` -> `Zone[]`
- `GET /api/v1/zones/{zone_id}/bins` -> `StorageBin[]`
- `GET /api/v1/inventory/expected?warehouse_id={warehouse_id}&page=1&page_size=100` -> `{ items: ExpectedInventory[], page, page_size, total }`

> **Watch out for subtle backend schema differences:**
> Check whether the real FastAPI backend returns `zone.kind` in UPPERCASE (`"RECEIVING" | "STORAGE" | "QUARANTINE"`) or lowercase. If lowercase, normalize `.toUpperCase()` inside your host adapter before calling `buildWarehouseSnapshot()`.
> Also check whether `expected_inventory` items always embed nested `sku` and `bin` objects or if an alternate query param (`include=sku,bin`) is required.

### Step 5 — Mount `<Warehouse3DViewer />` in a Dedicated Route/Tab
Give the parent container an explicit non-zero height (`h-[calc(100vh-4rem)]` or `flex-1 min-h-0`)—a Three.js `<Canvas>` inside a `height: auto` parent will collapse to `0px`!

```tsx
<Warehouse3DViewer
  warehouseId={activeWarehouseId}
  dataProvider={provider}
  realtimeClient={optionalRealtimeClient}
  selectedBinId={selectedBinId}
  onBinSelect={(bin) => {
    setSelectedBinId(bin?.id ?? null);
    // Sync with host WARETRACE inventory table / side drawer
  }}
  onSnapshotChange={(snapshot) => {
    // Optional: read snapshot.stats for host header KPIs
  }}
/>
```

### Step 6 — Disable Demo Mode in Production (Optional)
If production builds should never expose synthetic fixtures:
1. Mount `<Warehouse3DViewer />` strictly with your live `WarehouseDataProvider`.
2. Omit `DemoWarehouseProvider` and `demoWarehouse.ts` from production routes (or gate Demo mode behind `import.meta.env.DEV`).

### Step 7 — Activate Real-Time WebSocket Sync (Future Backend Milestone)
When the FastAPI backend implements the warehouse WebSocket broadcast channel:
1. Set `VITE_WAREHOUSE_WS_URL` (e.g., `wss://host/ws/warehouse`).
2. Confirm the backend emits the proposed JSON envelope (`event_id`, `type`, `warehouse_id`, `entity_id`, `version`, `timestamp`, `payload`) and accepts `?warehouse_id=<uuid>` (or update `buildWarehouseSocketUrl()` in `src/services/realtimeClient.ts` to match your backend's URL path format, e.g., `/ws/warehouses/{warehouse_id}`).
3. Pass `new WebSocketWarehouseRealtimeClient({ url, enabled: true })` to `<Warehouse3DViewer />`.

---

## 4. Verification Status & Test Commands

Before handoff, this standalone module was verified end-to-end:

- **Unit Tests (`npm run test` — Vitest):** **4 test files / 19 tests passing**
  - `src/tests/warehouseCoordinates.test.ts` (5 tests): zone-local origin isolation, distinct world placement across zones, non-zero local offsets, 90° bay rotation, multi-zone same-kind offsetting & bounds.
  - `src/tests/warehouseMapper.test.ts` (5 tests): `RIX-DEMO` exact 3 zones / 12 unique UUID bins / 55 expected stored units, `HU-0009` & `HU-0010` exclusion, `A-01` capacity math (`26.7%`), `null` capacity -> `"Not specified"`, multi-SKU bin aggregation, inaccessible bin tracking, bin/SKU search.
  - `src/tests/apiProvider.test.ts` (4 tests): multi-page pagination across `/warehouses` & `/inventory/expected`, HTTP error propagation (zero silent demo fallback), missing warehouse `NOT_FOUND`, `AbortController` cancellation.
  - `src/tests/realtimeClient.test.ts` (5 tests): schema validation, disabled/unconfigured safety, warehouse ID filtering + duplicate `event_id` + stale `version` suppression, exponential backoff with jitter + REST reconciliation on reconnect, socket/timer cleanup on disconnect & warehouse switch.
- **TypeScript (`npm run lint` -> `tsc --noEmit`):** 0 errors.
- **Production Build (`npm run build` -> `vite build`):** Succeeds cleanly.
- **Live Browser Verification (Headless Chromium):** Verified desktop (`1440×900`) Isometric, Bin Selection (`A-01`, `QA-01`), Top-Down view, Live API honest error overlay, and Mobile (`390×844`) responsive layout.

### Quick Verification Commands After Integration
```powershell
npm run test
npm run lint
npm run build
```

---

## 5. Known Notes & Minor Things to Watch

1. **Three.js `THREE.Clock` deprecation warning:** Three.js `r187` logs a harmless console warning inside `@react-three/fiber` (`THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`). This originates inside `@react-three/fiber` internals and has zero runtime impact.
2. **Downloadable Export Link in Standalone `App.tsx`:** The standalone `App.tsx` footer includes an `Export ZIP` link pointing to `/WARETRACE-Warehouse-3D-Module.zip` (served from `public/`). Remove that standalone footer link when embedding inside the host WARETRACE application.
3. **Custom Multi-Zone Layouts on Large Live Warehouses:** `resolveZoneTransform()` currently places the first `RECEIVING`, `STORAGE`, and `QUARANTINE` zones side-by-side (`X = -12.6, -4.8, +11.4`) and offsets any additional zones of the same kind by `+11.5m` along `Z`. If a real warehouse has > 4 columns in `ST-A` or > 2 zones of the same kind, adjust `DEFAULT_ZONE_TRANSFORMS` or pass `zoneTransformOverrides` to `buildWarehouseSnapshot()` and widen `WAREHOUSE_VISUALIZATION_ASSUMPTIONS.floorWidthMeters` / `floorDepthMeters` accordingly.
