import { useEffect, useMemo, useState } from "react";

import {
  ApiWarehouseProvider,
  Warehouse3DViewer,
  type NormalizedBin,
  type WarehouseSnapshot,
} from ".";

export default function Warehouse3DPage() {
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [snapshot, setSnapshot] =
    useState<WarehouseSnapshot | null>(null);
  const [selectedBin, setSelectedBin] =
    useState<NormalizedBin | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  const provider = useMemo(
    () =>
      new ApiWarehouseProvider({
        baseUrl: import.meta.env.VITE_API_BASE_URL || "/api/v1",
        pageSize: 100,
      }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    provider
      .listWarehouses(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setWarehouses(
          items.map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
          })),
        );
        setWarehouseId(items[0]?.id ?? "");
        setLoadingCatalog(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCatalogError(
          error instanceof Error
            ? error.message
            : "Unable to load warehouse catalog.",
        );
        setLoadingCatalog(false);
      });

    return () => controller.abort();
  }, [provider]);

  return (
    <section className="warehouse-page warehouse-twin-page">
      <div className="page-heading warehouse-twin-heading">
        <div>
          <span className="eyebrow">OPERATIONS / LIVE VISUALIZATION</span>
          <h1>3D Warehouse</h1>
          <p>
            Inspect persisted warehouse locations and expected stock.
            This view never changes inventory.
          </p>
        </div>
        <span className="live-label">LIVE API · READ ONLY</span>
      </div>

      {loadingCatalog && (
        <div className="notice" role="status">
          Loading live warehouse catalog…
        </div>
      )}

      {catalogError && (
        <div className="notice notice--error" role="alert">
          {catalogError}
        </div>
      )}

      {!loadingCatalog && warehouses.length > 0 && (
        <div className="warehouse-twin-toolbar">
          <label className="field warehouse-twin-select">
            <span>Warehouse</span>
            <select
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                setSelectedBin(null);
                setSnapshot(null);
              }}
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} · {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          {snapshot && (
            <div
              className="warehouse-twin-stats"
              aria-label="Warehouse 3D metrics"
            >
              <span>{snapshot.stats.totalBins} bins</span>
              <span>
                {snapshot.stats.expectedStoredUnits} expected units
              </span>
              <span>
                {snapshot.stats.occupiedBins} occupied bins
              </span>
            </div>
          )}
        </div>
      )}

      {warehouseId && (
        <div className="warehouse-twin-layout">
          <div className="warehouse-twin-viewport">
            <Warehouse3DViewer
              warehouseId={warehouseId}
              dataProvider={provider}
              selectedBinId={selectedBin?.id ?? null}
              onBinSelect={setSelectedBin}
              onSnapshotChange={setSnapshot}
              realtimeClient={null}
              quality="lite"
              className="warehouse-twin-canvas"
            />
          </div>

          <aside
            className="warehouse-twin-inspector"
            aria-label="Selected bin details"
          >
            {selectedBin ? (
              <>
                <span className="card-label">Selected bin</span>
                <h2>{selectedBin.code}</h2>
                <dl>
                  <div>
                    <dt>Zone</dt>
                    <dd>{selectedBin.zoneCode}</dd>
                  </div>
                  <div>
                    <dt>Zone-local grid</dt>
                    <dd>
                      ({selectedBin.gridX}, {selectedBin.gridY})
                    </dd>
                  </div>
                  <div>
                    <dt>Accessible</dt>
                    <dd>
                      {selectedBin.isAccessible ? "Yes" : "No"}
                    </dd>
                  </div>
                  <div>
                    <dt>Expected units</dt>
                    <dd>{selectedBin.totalExpectedUnits}</dd>
                  </div>
                </dl>
                {selectedBin.inventoryLines.map((line) => (
                  <p key={line.id} className="warehouse-twin-line">
                    {line.skuCode} · {line.expectedQty}
                  </p>
                ))}
              </>
            ) : (
              <>
                <span className="card-label">Bin inspector</span>
                <h2>No bin selected</h2>
                <p>
                  Select a bin in the warehouse scene to inspect its
                  authoritative expected inventory.
                </p>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
