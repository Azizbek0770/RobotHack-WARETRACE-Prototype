
import { useEffect, useState, type FormEvent } from "react";

import {
  createHandlingUnit,
  getHandlingUnit,
  getHUEvents,
  listHandlingUnits,
  moveHandlingUnit,
  type HandlingUnit,
  type WarehouseEvent,
} from "../../api/handlingUnits";
import {
  getBins,
  getSKUs,
  getWarehouses,
  getZones,
  type Page,
  type SKU,
} from "../../api/warehouse";

interface Destination {
  id: string;
  warehouseId: string;
  label: string;
}

type Catalog =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      skus: SKU[];
      destinations: Destination[];
    };

type ListState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; page: Page<HandlingUnit> };

type Detail =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      hu: HandlingUnit;
      events: Page<WarehouseEvent>;
    };

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected operation failure";
}

export default function HandlingUnitsPage() {
  const [catalog, setCatalog] = useState<Catalog>({
    kind: "loading",
  });

  const [list, setList] = useState<ListState>({
    kind: "loading",
  });

  const [detail, setDetail] = useState<Detail>({
    kind: "loading",
  });

  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    null,
  );

  const [listRefresh, setListRefresh] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);

  const [newCode, setNewCode] = useState("");
  const [newSkuId, setNewSkuId] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [targetBinId, setTargetBinId] = useState("");

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  // Load product and valid storage-destination choices.
  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const [skuPage, warehouses] = await Promise.all([
          getSKUs(controller.signal),
          getWarehouses(controller.signal),
        ]);

        const groups = await Promise.all(
          warehouses.items.map(async (warehouse) => {
            const zones = await getZones(
              warehouse.id,
              controller.signal,
            );

            const binGroups = await Promise.all(
              zones
                .filter((zone) => zone.kind === "STORAGE")
                .map(async (zone) => {
                  const bins = await getBins(
                    zone.id,
                    controller.signal,
                  );

                  return bins
                    .filter((bin) => bin.is_accessible)
                    .map((bin): Destination => ({
                      id: bin.id,
                      warehouseId: warehouse.id,
                      label: `${warehouse.code} / ${zone.code} / ${bin.code}`,
                    }));
                }),
            );

            return binGroups.flat();
          }),
        );

        if (!controller.signal.aborted) {
          setCatalog({
            kind: "ready",
            skus: skuPage.items,
            destinations: groups.flat(),
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setCatalog({
            kind: "error",
            message: errorText(error),
          });
        }
      }
    }

    void loadCatalog();
    return () => controller.abort();
  }, []);

  // List and search handling units.
  useEffect(() => {
    const controller = new AbortController();

    async function loadList() {
      try {
        const page = await listHandlingUnits(
          search,
          controller.signal,
        );

        if (controller.signal.aborted) return;

        setList({ kind: "ready", page });

        setSelectedId((current) =>
          current &&
          page.items.some((item) => item.id === current)
            ? current
            : (page.items[0]?.id ?? null),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setList({
            kind: "error",
            message: errorText(error),
          });
        }
      }
    }

    void loadList();
    return () => controller.abort();
  }, [search, listRefresh]);

  // Load selected HU and its event history.
  useEffect(() => {
    if (!selectedId) return;

    const controller = new AbortController();

    async function loadDetail() {
      try {
        const [hu, events] = await Promise.all([
          getHandlingUnit(selectedId, controller.signal),
          getHUEvents(selectedId, controller.signal),
        ]);

        if (!controller.signal.aborted) {
          setDetail({ kind: "ready", hu, events });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setDetail({
            kind: "error",
            message: errorText(error),
          });
        }
      }
    }

    void loadDetail();
    return () => controller.abort();
  }, [selectedId, detailRefresh]);

  function selectHU(id: string) {
    setSelectedId(id);
    setDetail({ kind: "loading" });
    setTargetBinId("");
    setActionError("");
    setNotice("");
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setList({ kind: "loading" });
    setSearch(searchText.trim());
    setListRefresh((value) => value + 1);
  }

  async function registerHU(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = newCode.trim().toUpperCase();
    const quantity = Number(newQuantity);

    if (!/^[A-Z0-9][A-Z0-9._-]{2,119}$/.test(code)) {
      setActionError("Use a valid HU label, such as HU-0021.");
      return;
    }

    if (
      !newSkuId ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      setActionError("Choose a SKU and a positive whole quantity.");
      return;
    }

    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      const created = await createHandlingUnit({
        external_code: code,
        sku_id: newSkuId,
        quantity,
      });

      setNewCode("");
      setNewQuantity("1");
      setSearchText(created.external_code);
      setSearch(created.external_code);
      setSelectedId(created.id);
      setDetail({ kind: "loading" });
      setDetailRefresh((value) => value + 1);
      setListRefresh((value) => value + 1);
      setNotice(`Handling unit ${created.external_code} registered.`);
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function bookMovement() {
    if (detail.kind !== "ready" || !targetBinId) return;

    const hu = detail.hu;

    setBusy(true);
    setActionError("");
    setNotice("");

    try {
      const updated = await moveHandlingUnit(hu.id, {
        target_bin_id: targetBinId,
        expected_version: hu.version,
      });

      setDetail({ kind: "loading" });
      setTargetBinId("");
      setDetailRefresh((value) => value + 1);
      setListRefresh((value) => value + 1);
      setNotice(
        `${updated.external_code} booked to storage. Version ${updated.version}.`,
      );
    } catch (error) {
      setActionError(errorText(error));

      // Refresh the version even after a conflict.
      setDetailRefresh((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  const selected =
    detail.kind === "ready" && detail.hu.id === selectedId
      ? detail.hu
      : null;

  const canMove =
    selected?.status === "RECEIVED" ||
    selected?.status === "STORED";

  const destinations =
    catalog.kind === "ready"
      ? catalog.destinations.filter((destination) => {
          if (destination.id === selected?.bin_id) return false;

          if (!selected?.bin_id) return true;

          const current = catalog.destinations.find(
            (item) => item.id === selected.bin_id,
          );

          return (
            !current ||
            destination.warehouseId === current.warehouseId
          );
        })
      : [];

  return (
    <section className="warehouse-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERATIONS / S01-C2</span>
          <h1>Handling Units</h1>
          <p>
            Register, locate and book warehouse packages with
            version-controlled movements and traceable history.
          </p>
        </div>
        <span className="planned-label">
          Development operations
        </span>
      </div>

      <div className="notice">
        This is a local development interface. Booking a movement
        updates expected inventory; it does not prove that the
        physical movement occurred.
      </div>

      {notice && (
        <div className="notice notice--success" role="status">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="notice notice--error" role="alert">
          {actionError}
        </div>
      )}

      <div className="hu-layout">
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>Find Handling Units</h2>
              {list.kind === "ready" && (
                <span>{list.page.total} records</span>
              )}
            </div>

            <form onSubmit={applySearch} className="hu-search">
              <label className="field">
                <span>HU label or SKU code</span>
                <input
                  type="search"
                  value={searchText}
                  onChange={(event) =>
                    setSearchText(event.target.value)
                  }
                  placeholder="HU-0001"
                  maxLength={120}
                />
              </label>
              <button
                type="submit"
                className="secondary-button"
              >
                Search
              </button>
            </form>

            {list.kind === "loading" && (
              <p role="status">Loading handling units...</p>
            )}

            {list.kind === "error" && (
              <p role="alert" className="error-text">
                {list.message}
              </p>
            )}

            {list.kind === "ready" && (
              <>
                {list.page.items.length === 0 ? (
                  <p className="muted">
                    No matching handling units.
                  </p>
                ) : (
                  <div className="hu-list">
                    {list.page.items.map((hu) => (
                      <button
                        key={hu.id}
                        type="button"
                        disabled={busy}
                        className={
                          selectedId === hu.id
                            ? "hu-list-item hu-list-item--active"
                            : "hu-list-item"
                        }
                        onClick={() => selectHU(hu.id)}
                      >
                        <strong>{hu.external_code}</strong>
                        <span>
                          {hu.sku.code} · Qty {hu.quantity}
                        </span>
                        <small>
                          {hu.status} · v{hu.version}
                        </small>
                      </button>
                    ))}
                  </div>
                )}

                {list.page.total > list.page.items.length && (
                  <p className="muted">
                    Showing the first {list.page.items.length}{" "}
                    records. Narrow your search to find more.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Register Incoming HU</h2>
            </div>

            {catalog.kind === "loading" && (
              <p role="status">Loading product choices...</p>
            )}

            {catalog.kind === "error" && (
              <p role="alert" className="error-text">
                {catalog.message}
              </p>
            )}

            {catalog.kind === "ready" && (
              <form
                className="hu-form"
                onSubmit={(event) => void registerHU(event)}
              >
                <label className="field">
                  <span>HU label</span>
                  <input
                    required
                    value={newCode}
                    onChange={(event) =>
                      setNewCode(event.target.value)
                    }
                    placeholder="HU-0021"
                    maxLength={120}
                  />
                </label>

                <label className="field">
                  <span>Product SKU</span>
                  <select
                    required
                    value={newSkuId}
                    onChange={(event) =>
                      setNewSkuId(event.target.value)
                    }
                  >
                    <option value="">Select SKU</option>
                    {catalog.skus.map((sku) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.code} — {sku.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Quantity</span>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={newQuantity}
                    onChange={(event) =>
                      setNewQuantity(event.target.value)
                    }
                  />
                </label>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Processing..." : "Register HU"}
                </button>
              </form>
            )}
          </section>
        </div>

        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>Handling Unit Details</h2>
            </div>

            {!selectedId && (
              <p className="muted">
                Select a handling unit to view its details.
              </p>
            )}

            {selectedId && detail.kind === "loading" && (
              <p role="status">Loading handling unit...</p>
            )}

            {selectedId && detail.kind === "error" && (
              <p role="alert" className="error-text">
                {detail.message}
              </p>
            )}

            {selected && (
              <>
                <div className="hu-detail-grid">
                  <div>
                    <span>Label</span>
                    <strong>{selected.external_code}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{selected.status}</strong>
                  </div>
                  <div>
                    <span>Product</span>
                    <strong>{selected.sku.name}</strong>
                  </div>
                  <div>
                    <span>Quantity</span>
                    <strong>{selected.quantity}</strong>
                  </div>
                  <div>
                    <span>Recorded Bin</span>
                    <strong>
                      {selected.bin?.code ?? "Unassigned"}
                    </strong>
                  </div>
                  <div>
                    <span>Record Version</span>
                    <strong>{selected.version}</strong>
                  </div>
                </div>

                <div className="hu-movement">
                  <h3>Book Storage Movement</h3>

                  {!canMove ? (
                    <p className="muted">
                      This status requires another workflow
                      before movement is permitted.
                    </p>
                  ) : (
                    <>
                      <label className="field">
                        <span>Destination storage bin</span>
                        <select
                          value={targetBinId}
                          onChange={(event) =>
                            setTargetBinId(event.target.value)
                          }
                          disabled={busy}
                        >
                          <option value="">
                            Choose destination
                          </option>
                          {destinations.map((destination) => (
                            <option
                              key={destination.id}
                              value={destination.id}
                            >
                              {destination.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        className="primary-button"
                        type="button"
                        disabled={
                          busy ||
                          !targetBinId ||
                          catalog.kind !== "ready"
                        }
                        onClick={() => void bookMovement()}
                      >
                        {busy ? "Processing..." : "Book Movement"}
                      </button>

                      <p className="muted">
                        The backend validates capacity,
                        warehouse rules and record version
                        before committing.
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          {selected && detail.kind === "ready" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Event History</h2>
                <span>{detail.events.total} events</span>
              </div>

              {detail.events.items.length === 0 ? (
                <p className="muted">
                  No recorded API operations for this HU.
                </p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Quantity</th>
                        <th>Version</th>
                        <th>Recorded At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.events.items.map((event) => (
                        <tr key={event.id}>
                          <td>{event.event_type}</td>
                          <td>{event.quantity}</td>
                          <td>{event.after_version}</td>
                          <td>
                            {new Date(
                              event.created_at,
                            ).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.events.total > detail.events.items.length && (
                <p className="muted">
                  Showing the first 100 recorded events.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
