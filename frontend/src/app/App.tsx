
import { lazy, Suspense, useEffect, useState } from "react";

import {
  fetchBackendHealth,
  type HealthResponse,
} from "../api/health";
import DashboardPage from "../features/dashboard/DashboardPage";
import HandlingUnitsPage from "../features/handling-units/HandlingUnitsPage";
import InventoryPage from "../features/inventory/InventoryPage";
import IntakePage from "../features/intake/IntakePage";
import InspectionPage from "../features/inspection/InspectionPage";
const AuditPage = lazy(() => import("../features/audit/AuditPage"));
const Warehouse3DPage = lazy(
  () => import("../features/warehouse-3d/Warehouse3DPage"),
);

type View =
  | "dashboard"
  | "inventory"
  | "handling-units"
  | "intake"
  | "inspection"
  | "audit"
  | "warehouse-3d";

type Connection =
  | { status: "loading" }
  | { status: "online"; data: HealthResponse }
  | { status: "offline"; message: string };

const navigation: { id: View; label: string }[] = [
  { id: "dashboard", label: "Overview" },
  { id: "inventory", label: "Inventory & Locations" },
  { id: "handling-units", label: "Handling Units" },
  { id: "intake", label: "Scan & Identify" },
  { id: "inspection", label: "Inspections" },
  { id: "audit", label: "Inventory Audit" },
  { id: "warehouse-3d", label: "3D Warehouse" },
];

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [connection, setConnection] = useState<Connection>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchBackendHealth(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setConnection({ status: "online", data });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setConnection({
            status: "offline",
            message:
              error instanceof Error
                ? error.message
                : "Backend unavailable",
          });
        }
      });

    return () => controller.abort();
  }, [attempt]);

  function retryConnection() {
    setConnection({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            W
          </div>
          <div>
            <strong>WARETRACE</strong>
            <span>Warehouse Intelligence</span>
          </div>
        </div>

        <nav className="app-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? "nav-active" : ""}
              aria-current={
                view === item.id ? "page" : undefined
              }
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="connection-control">
          <span
            className={`connection connection--${
              connection.status === "loading"
                ? "checking"
                : connection.status
            }`}
            role="status"
          >
            <span className="connection-dot" aria-hidden="true" />
            {connection.status === "loading"
              ? "Checking backend"
              : connection.status === "online"
                ? "Backend connected"
                : "Backend unavailable"}
          </span>

          {connection.status === "offline" && (
            <button
              type="button"
              className="secondary-button"
              onClick={retryConnection}
            >
              Retry
            </button>
          )}
        </div>
      </header>

      <main className="main-content">
        {view === "dashboard" && <DashboardPage />}
        {view === "inventory" && <InventoryPage />}
        {view === "handling-units" && <HandlingUnitsPage />}
        {view === "intake" && <IntakePage />}
        {view === "inspection" && <InspectionPage />}
        {view === "audit" && (
          <Suspense
            fallback={
              <div className="notice" role="status">
                Loading inventory audit…
              </div>
            }
          >
            <AuditPage />
          </Suspense>
        )}
        {view === "warehouse-3d" && (
          <Suspense
            fallback={
              <div className="notice" role="status">
                Loading 3D warehouse…
              </div>
            }
          >
            <Warehouse3DPage />
          </Suspense>
        )}
      </main>

      <footer className="footer">
        <span>WARETRACE · Warehouse Intelligence</span>
        <span>
          Operational records are not physical audit evidence
        </span>
      </footer>
    </div>
  );
}
