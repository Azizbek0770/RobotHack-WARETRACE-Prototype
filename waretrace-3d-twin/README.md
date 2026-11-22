# WARETRACE — Interactive Warehouse Digital Twin Module

Standalone, embeddable **React 19 + TypeScript + Three.js (`@react-three/fiber` / `@react-three/drei`)** 3D warehouse digital twin visualization module designed to plug cleanly into an existing WARETRACE warehouse intelligence frontend.

---

## Key Capabilities

- **Real Procedural 3D WebGL Warehouse**: Industrial troweled concrete floor, cutaway corrugated walls, steel I-beam columns, overhead roof trusses, high-bay LED fixtures, loading dock doors (`DOCK 01`, `DOCK 02`), multi-tier steel storage racks, EUR wooden pallets, corrugated cardboard parcels with shipping labels, and a fenced caution-striped quarantine enclosure.
- **Zone-Local Coordinate Transformation**: Treats WARETRACE `(grid_x, grid_y)` coordinates strictly as local to each zone, transforming each zone independently into 3D world space.
- **Accurate WARETRACE Data Contract (`RIX-DEMO`)**:
  - 3 Zones (`RECV`, `ST-A`, `QUAR`) and 12 configured bins (`RCV-01..02`, `A-01..08`, `QA-01..02`), each with 30-unit synthetic capacity.
  - 8 expected inventory records totaling **55 expected stored units**.
  - Tracks non-stock handling units separately (`HU-0009` RECEIVED unassigned qty 2, `HU-0010` QUARANTINED at `QA-01` qty 1) without inflating expected stored stock.
- **Strict Live API Honesty**: Consumes `/api/v1/warehouses`, `/api/v1/warehouses/{id}/zones`, `/api/v1/zones/{id}/bins`, and `/api/v1/inventory/expected?warehouse_id={id}` with full multi-page pagination and `AbortController` support. Live API failures are surfaced transparently and never disguised with synthetic fallback data.
- **Optional Native WebSocket Adapter**: Disabled by default (`VITE_WAREHOUSE_WS_URL` unset). Supports schema validation, active warehouse filtering, duplicate `event_id` and monotonic `version` guards, exponential backoff with jitter, and authoritative REST reconciliation on reconnect.
- **Performance Optimized**: Uses `frameloop="demand"`, shared procedural textures with proper disposal, software-WebGL detection, and a `High / Lite` rendering quality toggle.

---

## Visualization Assumptions

Physical dimensions in `src/data/warehouseCoordinates.ts` (`WAREHOUSE_VISUALIZATION_ASSUMPTIONS`) are **illustrative visualization assumptions**, not measured architectural specifications of the facility:

- Floor slab: `36m × 22m`
- Cutaway wall height: `7.4m`
- Storage rack bay: `2.5m × 1.75m × 3.6m`
- Forklift aisle width between storage rows: `~3.65m`

---

## Local Setup (Windows PowerShell)

After extracting `WARETRACE-Warehouse-3D-Module.zip`:

```powershell
# 1. Open the extracted folder
cd .\waretrace-warehouse-3d

# 2. Install dependencies
npm install

# 3. Run unit tests (Vitest)
npm run test

# 4. Build production bundle
npm run build

# 5. Start local development server (http://localhost:3000)
npm run dev
```

To point Live API mode at a local WARETRACE FastAPI backend, copy `.env.example` to `.env.local` and configure `VITE_API_BASE_URL` (and optionally a Vite `/api` proxy — see `INTEGRATION.md`).

---

## Architecture Overview

```text
src/
├── index.ts                      # Public barrel export for host WARETRACE integration
├── main.tsx                      # Standalone demo entry
├── App.tsx                       # Standalone shell (toolbar, filters, 3D viewer, inspector, status bar)
├── styles.css                    # WARETRACE industrial color tokens & base styles
├── components/
│   ├── Warehouse3DViewer.tsx     # Embeddable core React component
│   ├── WarehouseScene.tsx        # Three.js lighting, PMREM RoomEnvironment, fog, zones
│   ├── WarehouseFloor.tsx        # Concrete slab, cutaway walls, columns, trusses, dock doors
│   ├── WarehouseZone.tsx         # Zone floor pad, quarantine barrier fence, overhead signage
│   ├── WarehouseRack.tsx         # Multi-part composite racks per zone kind
│   ├── WarehouseBin.tsx          # Interactive bin hit-proxy, outline, hover badge, red inaccessible state
│   ├── ParcelMesh.tsx            # Procedural EUR pallets & quantity-driven cardboard boxes
│   ├── SceneCamera.tsx           # Floor-clamped OrbitControls & exponential damping presets
│   ├── WarehouseControls.tsx     # Viewport interaction hint & Zoom-to-Selected button
│   └── warehouseMaterials.ts     # Procedural CanvasTextures, palette, software WebGL detector
├── ui/
│   ├── WarehouseToolbar.tsx      # Top bar (warehouse selector, Demo/Live mode, WS status, camera views)
│   ├── ZoneFilters.tsx           # Left sidebar (bin search, zone visibility, legend)
│   └── BinDetailsPanel.tsx       # Right sidebar (multi-SKU expected inventory, capacity, access)
├── data/
│   ├── contracts.ts              # Raw WARETRACE API & normalized 3D snapshot types
│   ├── demoWarehouse.ts          # Deterministic RIX-DEMO fixture (3 zones, 12 bins, 55 stored units)
│   ├── warehouseCoordinates.ts   # Zone-local grid -> 3D world-space coordinate transforms
│   └── warehouseMapper.ts        # Snapshot normalizer, unit capacity math, lookup utilities
├── services/
│   ├── warehouseProvider.ts      # WarehouseDataProvider interface & typed error class
│   ├── demoProvider.ts           # DemoWarehouseProvider (offline synthetic fixture)
│   ├── apiProvider.ts            # ApiWarehouseProvider (paginated REST adapter)
│   └── realtimeClient.ts         # Optional native WebSocket adapter (proposed future protocol)
└── tests/
    ├── warehouseCoordinates.test.ts
    ├── warehouseMapper.test.ts
    ├── apiProvider.test.ts
    └── realtimeClient.test.ts
```

For step-by-step instructions on embedding this module inside your existing WARETRACE application, see [`INTEGRATION.md`](./INTEGRATION.md).
