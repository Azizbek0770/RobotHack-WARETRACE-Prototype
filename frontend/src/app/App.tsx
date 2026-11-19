import { useEffect, useState } from "react";

import {
  fetchBackendHealth,
  type HealthResponse,
} from "../api/health";
import DashboardPage from "../features/dashboard/DashboardPage";
import InventoryPage from "../features/inventory/InventoryPage";

type View = "dashboard" | "inventory";

type Connection =
  | { status: "loading" }
  | { status: "online"; data: HealthResponse }
  | { status: "offline"; message: string };

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
    setAttempt((current) => current + 1);
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
          <button
            type="button"
            className={view === "dashboard" ? "nav-active" : ""}
            aria-current={view === "dashboard" ? "page" : undefined}
            onClick={() => setView("dashboard")}
          >
            Overview
          </button>
          <button
            type="button"
            className={view === "inventory" ? "nav-active" : ""}
            aria-current={view === "inventory" ? "page" : undefined}
            onClick={() => setView("inventory")}
          >
            Inventory &amp; Locations
          </button>
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
              className="secondary-button"
              type="button"
              title={connection.message}
              onClick={retryConnection}
            >
              Retry
            </button>
          )}
        </div>
      </header>

      <main className="main-content">
        {view === "dashboard" ? <DashboardPage /> : <InventoryPage />}
      </main>

      <footer className="footer">
        <span>WARETRACE · Warehouse Intelligence</span>
        <span>Operational records are not physical audit evidence</span>
      </footer>
    </div>
  );
}
