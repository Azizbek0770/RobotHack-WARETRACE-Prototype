
import { useEffect, useState } from "react";

import {
  getBins,
  getExpectedInventory,
  getSKUs,
  getWarehouses,
  getZones,
  type ExpectedInventory,
  type SKU,
  type StorageBin,
  type Warehouse,
  type Zone,
} from "../../api/warehouse";

type LoadStatus = "loading" | "ready" | "error";

export default function InventoryPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [skuTotal, setSkuTotal] = useState(0);

  const [warehouseId, setWarehouseId] = useState("");
  const [zoneId, setZoneId] = useState("");

  const [zones, setZones] = useState<Zone[]>([]);
  const [bins, setBins] = useState<StorageBin[]>([]);
  const [inventory, setInventory] = useState<
    ExpectedInventory[]
  >([]);

  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [skuSearch, setSkuSearch] = useState("");

  const [catalogStatus, setCatalogStatus] =
    useState<LoadStatus>("loading");
  const [warehouseStatus, setWarehouseStatus] =
    useState<LoadStatus>("loading");
  const [binStatus, setBinStatus] =
    useState<LoadStatus>("loading");

  const [errorMessage, setErrorMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  // Fetch initial warehouse and SKU catalogs.
  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const [warehousePage, skuPage] = await Promise.all([
          getWarehouses(controller.signal),
          getSKUs(controller.signal),
        ]);

        if (controller.signal.aborted) return;

        setWarehouses(warehousePage.items);
        setSkus(skuPage.items);
        setSkuTotal(skuPage.total);
        setWarehouseId(warehousePage.items[0]?.id ?? "");
        setCatalogStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load catalog",
        );
        setCatalogStatus("error");
      }
    }

    void loadCatalog();

    return () => controller.abort();
  }, [attempt]);

  // Load zones and expected-stock rows for the selected warehouse.
  useEffect(() => {
    if (!warehouseId) return;

    const controller = new AbortController();

    async function loadWarehouse() {
      try {
        const [zoneItems, expectedPage] = await Promise.all([
          getZones(warehouseId, controller.signal),
          getExpectedInventory(
            warehouseId,
            controller.signal,
          ),
        ]);

        if (controller.signal.aborted) return;

        setZones(zoneItems);
        setInventory(expectedPage.items);
        setInventoryTotal(expectedPage.total);

        const preferred =
          zoneItems.find((zone) => zone.kind === "STORAGE") ??
          zoneItems[0];

        setZoneId(preferred?.id ?? "");
        setWarehouseStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load warehouse",
        );
        setWarehouseStatus("error");
      }
    }

    void loadWarehouse();

    return () => controller.abort();
  }, [warehouseId]);

  // Fetch physical-location definitions for the selected zone.
  useEffect(() => {
    if (!zoneId) return;

    const controller = new AbortController();

    async function loadZoneBins() {
      try {
        const items = await getBins(
          zoneId,
          controller.signal,
        );

        if (controller.signal.aborted) return;

        setBins(items);
        setBinStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to load storage bins",
        );
        setBinStatus("error");
      }
    }

    void loadZoneBins();

    return () => controller.abort();
  }, [zoneId]);

  function changeWarehouse(id: string) {
    setWarehouseId(id);
    setZoneId("");
    setZones([]);
    setBins([]);
    setInventory([]);
    setInventoryTotal(0);
    setWarehouseStatus("loading");
    setBinStatus("loading");
    setErrorMessage("");
  }

  function changeZone(id: string) {
    setZoneId(id);
    setBins([]);
    setBinStatus("loading");
    setErrorMessage("");
  }

  function retry() {
    setCatalogStatus("loading");
    setWarehouseStatus("loading");
    setBinStatus("loading");
    setWarehouseId("");
    setZoneId("");
    setZones([]);
    setBins([]);
    setInventory([]);
    setErrorMessage("");
    setAttempt((current) => current + 1);
  }

  const filteredSKUs = skus.filter((sku) =>
    `${sku.code} ${sku.name}`
      .toLowerCase()
      .includes(skuSearch.toLowerCase()),
  );

  return (
    <section className="warehouse-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            OPERATIONS / WAREHOUSE CORE
          </span>
          <h1>Inventory & Locations</h1>
          <p>
            Explore persisted warehouse records and expected stock.
            All data is retrieved from FastAPI.
          </p>
        </div>
        <span className="planned-label">Read-only view</span>
      </div>

      {catalogStatus === "loading" && (
        <div className="notice" role="status">
          Loading warehouse catalog...
        </div>
      )}

      {catalogStatus === "error" && (
        <div className="notice notice--error" role="alert">
          <strong>Unable to load the catalog.</strong>
          <p>{errorMessage}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      )}

      {catalogStatus === "ready" && (
        <>
          <div className="panel">
            <div className="control-grid">
              <label className="field">
                <span>Warehouse</span>
                <select
                  value={warehouseId}
                  onChange={(event) =>
                    changeWarehouse(event.target.value)
                  }
                >
                  {warehouses.length === 0 && (
                    <option value="">No warehouses</option>
                  )}
                  {warehouses.map((warehouse) => (
                    <option
                      key={warehouse.id}
                      value={warehouse.id}
                    >
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Zone</span>
                <select
                  value={zoneId}
                  disabled={
                    warehouseStatus !== "ready" ||
                    zones.length === 0
                  }
                  onChange={(event) =>
                    changeZone(event.target.value)
                  }
                >
                  {zones.length === 0 && (
                    <option value="">No zones available</option>
                  )}
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.code} — {zone.kind}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {warehouseStatus === "loading" &&
              warehouseId && (
                <p role="status">
                  Loading warehouse locations and inventory...
                </p>
              )}

            {warehouseStatus === "error" && (
              <div role="alert" className="error-text">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="data-layout">
            <section className="panel">
              <div className="panel-heading">
                <h2>Storage Bins</h2>
                <span>{bins.length} loaded</span>
              </div>

              {binStatus === "loading" && zoneId && (
                <p role="status">Loading bins...</p>
              )}

              {binStatus === "error" && (
                <p role="alert" className="error-text">
                  {errorMessage}
                </p>
              )}

              {binStatus === "ready" &&
                bins.length === 0 && (
                  <p className="muted">
                    This zone has no configured bins.
                  </p>
                )}

              {binStatus === "ready" &&
                bins.length > 0 && (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Bin</th>
                          <th>Grid</th>
                          <th>Capacity</th>
                          <th>Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bins.map((bin) => (
                          <tr key={bin.id}>
                            <td>
                              <strong>{bin.code}</strong>
                            </td>
                            <td>
                              {bin.grid_x}, {bin.grid_y}
                            </td>
                            <td>
                              {bin.capacity_units ?? "—"}
                            </td>
                            <td>
                              {bin.is_accessible
                                ? "Accessible"
                                : "Blocked"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Expected Inventory</h2>
                <span>{inventoryTotal} records</span>
              </div>

              <p className="muted">
                Warehouse-wide expected quantities, not
                independent physical observations.
              </p>

              {warehouseStatus === "ready" &&
                inventory.length === 0 && (
                  <p>No expected-stock records found.</p>
                )}

              {warehouseStatus === "ready" &&
                inventory.length > 0 && (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Bin</th>
                          <th>Expected</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventory.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>
                                {row.sku.code}
                              </strong>
                            </td>
                            <td>{row.bin.code}</td>
                            <td>{row.expected_qty}</td>
                            <td>
                              <span className="source-label">
                                {row.source}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              {inventoryTotal > inventory.length && (
                <p className="muted">
                  Displaying the first {inventory.length} of{" "}
                  {inventoryTotal} records.
                </p>
              )}
            </section>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <h2>Product Catalog</h2>
              <span>
                {skuTotal} products · {skus.length} loaded
              </span>
            </div>

            <label className="field search-field">
              <span>Filter loaded SKUs</span>
              <input
                type="search"
                placeholder="Search code or product name"
                value={skuSearch}
                onChange={(event) =>
                  setSkuSearch(event.target.value)
                }
              />
            </label>

            {filteredSKUs.length === 0 ? (
              <p className="muted">No matching products.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Product</th>
                      <th>Weight (g)</th>
                      <th>Size (mm)</th>
                      <th>Fragile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSKUs.map((sku) => (
                      <tr key={sku.id}>
                        <td>
                          <strong>{sku.code}</strong>
                        </td>
                        <td>{sku.name}</td>
                        <td>{sku.unit_weight_g ?? "—"}</td>
                        <td>
                          {[
                            sku.length_mm,
                            sku.width_mm,
                            sku.height_mm,
                          ]
                            .map((value) => value ?? "—")
                            .join(" × ")}
                        </td>
                        <td>
                          {sku.is_fragile ? "Yes" : "No"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
