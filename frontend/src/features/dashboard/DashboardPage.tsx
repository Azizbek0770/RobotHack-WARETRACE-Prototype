import { useEffect, useState } from "react";

import {
  getExpectedInventory,
  getSKUs,
  getWarehouses,
} from "../../api/warehouse";

interface Metrics {
  warehouses: number;
  skus: number;
  expectedRows: number;
  expectedUnits: number | null;
  warehouseName: string | null;
}

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; metrics: Metrics };

const modules = [
  ["S01", "Warehouse Operations", "In development"],
  ["S02", "Receiving & Quality Inspection", "Planned"],
  ["S03", "Repackaging Optimization", "Planned"],
  ["S04", "Robot & Digital Twin", "Planned"],
  ["S05–06", "Knowledge Engine", "Planned"],
  ["S07", "Warehouse Assistant", "Planned"],
] as const;

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const [warehouses, skus] = await Promise.all([
          getWarehouses(controller.signal),
          getSKUs(controller.signal),
        ]);

        const firstWarehouse = warehouses.items[0];

        const expected = firstWarehouse
          ? await getExpectedInventory(
              firstWarehouse.id,
              controller.signal,
            )
          : null;

        if (controller.signal.aborted) return;

        setState({
          status: "ready",
          metrics: {
            warehouses: warehouses.total,
            skus: skus.total,
            expectedRows: expected?.total ?? 0,
            expectedUnits:
              expected &&
              expected.items.length === expected.total
                ? expected.items.reduce(
                    (sum, row) => sum + row.expected_qty,
                    0,
                  )
                : null,
            warehouseName: firstWarehouse?.name ?? null,
          },
        });
      } catch (error) {
        if (controller.signal.aborted) return;

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unknown warehouse service error",
        });
      }
    }

    void load();

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <>
      <section className="hero">
        <span className="eyebrow">
          WAREHOUSE OPERATIONS / LIVE DATA
        </span>

        <h1>Warehouse intelligence starts with reliable data.</h1>

        <p>
          A connected overview of warehouse records, products and
          expected stock. Operational modules are introduced as they
          pass implementation and verification.
        </p>
      </section>

      {state.status === "loading" && (
        <div className="notice" role="status">
          Loading warehouse data...
        </div>
      )}

      {state.status === "error" && (
        <div className="notice notice--error" role="alert">
          <strong>Unable to load warehouse metrics.</strong>
          <p>{state.message}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={retry}
          >
            Retry
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <div className="status-grid">
            <article className="status-card">
              <div className="card-label">Warehouses</div>
              <h2>{state.metrics.warehouses}</h2>
              <p>Persisted warehouse records</p>
            </article>

            <article className="status-card">
              <div className="card-label">Product SKUs</div>
              <h2>{state.metrics.skus}</h2>
              <p>Registered product definitions</p>
            </article>

            <article className="status-card">
              <div className="card-label">
                Expected stored units
              </div>
              <h2>
                {state.metrics.expectedUnits ?? "—"}
              </h2>
              <p>
                {state.metrics.warehouseName ??
                  "No warehouse selected"}
              </p>
            </article>
          </div>

          <p className="data-caption">
            {state.metrics.expectedRows} expected-stock rows.
            The quantity refers to the first listed warehouse,
            not necessarily all warehouses. Values are database
            expectations, not physical audit observations.
          </p>
        </>
      )}

      <section className="modules-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DEVELOPMENT ROADMAP</span>
            <h2>Platform modules</h2>
          </div>
        </div>

        <div className="modules-grid">
          {modules.map(([stage, name, status]) => (
            <article className="module-card" key={stage}>
              <div className="module-topline">
                <span className="module-id">{stage}</span>
                <span className="planned-label">{status}</span>
              </div>
              <h3>{name}</h3>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
