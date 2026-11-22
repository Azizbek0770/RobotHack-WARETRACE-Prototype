# WARETRACE 3D Warehouse Module — Integration Guide

This guide explains how to incrementally embed the standalone **WARETRACE 3D Warehouse Digital Twin Module** inside an existing React + TypeScript + Vite WARETRACE frontend without modifying your existing navigation, replacing your API client, or rewriting backend endpoints.

---

## 1. Install Required Dependencies in Your Host React App

Install the Three.js and React Three Fiber packages compatible with React 19:

```powershell
npm install three @react-three/fiber @react-three/drei lucide-react
npm install -D @types/three vitest
```

> **Note for React 18 hosts:** If your existing WARETRACE frontend still runs React 18, install `@react-three/fiber@^8.17.10` and `@react-three/drei@^9.120.4` instead of v9/v10. All application code in `src/data`, `src/services`, `src/components`, and `src/ui` remains compatible.

---

## 2. Copy Source Directories into Your WARETRACE Frontend

Copy the module directories into a dedicated folder inside your host repository (for example `frontend/src/warehouse-3d/`):

```text
frontend/src/warehouse-3d/
├── index.ts
├── components/
│   ├── Warehouse3DViewer.tsx
│   ├── WarehouseScene.tsx
│   ├── WarehouseFloor.tsx
│   ├── WarehouseZone.tsx
│   ├── WarehouseRack.tsx
│   ├── WarehouseBin.tsx
│   ├── ParcelMesh.tsx
│   ├── SceneCamera.tsx
│   ├── WarehouseControls.tsx
│   └── warehouseMaterials.ts
├── data/
│   ├── contracts.ts
│   ├── warehouseCoordinates.ts
│   ├── warehouseMapper.ts
│   └── demoWarehouse.ts          # Optional: omit if disabling demo mode in production
├── services/
│   ├── warehouseProvider.ts
│   ├── apiProvider.ts
│   ├── realtimeClient.ts
│   └── demoProvider.ts           # Optional: omit if disabling demo mode in production
├── ui/                           # Optional: copy if you want the reference toolbar/inspector
│   ├── WarehouseToolbar.tsx
│   ├── ZoneFilters.tsx
│   └── BinDetailsPanel.tsx
└── tests/
    ├── warehouseCoordinates.test.ts
    ├── warehouseMapper.test.ts
    ├── apiProvider.test.ts
    └── realtimeClient.test.ts
```

This layout is **100% isolated and reversible**—removing `frontend/src/warehouse-3d/` leaves the rest of WARETRACE untouched.

---

## 3. Exported TypeScript Types & Functions

Import from `frontend/src/warehouse-3d` (`index.ts`):

- **Core Component**: `Warehouse3DViewer`, `Warehouse3DViewerProps`, `CameraDirective`
- **Data Contracts**: `Warehouse`, `Zone`, `ZoneKind`, `StorageBin`, `ExpectedInventory`, `PaginatedResponse<T>`
- **Normalized Visualization Types**: `WarehouseSnapshot`, `NormalizedZone`, `NormalizedBin`, `NormalizedInventoryLine`, `WarehouseStats`, `HandlingUnitNote`
- **Coordinate Utilities**: `WAREHOUSE_VISUALIZATION_ASSUMPTIONS`, `DEFAULT_ZONE_TRANSFORMS`, `resolveZoneTransform`, `computeZoneLocalOrigin`, `zoneLocalGridToWorld`, `computeZoneWorldBounds`
- **Normalizer & Lookups**: `buildWarehouseSnapshot`, `calculateCapacityUtilization`, `findBinById`, `findBinByCode`, `searchBins`
- **Providers & Realtime**: `WarehouseDataProvider`, `WarehouseProviderError`, `ApiWarehouseProvider`, `DemoWarehouseProvider`, `WarehouseRealtimeClient`, `WarehouseRealtimeEvent`, `WebSocketWarehouseRealtimeClient`, `validateWarehouseRealtimeEvent`

---

## 4. Mount `<Warehouse3DViewer>` Inside an Existing Page

The viewer fills `100%` of its parent container—give the wrapper an explicit height (e.g., `h-[640px]` or `flex-1 min-h-0`):

```tsx
import { useMemo, useState } from 'react';
import {
  ApiWarehouseProvider,
  Warehouse3DViewer,
  type NormalizedBin,
} from './warehouse-3d';

export function WarehouseTwinTab({ warehouseId }: { warehouseId: string }) {
  const [selectedBin, setSelectedBin] = useState<NormalizedBin | null>(null);

  const dataProvider = useMemo(
    () => new ApiWarehouseProvider({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1' }),
    [],
  );

  return (
    <div className="h-[calc(100vh-120px)] w-full">
      <Warehouse3DViewer
        warehouseId={warehouseId}
        dataProvider={dataProvider}
        selectedBinId={selectedBin?.id ?? null}
        onBinSelect={(bin) => setSelectedBin(bin)}
      />
    </div>
  );
}
```

---

## 5. Connect WARETRACE's Existing API Client (Zero Duplication)

If your WARETRACE frontend already has an authenticated Axios or Fetch client, implement `WarehouseDataProvider` as a thin adapter around your existing client—no duplicate HTTP code needed:

```ts
import {
  buildWarehouseSnapshot,
  type ExpectedInventory,
  type StorageBin,
  type Warehouse,
  type WarehouseDataProvider,
  type WarehouseSnapshot,
  type Zone,
} from './warehouse-3d';
import { waretraceApi } from '../api/client'; // Your existing WARETRACE HTTP client

export class HostWaretraceDataProvider implements WarehouseDataProvider {
  readonly source = 'api' as const;
  readonly label = 'WARETRACE API';

  async listWarehouses(signal?: AbortSignal): Promise<Warehouse[]> {
    return waretraceApi.getAllWarehouses({ signal });
  }

  async getWarehouseSnapshot(
    warehouseId: string,
    signal?: AbortSignal,
  ): Promise<WarehouseSnapshot> {
    const [warehouse, zones, expectedInventory] = await Promise.all([
      waretraceApi.getWarehouseById(warehouseId, { signal }),
      waretraceApi.getZones(warehouseId, { signal }) as Promise<Zone[]>,
      waretraceApi.getAllExpectedInventory(warehouseId, { signal }) as Promise<ExpectedInventory[]>,
    ]);

    const bins = (
      await Promise.all(
        zones.map((z) => waretraceApi.getZoneBins(z.id, { signal }) as Promise<StorageBin[]>),
      )
    ).flat();

    return buildWarehouseSnapshot({
      warehouse,
      zones,
      bins,
      expectedInventory,
      source: 'api',
    });
  }
}
```

Alternatively, pass your custom `fetch` wrapper (with bearer token injection) directly into `new ApiWarehouseProvider({ baseUrl: '/api/v1', fetchFn: authFetch })`.

---

## 6. Configure the Vite `/api` Dev Proxy

In your host `vite.config.ts`, proxy `/api` to your local FastAPI backend (typically port `8000`) so the browser uses relative `/api/v1` URLs without CORS issues or hardcoded hostnames:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
```

---

## 7. Enable Optional WebSocket Support Later (Once Backend Exists)

WebSocket synchronization is **disabled by default** because the current WARETRACE FastAPI backend does not yet expose a warehouse event stream.

Once your backend publishes events conforming to the proposed contract:

```json
{
  "event_id": "uuid",
  "type": "warehouse.inventory.changed",
  "warehouse_id": "uuid",
  "entity_id": "uuid",
  "version": 2,
  "timestamp": "2026-11-22T12:00:00Z",
  "payload": { "bin_id": "uuid" }
}
```

1. Set `VITE_WAREHOUSE_WS_URL=wss://your-host/ws/warehouse` in your environment.
2. Construct `WebSocketWarehouseRealtimeClient` and pass it into `Warehouse3DViewer`:

```tsx
const realtimeClient = useMemo(
  () =>
    new WebSocketWarehouseRealtimeClient({
      url: import.meta.env.VITE_WAREHOUSE_WS_URL,
      enabled: Boolean(import.meta.env.VITE_WAREHOUSE_WS_URL),
    }),
  [],
);

<Warehouse3DViewer
  warehouseId={warehouseId}
  dataProvider={dataProvider}
  realtimeClient={realtimeClient}
/>;
```

Whenever a valid, non-duplicate, non-stale event arrives for the active `warehouseId` (or after a socket reconnects), `Warehouse3DViewer` automatically invalidates local state and triggers an authoritative REST re-fetch through `dataProvider`.

---

## 8. Disable Standalone Demo Mode in Production

1. Do **not** instantiate `DemoWarehouseProvider` in your production route.
2. Mount `Warehouse3DViewer` directly with your `ApiWarehouseProvider` or `HostWaretraceDataProvider`.
3. Optionally delete `demoWarehouse.ts` and `demoProvider.ts` (and their exports in `index.ts`) so zero synthetic fixtures are bundled into production builds.

---

## 9. Connect Selected-Bin Events to Your Existing Inventory UI

Use `onBinSelect` to synchronize selection with existing WARETRACE inventory tables, drawers, or route query parameters:

```tsx
<Warehouse3DViewer
  warehouseId={warehouseId}
  dataProvider={dataProvider}
  selectedBinId={activeBinId}
  onBinSelect={(bin) => {
    if (!bin) {
      setActiveBinId(null);
      return;
    }
    setActiveBinId(bin.id); // Backend UUID
    // Example: filter your existing expected-inventory table by bin.id or open a drawer
    inventoryStore.highlightBin(bin.id, bin.code);
  }}
/>
```

---

## 10. Run Tests After Integration

Run the copied unit test suite inside your host project to verify coordinate math, inventory mapping, pagination, and WebSocket validation remain intact:

```powershell
npx vitest run src/warehouse-3d/tests
```
