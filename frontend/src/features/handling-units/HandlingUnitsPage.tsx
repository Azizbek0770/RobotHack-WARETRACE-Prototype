import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

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
  groupLabel: string;
  binCode: string;
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
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      hu: HandlingUnit;
      events: Page<WarehouseEvent>;
    };

type ActiveAction = "idle" | "registering" | "moving";

const HU_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,119}$/;

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected operation failure";
}

function formatEventType(eventType: string): string {
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "stored") return "status-badge status-badge--stored";
  if (normalized === "received") return "status-badge status-badge--received";
  if (normalized === "shipped" || normalized === "consumed") {
    return "status-badge status-badge--closed";
  }
  return "status-badge";
}

export default function HandlingUnitsPage() {
  const [catalog, setCatalog] = useState<Catalog>({
    kind: "loading",
  });
  const [list, setList] = useState<ListState>({
    kind: "loading",
  });
  const [detail, setDetail] = useState<Detail>({
    kind: "idle",
  });

  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(
    null,
  );

  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [listRefresh, setListRefresh] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);

  const [newCode, setNewCode] = useState("");
  const [newSkuId, setNewSkuId] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [targetBinId, setTargetBinId] = useState("");

  const [activeAction, setActiveAction] =
    useState<ActiveAction>("idle");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  const copyTimerRef = useRef<number | null>(null);
  const busy = activeAction !== "idle";

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

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
                    .map(
                      (bin): Destination => ({
                        id: bin.id,
                        warehouseId: warehouse.id,
                        groupLabel: `${warehouse.code} / ${zone.code}`,
                        binCode: bin.code,
                        label: `${warehouse.code} / ${zone.code} / ${bin.code}`,
                      }),
                    );
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
  }, [catalogRefresh]);

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

        setSelectedId((current) => {
          if (
            current &&
            page.items.some((item) => item.id === current)
          ) {
            return current;
          }
          return page.items[0]?.id ?? null;
        });
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
    if (!selectedId) {
      setDetail({ kind: "idle" });
      return;
    }

    const huId = selectedId;
    const controller = new AbortController();

    async function loadDetail() {
      try {
        const [hu, events] = await Promise.all([
          getHandlingUnit(huId, controller.signal),
          getHUEvents(huId, controller.signal),
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

  function retryCatalog() {
    setCatalog({ kind: "loading" });
    setCatalogRefresh((value) => value + 1);
  }

  function refreshList() {
    setList({ kind: "loading" });
    setListRefresh((value) => value + 1);
  }

  function refreshDetail() {
    if (!selectedId) return;
    setDetail({ kind: "loading" });
    setDetailRefresh((value) => value + 1);
  }

  function selectHU(id: string) {
    setTargetBinId("");
    setActionError("");
    setNotice("");
    setCopiedCode(false);

    if (id === selectedId) {
      if (detail.kind === "error") {
        refreshDetail();
      }
      return;
    }

    setSelectedId(id);
    setDetail({ kind: "loading" });
  }

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setList({ kind: "loading" });
    setSearch(searchText.trim());
    setListRefresh((value) => value + 1);
  }

  function clearSearch() {
    setSearchText("");
    setStatusFilter("ALL");
    setList({ kind: "loading" });
    setSearch("");
    setListRefresh((value) => value + 1);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedCode(false);
      }, 1800);
    } catch {
      setActionError("Could not copy HU label to clipboard.");
    }
  }

  async function registerHU(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = newCode.trim().toUpperCase();
    const quantity = Number(newQuantity);

    if (!HU_CODE_PATTERN.test(code)) {
      setActionError(
        "Use 3–120 characters starting with a letter or number (e.g., HU-0021).",
      );
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

    setActiveAction("registering");
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
      setStatusFilter("ALL");
      setSearchText(created.external_code);
      setSearch(created.external_code);
      setSelectedId(created.id);
      setDetail({ kind: "loading" });
      setDetailRefresh((value) => value + 1);
      setListRefresh((value) => value + 1);
      setNotice(
        `Handling unit ${created.external_code} registered.`,
      );
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setActiveAction("idle");
    }
  }

  async function bookMovement() {
    if (detail.kind !== "ready" || !targetBinId) return;

    const hu = detail.hu;

    setActiveAction("moving");
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
        `${updated.external_code} booked to storage (v${updated.version}).`,
      );
    } catch (error) {
      setActionError(errorText(error));
      // Sync latest version & state in background after conflict.
      setDetailRefresh((value) => value + 1);
      setListRefresh((value) => value + 1);
    } finally {
      setActiveAction("idle");
    }
  }

  const selected =
    detail.kind === "ready" && detail.hu.id === selectedId
      ? detail.hu
      : null;

  const canMove =
    selected?.status === "RECEIVED" ||
    selected?.status === "STORED";

  const destinationById = useMemo(() => {
    if (catalog.kind !== "ready") {
      return new Map<string, Destination>();
    }
    return new Map(
      catalog.destinations.map((item) => [item.id, item]),
    );
  }, [catalog]);

  const groupedDestinations = useMemo(() => {
    if (catalog.kind !== "ready") return [];

    const currentBin = selected?.bin_id
      ? destinationById.get(selected.bin_id)
      : undefined;

    const eligible = catalog.destinations.filter((destination) => {
      if (destination.id === selected?.bin_id) return false;
      if (!currentBin) return true;
      return destination.warehouseId === currentBin.warehouseId;
    });

    const groups = new Map<string, Destination[]>();
    for (const dest of eligible) {
      const bucket = groups.get(dest.groupLabel) ?? [];
      bucket.push(dest);
      groups.set(dest.groupLabel, bucket);
    }

    return Array.from(groups.entries());
  }, [catalog, destinationById, selected?.bin_id]);

  const availableStatuses = useMemo(() => {
    if (list.kind !== "ready") return [];
    const unique = new Set(
      list.page.items.map((item) => item.status),
    );
    return Array.from(unique).sort();
  }, [list]);

  const visibleItems = useMemo(() => {
    if (list.kind !== "ready") return [];
    if (statusFilter === "ALL") return list.page.items;
    return list.page.items.filter(
      (item) => item.status === statusFilter,
    );
  }, [list, statusFilter]);

  const recordedBinLabel = selected?.bin_id
    ? (destinationById.get(selected.bin_id)?.label ??
      selected.bin?.code ??
      "Unassigned")
    : (selected?.bin?.code ?? "Unassigned");

  const codeTrimmed = newCode.trim().toUpperCase();
  const codeInvalid =
    codeTrimmed.length > 0 && !HU_CODE_PATTERN.test(codeTrimmed);

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
        <div
          className="notice notice--success notice--dismissible"
          role="status"
        >
          <span>{notice}</span>
          <button
            type="button"
            className="notice-dismiss"
            onClick={() => setNotice("")}
            aria-label="Dismiss status message"
          >
            ×
          </button>
        </div>
      )}

      {actionError && (
        <div
          className="notice notice--error notice--dismissible"
          role="alert"
        >
          <span>{actionError}</span>
          <button
            type="button"
            className="notice-dismiss"
            onClick={() => setActionError("")}
            aria-label="Dismiss error message"
          >
            ×
          </button>
        </div>
      )}

      <div className="hu-layout">
        <div>
          <section
            className="panel"
            aria-busy={list.kind === "loading"}
          >
            <div className="panel-heading">
              <h2>Find Handling Units</h2>
              <div className="panel-actions">
                {list.kind === "ready" && (
                  <span>
                    {statusFilter === "ALL"
                      ? `${list.page.total} records`
                      : `${visibleItems.length} of ${list.page.items.length} shown`}
                  </span>
                )}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={refreshList}
                  disabled={list.kind === "loading" || busy}
                >
                  Refresh
                </button>
              </div>
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
                disabled={busy}
              >
                Search
              </button>
              {(search || searchText) && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={clearSearch}
                  disabled={busy}
                >
                  Clear
                </button>
              )}
            </form>

            {availableStatuses.length > 1 && (
              <div
                className="hu-filter-bar"
                role="group"
                aria-label="Filter by status"
              >
                <button
                  type="button"
                  className={
                    statusFilter === "ALL"
                      ? "filter-chip filter-chip--active"
                      : "filter-chip"
                  }
                  onClick={() => setStatusFilter("ALL")}
                >
                  All
                </button>
                {availableStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={
                      statusFilter === status
                        ? "filter-chip filter-chip--active"
                        : "filter-chip"
                    }
                    onClick={() => setStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            )}

            {list.kind === "loading" && (
              <p role="status">Loading handling units...</p>
            )}

            {list.kind === "error" && (
              <div role="alert" className="inline-error">
                <p className="error-text">{list.message}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={refreshList}
                >
                  Retry
                </button>
              </div>
            )}

            {list.kind === "ready" && (
              <>
                {visibleItems.length === 0 ? (
                  <p className="muted">
                    {statusFilter !== "ALL"
                      ? `No ${statusFilter} handling units in the current results.`
                      : "No matching handling units."}
                  </p>
                ) : (
                  <div className="hu-list">
                    {visibleItems.map((hu) => {
                      const isActive = selectedId === hu.id;
                      return (
                        <button
                          key={hu.id}
                          type="button"
                          disabled={busy}
                          aria-current={isActive ? "true" : undefined}
                          className={
                            isActive
                              ? "hu-list-item hu-list-item--active"
                              : "hu-list-item"
                          }
                          onClick={() => selectHU(hu.id)}
                        >
                          <div className="hu-list-item-top">
                            <strong>{hu.external_code}</strong>
                            <span
                              className={statusBadgeClass(hu.status)}
                            >
                              {hu.status}
                            </span>
                          </div>
                          <span>
                            {hu.sku.code} · Qty {hu.quantity}
                          </span>
                          <small>
                            {hu.bin?.code ?? "Unassigned"} · v
                            {hu.version}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                )}

                {list.page.total > list.page.items.length && (
                  <p className="muted">
                    Showing the first {list.page.items.length} of{" "}
                    {list.page.total} records. Narrow your search
                    to find more.
                  </p>
                )}
              </>
            )}
          </section>

          <section
            className="panel"
            aria-busy={catalog.kind === "loading"}
          >
            <div className="panel-heading">
              <h2>Register Incoming HU</h2>
            </div>

            {catalog.kind === "loading" && (
              <p role="status">Loading product choices...</p>
            )}

            {catalog.kind === "error" && (
              <div role="alert" className="inline-error">
                <p className="error-text">{catalog.message}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={retryCatalog}
                >
                  Retry
                </button>
              </div>
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
                      setNewCode(event.target.value.toUpperCase())
                    }
                    placeholder="HU-0021"
                    maxLength={120}
                    aria-invalid={codeInvalid}
                    disabled={busy}
                  />
                  {codeInvalid && (
                    <small className="error-text">
                      Min 3 characters: A–Z, 0–9, dot, dash, or
                      underscore.
                    </small>
                  )}
                </label>

                <label className="field">
                  <span>Product SKU</span>
                  <select
                    required
                    value={newSkuId}
                    onChange={(event) =>
                      setNewSkuId(event.target.value)
                    }
                    disabled={busy}
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
                    disabled={busy}
                  />
                </label>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || codeInvalid}
                >
                  {activeAction === "registering"
                    ? "Registering..."
                    : "Register HU"}
                </button>
              </form>
            )}
          </section>
        </div>

        <div>
          <section
            className="panel"
            aria-busy={detail.kind === "loading"}
          >
            <div className="panel-heading">
              <h2>Handling Unit Details</h2>
              {selectedId && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={refreshDetail}
                  disabled={detail.kind === "loading" || busy}
                >
                  Refresh
                </button>
              )}
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
              <div role="alert" className="inline-error">
                <p className="error-text">{detail.message}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={refreshDetail}
                >
                  Retry
                </button>
              </div>
            )}

            {selected && (
              <>
                <div className="hu-detail-grid">
                  <div>
                    <span>Label</span>
                    <div className="hu-code-row">
                      <strong>{selected.external_code}</strong>
                      <button
                        type="button"
                        className="ghost-button ghost-button--xs"
                        onClick={() =>
                          void copyCode(selected.external_code)
                        }
                      >
                        {copiedCode ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span>Status</span>
                    <div>
                      <span
                        className={statusBadgeClass(
                          selected.status,
                        )}
                      >
                        {selected.status}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span>Product</span>
                    <strong>
                      {selected.sku.code} — {selected.sku.name}
                    </strong>
                  </div>
                  <div>
                    <span>Quantity</span>
                    <strong>{selected.quantity}</strong>
                  </div>
                  <div>
                    <span>Recorded Bin</span>
                    <strong>{recordedBinLabel}</strong>
                  </div>
                  <div>
                    <span>Record Version</span>
                    <strong>v{selected.version}</strong>
                  </div>
                </div>

                <div className="hu-movement">
                  <h3>Book Storage Movement</h3>

                  {!canMove ? (
                    <p className="muted">
                      Handling units with status{" "}
                      <strong>{selected.status}</strong> require
                      another workflow before storage movement is
                      permitted.
                    </p>
                  ) : catalog.kind === "loading" ? (
                    <p role="status" className="muted">
                      Loading accessible storage bins...
                    </p>
                  ) : catalog.kind === "error" ? (
                    <div className="inline-error">
                      <p className="error-text">
                        Unable to load storage bins.
                      </p>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={retryCatalog}
                      >
                        Retry catalog
                      </button>
                    </div>
                  ) : groupedDestinations.length === 0 ? (
                    <p className="muted">
                      No other accessible storage bins are
                      available for this warehouse.
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
                          {groupedDestinations.map(
                            ([groupLabel, bins]) => (
                              <optgroup
                                key={groupLabel}
                                label={groupLabel}
                              >
                                {bins.map((destination) => (
                                  <option
                                    key={destination.id}
                                    value={destination.id}
                                  >
                                    {destination.binCode} (
                                    {destination.label})
                                  </option>
                                ))}
                              </optgroup>
                            ),
                          )}
                        </select>
                      </label>

                      <button
                        className="primary-button"
                        type="button"
                        disabled={busy || !targetBinId}
                        onClick={() => void bookMovement()}
                      >
                        {activeAction === "moving"
                          ? "Booking..."
                          : "Book Movement"}
                      </button>

                      <p className="muted">
                        The backend validates capacity,
                        warehouse rules and version{" "}
                        <strong>v{selected.version}</strong>{" "}
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
                          <td title={event.event_type}>
                            {formatEventType(event.event_type)}
                          </td>
                          <td>{event.quantity}</td>
                          <td>v{event.after_version}</td>
                          <td>
                            {formatTimestamp(event.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail.events.total > detail.events.items.length && (
                <p className="muted">
                  Showing the first {detail.events.items.length}{" "}
                  of {detail.events.total} recorded events.
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}