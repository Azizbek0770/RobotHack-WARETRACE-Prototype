
import { useEffect, useState } from "react";

import {
  fetchBackendHealth,
  type HealthResponse,
} from "../api/health";

type ConnectionState =
  | { kind: "checking" }
  | { kind: "online"; data: HealthResponse }
  | { kind: "offline"; reason: string };

const modules = [
  {
    id: "S01",
    title: "Inventory & Handling Units",
    description:
      "Warehouse locations, product records and handling-unit tracking.",
  },
  {
    id: "S02",
    title: "Receiving & Inspection",
    description:
      "Camera identification, quality checks and inspection evidence.",
  },
  {
    id: "S03",
    title: "Repackaging",
    description:
      "Constraint-aware packaging and space optimization.",
  },
  {
    id: "S04",
    title: "Robot & Warehouse Twin",
    description:
      "3D warehouse visualization and autonomous audit simulation.",
  },
  {
    id: "S05–S06",
    title: "Knowledge Engine",
    description:
      "RAG-Anything document processing and grounded retrieval.",
  },
  {
    id: "S07",
    title: "Warehouse Assistant",
    description:
      "Read-only operational analysis with controlled AI tools.",
  },
] as const;

export default function App() {
  const [connection, setConnection] = useState<ConnectionState>({
    kind: "checking",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchBackendHealth(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setConnection({ kind: "online", data });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setConnection({
            kind: "offline",
            reason:
              error instanceof Error
                ? error.message
                : "Unknown connection error",
          });
        }
      });

    return () => controller.abort();
  }, [attempt]);

  const statusText =
    connection.kind === "checking"
      ? "Checking backend"
      : connection.kind === "online"
        ? "Backend connected"
        : "Backend unavailable";

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

        <div
          className={`connection connection--${connection.kind}`}
          role="status"
          aria-live="polite"
        >
          <span className="connection-dot" aria-hidden="true" />
          {statusText}
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <span className="eyebrow">SYSTEM OVERVIEW / S00-B</span>

          <h1>Warehouse intelligence, built on verified data.</h1>

          <p>
            WARETRACE connects warehouse operations, inspection,
            optimization and simulation through one integrated platform.
          </p>
        </section>

        <section className="status-grid" aria-label="System overview">
          <article className="status-card">
            <div className="card-label">API Connection</div>

            <h2>{statusText}</h2>

            {connection.kind === "online" && (
              <p>
                {connection.data.service} · v
                {connection.data.version}
              </p>
            )}

            {connection.kind === "checking" && (
              <p>Contacting the FastAPI service...</p>
            )}

            {connection.kind === "offline" && (
              <p>
                {connection.reason}. Make sure the backend is running.
              </p>
            )}

            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setConnection({ kind: "checking" });
                setAttempt((current) => current + 1);
              }}
              disabled={connection.kind === "checking"}
            >
              Retry connection
            </button>
          </article>

          <article className="status-card">
            <div className="card-label">Current Development Stage</div>
            <h2>S00 — Foundation</h2>
            <p>
              Frontend and backend connectivity, configuration and
              automated checks.
            </p>
          </article>

          <article className="status-card">
            <div className="card-label">Next Milestone</div>
            <h2>S01 — Warehouse Core</h2>
            <p>
              PostgreSQL persistence, handling units, inventory and
              operational APIs.
            </p>
          </article>
        </section>

        <section className="modules-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PLANNED CAPABILITIES</span>
              <h2>Platform modules</h2>
            </div>
            <span className="section-note">
              Features become available in later stages.
            </span>
          </div>

          <div className="modules-grid">
            {modules.map((module) => (
              <article className="module-card" key={module.id}>
                <div className="module-topline">
                  <span className="module-id">{module.id}</span>
                  <span className="planned-label">Planned</span>
                </div>

                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>WARETRACE · Engineering Foundation</span>
        <span>Deterministic core · Evidence-first AI</span>
      </footer>
    </div>
  );
}
