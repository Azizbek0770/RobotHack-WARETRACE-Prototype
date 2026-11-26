import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  getBins,
  getSKUs,
  getWarehouses,
  getZones,
  type SKU,
  type StorageBin,
  type Warehouse,
  type Zone,
} from "../../api/warehouse";
import { ApiWarehouseProvider } from "../warehouse-3d/services/apiProvider";
import {
  compareAudit,
  getAudit,
  getAuditSnapshot,
  importObservationCsv,
  listAudits,
  listFindingActions,
  listFindings,
  listObservations,
  recordFindingAction,
  recordManualObservation,
  startAudit,
  type AuditFinding,
  type AuditSession,
  type AuditSnapshot,
  type FindingAction,
  type FindingActionType,
  type FindingState,
  type FindingType,
  type StockObservation,
} from "./api";

const Warehouse3DViewer = lazy(() =>
  import("../warehouse-3d").then(({ Warehouse3DViewer: Viewer }) => ({
    default: Viewer,
  })),
);

type LoadState = "loading" | "ready" | "error";
type FindingFilter =
  | "ALL"
  | FindingState
  | FindingType;

const findingTypes: FindingType[] = [
  "MISSING",
  "EXCESS",
  "UNREGISTERED_HU",
  "MISPLACED_HU",
  "MATCH",
];

function findingSeverity(type: FindingType): "HIGH" | "MEDIUM" | "LOW" {
  if (type === "MISSING" || type === "EXCESS") return "HIGH";
  if (type === "MATCH") return "LOW";
  return "MEDIUM";
}

function findingPriority(type: FindingType): number {
  if (type === "MISSING" || type === "EXCESS") return 0;
  if (type === "UNREGISTERED_HU" || type === "MISPLACED_HU") return 1;
  return 2;
}

function statusPriority(status: FindingState): number {
  if (status === "OPEN") return 0;
  if (status === "REVIEWED") return 1;
  return 2;
}

function actionForStatus(status: FindingState): FindingActionType | null {
  if (status === "OPEN") return "REVIEW";
  if (status === "REVIEWED") return "RESOLVE";
  return null;
}

function typeLabel(type: FindingType): string {
  return type.replaceAll("_", " ");
}

function isFindingFilter(value: string): value is FindingFilter {
  return (
    value === "ALL" ||
    value === "OPEN" ||
    value === "REVIEWED" ||
    value === "RESOLVED" ||
    findingTypes.some((type) => type === value)
  );
}

function displayDelta(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

function sortFindings(
  findings: AuditFinding[],
  observationsById: Map<string, StockObservation>,
  binsById: Map<string, StorageBin>,
  skusById: Map<string, SKU>,
): AuditFinding[] {
  return [...findings].sort((left, right) => {
    const stateDifference =
      statusPriority(left.status) - statusPriority(right.status);
    if (stateDifference) return stateDifference;

    const priorityDifference =
      findingPriority(left.finding_type) - findingPriority(right.finding_type);
    if (priorityDifference) return priorityDifference;

    const varianceDifference =
      Math.abs(right.discrepancy_qty ?? 0) -
      Math.abs(left.discrepancy_qty ?? 0);
    if (varianceDifference) return varianceDifference;

    const leftObservation = observationsById.get(left.observation_id);
    const rightObservation = observationsById.get(right.observation_id);
    const leftBin = binsById.get(leftObservation?.bin_id ?? "")?.code ?? "";
    const rightBin = binsById.get(rightObservation?.bin_id ?? "")?.code ?? "";
    const binDifference = leftBin.localeCompare(rightBin);
    if (binDifference) return binDifference;

    const leftSku = skusById.get(leftObservation?.sku_id ?? "")?.code ?? "";
    const rightSku = skusById.get(rightObservation?.sku_id ?? "")?.code ?? "";
    const skuDifference = leftSku.localeCompare(rightSku);
    return skuDifference || left.id.localeCompare(right.id);
  });
}

export default function AuditPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [bins, setBins] = useState<StorageBin[]>([]);
  const [audits, setAudits] = useState<AuditSession[]>([]);
  const [selectedAuditId, setSelectedAuditId] = useState("");
  const [audit, setAudit] = useState<AuditSession | null>(null);
  const [snapshot, setSnapshot] = useState<AuditSnapshot | null>(null);
  const [observations, setObservations] = useState<StockObservation[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [actions, setActions] = useState<FindingAction[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [focusedBinId, setFocusedBinId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FindingFilter>("ALL");
  const [catalogState, setCatalogState] = useState<LoadState>("loading");
  const [warehouseState, setWarehouseState] = useState<LoadState>("loading");
  const [auditState, setAuditState] = useState<LoadState>("ready");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [warehouseAttempt, setWarehouseAttempt] = useState(0);
  const [showStartForm, setShowStartForm] = useState(true);
  const [classification, setClassification] = useState<"SIMULATED" | "OPERATIONAL">(
    "SIMULATED",
  );
  const [startedBy, setStartedBy] = useState("");
  const [observedBy, setObservedBy] = useState("");
  const [supervisorActor, setSupervisorActor] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [observationBinId, setObservationBinId] = useState("");
  const [observationSkuId, setObservationSkuId] = useState("");
  const [observedQuantity, setObservedQuantity] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const warehouseProvider = useMemo(
    () =>
      new ApiWarehouseProvider({
        baseUrl: import.meta.env.VITE_API_BASE_URL || "/api/v1",
        pageSize: 100,
      }),
    [],
  );

  const zonesById = useMemo(
    () => new Map(zones.map((zone) => [zone.id, zone])),
    [zones],
  );
  const binsById = useMemo(
    () => new Map(bins.map((bin) => [bin.id, bin])),
    [bins],
  );
  const skusById = useMemo(
    () => new Map(skus.map((sku) => [sku.id, sku])),
    [skus],
  );
  const observationsById = useMemo(
    () => new Map(observations.map((observation) => [observation.id, observation])),
    [observations],
  );
  const snapshotByPair = useMemo(
    () =>
      new Map(
        (snapshot?.items ?? []).map((item) => [
          `${item.bin_id}:${item.sku_id}`,
          item,
        ]),
      ),
    [snapshot],
  );

  const orderedFindings = useMemo(
    () =>
      sortFindings(findings, observationsById, binsById, skusById),
    [findings, observationsById, binsById, skusById],
  );
  const visibleFindings = useMemo(
    () =>
      orderedFindings.filter((finding) => {
        if (filter === "ALL") return true;
        if (
          filter === "OPEN" ||
          filter === "REVIEWED" ||
          filter === "RESOLVED"
        ) {
          return finding.status === filter;
        }
        return finding.finding_type === filter;
      }),
    [filter, orderedFindings],
  );
  const selectedFinding = findings.find(
    (finding) => finding.id === selectedFindingId,
  );
  const selectedObservation = selectedFinding
    ? observationsById.get(selectedFinding.observation_id)
    : undefined;
  const selectedBin = selectedObservation
    ? binsById.get(selectedObservation.bin_id)
    : undefined;
  const selectedSku = selectedObservation
    ? skusById.get(selectedObservation.sku_id)
    : undefined;
  const affectedBinIds = useMemo(
    () =>
      Array.from(
        new Set(
          findings
            .filter((finding) => finding.finding_type !== "MATCH")
            .map((finding) => observationsById.get(finding.observation_id)?.bin_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
    [findings, observationsById],
  );
  const metrics = useMemo(() => {
    const stockResults = findings.filter(
      (finding) => finding.expected_qty !== null,
    );
    return {
      observations: observations.length,
      comparedPairs: stockResults.length,
      open: findings.filter((finding) => finding.status === "OPEN").length,
      resolved: findings.filter((finding) => finding.status === "RESOLVED").length,
      absoluteVariance: stockResults.reduce(
        (total, finding) => total + Math.abs(finding.discrepancy_qty ?? 0),
        0,
      ),
    };
  }, [findings, observations.length]);

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
        setWarehouseId((current) =>
          current && warehousePage.items.some((item) => item.id === current)
            ? current
            : warehousePage.items[0]?.id ?? "",
        );
        if (warehousePage.items.length === 0) setWarehouseState("ready");
        setCatalogState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load warehouse and SKU records.",
        );
        setCatalogState("error");
      }
    }

    void loadCatalog();
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!warehouseId) return;
    const controller = new AbortController();

    async function loadWarehouse() {
      try {
        const [zoneItems, auditItems] = await Promise.all([
          getZones(warehouseId, controller.signal),
          listAudits(warehouseId, controller.signal),
        ]);
        const binGroups = await Promise.all(
          zoneItems.map((zone) => getBins(zone.id, controller.signal)),
        );
        if (controller.signal.aborted) return;
        setZones(zoneItems);
        setBins(binGroups.flat());
        setAudits(auditItems);
        setWarehouseState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load warehouse locations and audit sessions.",
        );
        setWarehouseState("error");
      }
    }

    void loadWarehouse();
    return () => controller.abort();
  }, [warehouseId, warehouseAttempt]);

  useEffect(() => {
    if (!selectedAuditId) return;
    const controller = new AbortController();

    async function loadAuditRecords() {
      try {
        const [auditRecord, snapshotRecord, observationRows, findingRows] =
          await Promise.all([
            getAudit(selectedAuditId, controller.signal),
            getAuditSnapshot(selectedAuditId, controller.signal),
            listObservations(selectedAuditId, controller.signal),
            listFindings(selectedAuditId, controller.signal),
          ]);
        if (controller.signal.aborted) return;
        setAudit(auditRecord);
        setSnapshot(snapshotRecord);
        setObservations(observationRows);
        setFindings(findingRows);
        const prioritized = sortFindings(
          findingRows,
          new Map(observationRows.map((row) => [row.id, row])),
          binsById,
          skusById,
        );
        setSelectedFindingId(prioritized[0]?.id ?? "");
        setFocusedBinId(
          observationRows.find(
            (observation) =>
              observation.id === prioritized[0]?.observation_id,
          )?.bin_id ?? null,
        );
        setAuditState("ready");
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load audit evidence.",
        );
        setAuditState("error");
      }
    }

    void loadAuditRecords();
    return () => controller.abort();
  }, [selectedAuditId, binsById, skusById]);

  useEffect(() => {
    if (!audit || !selectedFindingId) return;
    const controller = new AbortController();
    listFindingActions(audit.id, selectedFindingId, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setActions(rows);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load finding action history.",
        );
      });
    return () => controller.abort();
  }, [audit, selectedFindingId]);

  async function handleStartAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const newAudit = await startAudit({
        warehouse_id: warehouseId,
        request_key: `audit-${crypto.randomUUID()}`,
        started_by: startedBy.trim(),
        classification,
      });
      setAudits((current) => [newAudit, ...current]);
      setAuditState("loading");
      setAudit(null);
      setSnapshot(null);
      setObservations([]);
      setFindings([]);
      setActions([]);
      setSelectedFindingId("");
      setFocusedBinId(null);
      setSelectedAuditId(newAudit.id);
      setShowStartForm(false);
      setNotice(
        classification === "SIMULATED"
          ? "Simulated audit started; observations will be visibly marked SIMULATED."
          : "Operational audit started.",
      );
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start the audit.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function reloadAuditEvidence(auditId: string) {
    const [auditRecord, snapshotRecord, observationRows, findingRows] =
      await Promise.all([
        getAudit(auditId),
        getAuditSnapshot(auditId),
        listObservations(auditId),
        listFindings(auditId),
      ]);
    setAudit(auditRecord);
    setSnapshot(snapshotRecord);
    setObservations(observationRows);
    setFindings(findingRows);
    const prioritized = sortFindings(
      findingRows,
      new Map(observationRows.map((row) => [row.id, row])),
      binsById,
      skusById,
    );
    const nextSelectedFindingId = findingRows.some(
      (finding) => finding.id === selectedFindingId,
    )
      ? selectedFindingId
      : prioritized[0]?.id ?? "";
    setSelectedFindingId(nextSelectedFindingId);
    setFocusedBinId(
      observationRows.find(
        (observation) =>
          observation.id ===
          findingRows.find(
            (finding) => finding.id === nextSelectedFindingId,
          )?.observation_id,
      )?.bin_id ?? null,
    );
  }

  async function handleManualObservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audit) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await recordManualObservation(audit.id, {
        bin_id: observationBinId,
        sku_id: observationSkuId,
        observed_qty: Number(observedQuantity),
        observed_by: observedBy.trim(),
      });
      setObservations((current) => [...current, saved]);
      setObservedQuantity("");
      setNotice(
        `Recorded ${saved.classification.toLowerCase()} observation for ${
          binsById.get(saved.bin_id)?.code ?? "selected bin"
        }.`,
      );
    } catch (observationError) {
      setError(
        observationError instanceof Error
          ? observationError.message
          : "Unable to record the observation.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCsvImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audit || !csvFile) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await importObservationCsv(
        audit.id,
        csvFile,
        observedBy.trim(),
      );
      setObservations((current) => [...current, ...result.observations]);
      setCsvFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setNotice(
        `Imported ${result.imported_count} validated ${
          audit.classification.toLowerCase()
        } observation${result.imported_count === 1 ? "" : "s"}.`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to import the CSV file.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCompare() {
    if (!audit) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await compareAudit(audit.id);
      await reloadAuditEvidence(audit.id);
      setNotice(
        "Comparison complete. Findings use the audit-start snapshot; inventory was not changed.",
      );
    } catch (comparisonError) {
      setError(
        comparisonError instanceof Error
          ? comparisonError.message
          : "Unable to compare this audit.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleFindingAction() {
    if (!audit || !selectedFinding) return;
    const action = actionForStatus(selectedFinding.status);
    if (!action) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const savedAction = await recordFindingAction(
        audit.id,
        selectedFinding.id,
        {
          action,
          actor: supervisorActor.trim(),
          note: actionNote.trim() || undefined,
        },
      );
      await reloadAuditEvidence(audit.id);
      setActions(await listFindingActions(audit.id, selectedFinding.id));
      setActionNote("");
      setNotice(`${savedAction.action} action recorded. Expected stock is unchanged.`);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to record the finding action.",
      );
    } finally {
      setSaving(false);
    }
  }

  function chooseWarehouse(id: string) {
    setWarehouseId(id);
    setWarehouseState("loading");
    setSelectedAuditId("");
    setAuditState("ready");
    setAudit(null);
    setSnapshot(null);
    setObservations([]);
    setFindings([]);
    setActions([]);
    setSelectedFindingId("");
    setFocusedBinId(null);
    setAudits([]);
    setShowStartForm(true);
    setNotice("");
    setError("");
  }

  function chooseAudit(id: string) {
    setSelectedAuditId(id);
    setAuditState(id ? "loading" : "ready");
    setAudit(null);
    setSnapshot(null);
    setObservations([]);
    setFindings([]);
    setActions([]);
    setSelectedFindingId("");
    setFocusedBinId(null);
    setShowStartForm(false);
    setNotice("");
    setError("");
  }

  const warehouseLabel =
    warehouses.find((warehouse) => warehouse.id === warehouseId)?.code ??
    "Warehouse";
  const pairKey = `${observationBinId}:${observationSkuId}`;
  const currentObservation = observations.find(
    (observation) =>
      observation.bin_id === observationBinId &&
      observation.sku_id === observationSkuId,
  );
  const expectedForEntry =
    snapshotByPair.get(pairKey)?.expected_qty ?? 0;
  const comparedExpected = selectedFinding?.expected_qty;
  const actionToRecord = selectedFinding
    ? actionForStatus(selectedFinding.status)
    : null;

  return (
    <section className="audit-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">CHALLENGE 07 / INVENTORY CONTROL</span>
          <h1>Inventory Audit</h1>
          <p>
            Compare observed counts with an immutable audit-start snapshot,
            investigate evidence, and record a supervisor decision.
          </p>
        </div>
        <span className="audit-read-only-tag">NO STOCK AUTO-ADJUSTMENT</span>
      </div>

      {error && (
        <div className="notice notice--error" role="alert">
          <strong>Audit action could not be completed.</strong>
          <p>{error}</p>
        </div>
      )}
      {notice && (
        <div className="audit-notice" role="status">
          {notice}
        </div>
      )}

      {catalogState === "loading" && (
        <div className="notice" role="status">
          Loading warehouse and SKU records…
        </div>
      )}
      {catalogState === "error" && (
        <div className="notice notice--error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setCatalogState("loading");
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Retry catalog
          </button>
        </div>
      )}

      {catalogState === "ready" && warehouses.length === 0 && (
        <div className="notice" role="status">
          No warehouses are available for an audit.
        </div>
      )}

      {catalogState === "ready" && (
        <>
          <section className="panel audit-session-panel">
            <div className="audit-session-controls">
              <label className="field">
                <span>Warehouse</span>
                <select
                  aria-label="Warehouse"
                  value={warehouseId}
                  onChange={(event) => chooseWarehouse(event.target.value)}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Audit session</span>
                <select
                  aria-label="Audit session"
                  value={selectedAuditId}
                  disabled={audits.length === 0 || warehouseState !== "ready"}
                  onChange={(event) => chooseAudit(event.target.value)}
                >
                  <option value="">Select a saved session</option>
                  {audits.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.request_key} · {item.classification} · {item.status}
                    </option>
                  ))}
                </select>
              </label>

              {audit && !showStartForm && (
                <button
                  type="button"
                  className="secondary-button audit-new-session"
                  onClick={() => setShowStartForm(true)}
                >
                  Start another audit
                </button>
              )}
            </div>

            {warehouseState === "loading" && (
              <p className="muted" role="status">
                Loading bins and saved audit sessions…
              </p>
            )}
            {warehouseState === "error" && (
              <div className="notice notice--error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setWarehouseState("loading");
                    setError("");
                    setWarehouseAttempt((value) => value + 1);
                  }}
                >
                  Retry warehouse
                </button>
              </div>
            )}

            {showStartForm && warehouseId && (
              <form className="audit-start-form" onSubmit={handleStartAudit}>
                <div>
                  <h2>Start an audit</h2>
                  <p className="muted">
                    The backend snapshots expected quantities now. Simulated
                    is the recommended classification for this demo.
                  </p>
                </div>
                <label className="field">
                  <span>Data classification</span>
                  <select
                    aria-label="Data classification"
                    value={classification}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "SIMULATED" || value === "OPERATIONAL") {
                        setClassification(value);
                      }
                    }}
                  >
                    <option value="SIMULATED">SIMULATED — demo/test records</option>
                    <option value="OPERATIONAL">OPERATIONAL</option>
                  </select>
                </label>
                <label className="field">
                  <span>Started by</span>
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    value={startedBy}
                    onChange={(event) => setStartedBy(event.target.value)}
                    placeholder="Enter an actor label"
                  />
                </label>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    saving ||
                    warehouseState !== "ready" ||
                    startedBy.trim().length < 3
                  }
                >
                  {saving ? "Starting…" : "Start audit"}
                </button>
              </form>
            )}

            {audit && !showStartForm && (
              <div className="audit-session-summary">
                <div>
                  <span className="card-label">Active session</span>
                  <h2>{audit.request_key}</h2>
                  <p>
                    {warehouseLabel} · started by {audit.started_by} · snapshot{" "}
                    {new Date(audit.snapshot_taken_at).toLocaleString()}
                  </p>
                </div>
                <div className="audit-session-badges">
                  <span className={`classification-badge classification-${audit.classification.toLowerCase()}`}>
                    {audit.classification}
                  </span>
                  <span className="audit-state-badge">{audit.status}</span>
                </div>
              </div>
            )}
          </section>

          {auditState === "loading" && (
            <div className="notice" role="status">
              Loading persisted audit evidence…
            </div>
          )}

          {audit && auditState === "ready" && (
            <>
              {audit.classification === "SIMULATED" && (
                <div className="simulated-banner" role="note">
                  SIMULATED RECORDS — these observations are test/demo evidence,
                  not claims about live warehouse stock.
                </div>
              )}

              <section className="audit-metrics" aria-label="Audit metrics">
                <article className="audit-metric">
                  <span>Observed positions</span>
                  <strong>{metrics.observations}</strong>
                  <small>Persisted observation rows</small>
                </article>
                <article className="audit-metric">
                  <span>Compared pairs</span>
                  <strong>{metrics.comparedPairs}</strong>
                  <small>Persisted stock findings</small>
                </article>
                <article className="audit-metric">
                  <span>Open findings</span>
                  <strong>{metrics.open}</strong>
                  <small>Awaiting review</small>
                </article>
                <article className="audit-metric">
                  <span>Resolved findings</span>
                  <strong>{metrics.resolved}</strong>
                  <small>Recorded supervisor actions</small>
                </article>
                <article className="audit-metric">
                  <span>Absolute unit variance</span>
                  <strong>{metrics.absoluteVariance}</strong>
                  <small>Sum of absolute stock deltas</small>
                </article>
              </section>
              <p className="audit-metrics-note">
                Metrics are calculated from this audit’s persisted observations
                and findings; no financial savings or projected impact is inferred.
              </p>

              {audit.status === "OPEN" && (
                <section className="audit-entry-grid">
                  <form
                    className="panel audit-entry-panel"
                    onSubmit={handleManualObservation}
                  >
                    <div className="panel-heading">
                      <h2>Enter a count</h2>
                      <span>Manual observation</span>
                    </div>
                    <div className="audit-form-grid">
                      <label className="field">
                        <span>Bin</span>
                        <select
                          aria-label="Observation bin"
                          required
                          value={observationBinId}
                          onChange={(event) =>
                            setObservationBinId(event.target.value)
                          }
                        >
                          <option value="">Select bin</option>
                          {bins.map((bin) => (
                            <option key={bin.id} value={bin.id}>
                              {bin.code} —{" "}
                              {zonesById.get(bin.zone_id)?.code ?? "Zone"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>SKU</span>
                        <select
                          aria-label="Observation SKU"
                          required
                          value={observationSkuId}
                          onChange={(event) =>
                            setObservationSkuId(event.target.value)
                          }
                        >
                          <option value="">Select SKU</option>
                          {skus.map((sku) => (
                            <option key={sku.id} value={sku.id}>
                              {sku.code} — {sku.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Observed quantity</span>
                        <input
                          aria-label="Observed quantity"
                          required
                          type="number"
                          min={0}
                          step={1}
                          value={observedQuantity}
                          onChange={(event) =>
                            setObservedQuantity(event.target.value)
                          }
                          placeholder="0"
                        />
                      </label>
                      <label className="field">
                        <span>Observed by</span>
                        <input
                          required
                          minLength={3}
                          maxLength={120}
                          value={observedBy}
                          onChange={(event) => setObservedBy(event.target.value)}
                          placeholder="Enter counter actor label"
                        />
                      </label>
                    </div>
                    {observationBinId && observationSkuId && (
                      <p className="audit-snapshot-value">
                        Expected at audit start: <strong>{expectedForEntry}</strong>
                        {currentObservation && (
                          <span>
                            {" "}· This pair already has an observation; audits do not overwrite counts.
                          </span>
                        )}
                      </p>
                    )}
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={
                        saving ||
                        !observationBinId ||
                        !observationSkuId ||
                        !observedQuantity ||
                        observedBy.trim().length < 3 ||
                        Boolean(currentObservation)
                      }
                    >
                      Record observation
                    </button>
                  </form>

                  <form className="panel audit-entry-panel" onSubmit={handleCsvImport}>
                    <div className="panel-heading">
                      <h2>Import observations</h2>
                      <span>Validated CSV · atomic batch</span>
                    </div>
                    <p className="muted">
                      Columns: <code>bin_id,sku_id,observed_qty</code>.
                      Optional <code>handling_unit_codes</code> uses{" "}
                      <code>|</code> between codes. Maximum 2 MiB / 5,000 rows.
                    </p>
                    <label className="field">
                      <span>CSV file</span>
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".csv,text/csv"
                        aria-label="Observation CSV file"
                        required
                        onChange={(event) =>
                          setCsvFile(event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                    <button
                      type="submit"
                      className="secondary-button audit-upload-button"
                      disabled={saving || !csvFile || observedBy.trim().length < 3}
                    >
                      Import CSV
                    </button>
                    <p className="audit-hint">
                      Uses the same “Observed by” actor from the manual count form.
                    </p>
                  </form>
                </section>
              )}

              <section className="panel">
                <div className="panel-heading">
                  <h2>Observed versus expected</h2>
                  <span>{observations.length} recorded positions</span>
                </div>
                {observations.length === 0 ? (
                  <p className="muted">
                    No observations yet. Enter a count or import a CSV; an
                    unobserved bin/SKU pair is not treated as zero.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table audit-data-table">
                      <thead>
                        <tr>
                          <th>Bin</th>
                          <th>SKU</th>
                          <th>Expected snapshot</th>
                          <th>Observed</th>
                          <th>Delta</th>
                          <th>Source / actor</th>
                          <th>Data class</th>
                        </tr>
                      </thead>
                      <tbody>
                        {observations.map((observation) => {
                          const bin = binsById.get(observation.bin_id);
                          const sku = skusById.get(observation.sku_id);
                          const matchingFinding = findings.find(
                            (finding) =>
                              finding.observation_id === observation.id &&
                              finding.expected_qty !== null,
                          );
                          const expected =
                            matchingFinding?.expected_qty ??
                            snapshotByPair.get(
                              `${observation.bin_id}:${observation.sku_id}`,
                            )?.expected_qty ??
                            0;
                          const delta =
                            matchingFinding?.discrepancy_qty ??
                            observation.observed_qty - expected;
                          const compared = audit.status === "COMPARED";
                          return (
                            <tr key={observation.id}>
                              <td>{bin?.code ?? observation.bin_id}</td>
                              <td>{sku?.code ?? observation.sku_id}</td>
                              <td>{expected}</td>
                              <td>{observation.observed_qty}</td>
                              <td>
                                {compared ? displayDelta(delta) : "Pending"}
                              </td>
                              <td>
                                {observation.source} · {observation.observed_by}
                              </td>
                              <td>{observation.classification}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {audit.status === "OPEN" && observations.length > 0 && (
                  <div className="audit-compare-row">
                    <p className="muted">
                      Comparing freezes this audit. If expected inventory
                      changed after the snapshot, the backend rejects the
                      comparison and no findings are saved.
                    </p>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={saving}
                      onClick={handleCompare}
                    >
                      {saving ? "Comparing…" : "Compare with snapshot"}
                    </button>
                  </div>
                )}
              </section>

              {audit.status === "COMPARED" && (
                <section className="audit-findings-layout">
                  <div className="panel">
                    <div className="panel-heading audit-findings-heading">
                      <div>
                        <h2>Prioritized findings</h2>
                        <p className="muted">
                          Priority: open → reviewed → resolved; then stock
                          variance → HU identity → match; larger absolute unit
                          variance first; bin/SKU code breaks ties.
                        </p>
                      </div>
                      <label className="field audit-filter">
                        <span>Filter findings</span>
                        <select
                          aria-label="Filter findings"
                          value={filter}
                          onChange={(event) => {
                            if (isFindingFilter(event.target.value)) {
                              setFilter(event.target.value);
                            }
                          }}
                        >
                          <option value="ALL">All findings</option>
                          <option value="OPEN">Open</option>
                          <option value="REVIEWED">Reviewed</option>
                          <option value="RESOLVED">Resolved</option>
                          {findingTypes.map((type) => (
                            <option key={type} value={type}>
                              {typeLabel(type)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {visibleFindings.length === 0 ? (
                      <p className="muted">No findings match this filter.</p>
                    ) : (
                      <div className="audit-finding-list">
                        {visibleFindings.map((finding) => {
                          const observation = observationsById.get(
                            finding.observation_id,
                          );
                          const bin = binsById.get(observation?.bin_id ?? "");
                          const sku = skusById.get(observation?.sku_id ?? "");
                          const severity = findingSeverity(finding.finding_type);
                          return (
                            <button
                              className={`audit-finding-card ${
                                selectedFindingId === finding.id
                                  ? "audit-finding-card--selected"
                                  : ""
                              }`}
                              type="button"
                              key={finding.id}
                              aria-pressed={selectedFindingId === finding.id}
                              onClick={() => {
                                setSelectedFindingId(finding.id);
                                setActions([]);
                                setFocusedBinId(observation?.bin_id ?? null);
                              }}
                            >
                              <span
                                className={`audit-severity audit-severity--${severity.toLowerCase()}`}
                              >
                                {severity}
                              </span>
                              <span className="audit-finding-title">
                                {typeLabel(finding.finding_type)}
                              </span>
                              <span className="audit-finding-location">
                                {bin?.code ?? "Unknown bin"} ·{" "}
                                {sku?.code ?? finding.handling_unit_code ?? "HU evidence"}
                              </span>
                              <span className={`audit-finding-state audit-finding-state--${finding.status.toLowerCase()}`}>
                                {finding.status}
                              </span>
                              {finding.discrepancy_qty !== null && (
                                <span className="audit-finding-delta">
                                  Δ {displayDelta(finding.discrepancy_qty)}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <aside className="panel audit-detail" aria-label="Finding evidence">
                    {selectedFinding ? (
                      <>
                        <div className="panel-heading">
                          <h2>Finding evidence</h2>
                          <span>{selectedFinding.status}</span>
                        </div>
                        <span
                          className={`audit-severity audit-severity--${findingSeverity(
                            selectedFinding.finding_type,
                          ).toLowerCase()}`}
                        >
                          {findingSeverity(selectedFinding.finding_type)} ·{" "}
                          {typeLabel(selectedFinding.finding_type)}
                        </span>
                        <dl className="audit-evidence-list">
                          <div>
                            <dt>Warehouse / bin</dt>
                            <dd>
                              {warehouseLabel} · {selectedBin?.code ?? "Unknown"}
                            </dd>
                          </div>
                          <div>
                            <dt>Stable bin ID</dt>
                            <dd className="audit-uuid">{selectedBin?.id ?? selectedObservation?.bin_id ?? "—"}</dd>
                          </div>
                          <div>
                            <dt>SKU</dt>
                            <dd>
                              {selectedSku
                                ? `${selectedSku.code} — ${selectedSku.name}`
                                : "Not provided for this HU-only record"}
                            </dd>
                          </div>
                          {selectedFinding.expected_qty !== null && (
                            <>
                              <div>
                                <dt>Expected at snapshot</dt>
                                <dd>{comparedExpected}</dd>
                              </div>
                              <div>
                                <dt>Observed</dt>
                                <dd>{selectedFinding.observed_qty}</dd>
                              </div>
                              <div>
                                <dt>Observed − expected</dt>
                                <dd className="audit-evidence-delta">
                                  {displayDelta(selectedFinding.discrepancy_qty)}
                                </dd>
                              </div>
                              <div>
                                <dt>Snapshot revision</dt>
                                <dd>
                                  {snapshotByPair.get(
                                    `${selectedObservation?.bin_id}:${selectedObservation?.sku_id}`,
                                  )?.revision ?? "Expected row absent; zero baseline"}
                                </dd>
                              </div>
                            </>
                          )}
                          {selectedFinding.handling_unit_code && (
                            <>
                              <div>
                                <dt>Observed HU code</dt>
                                <dd>{selectedFinding.handling_unit_code}</dd>
                              </div>
                              <div>
                                <dt>Registered bin ID</dt>
                                <dd className="audit-uuid">
                                  {selectedFinding.registered_bin_id ?? "No registered HU"}
                                </dd>
                              </div>
                            </>
                          )}
                          <div>
                            <dt>Observation evidence</dt>
                            <dd>
                              {selectedObservation
                                ? `${selectedObservation.source} by ${selectedObservation.observed_by} · ${new Date(
                                    selectedObservation.created_at,
                                  ).toLocaleString()}`
                                : selectedFinding.observation_id}
                            </dd>
                          </div>
                          <div>
                            <dt>Data classification</dt>
                            <dd>{audit.classification}</dd>
                          </div>
                        </dl>

                        {actions.length > 0 && (
                          <div className="audit-action-history">
                            <h3>Recorded actions</h3>
                            {actions.map((action) => (
                              <p key={action.id}>
                                <strong>{action.action}</strong> · {action.actor}
                                {action.note ? ` · ${action.note}` : ""} ·{" "}
                                {new Date(action.created_at).toLocaleString()}
                              </p>
                            ))}
                          </div>
                        )}

                        {actionToRecord && (
                          <div className="audit-review-form">
                            <label className="field">
                              <span>
                                {actionToRecord === "REVIEW"
                                  ? "Supervisor actor"
                                  : "Resolving supervisor actor"}
                              </span>
                              <input
                                minLength={3}
                                maxLength={120}
                                value={supervisorActor}
                                onChange={(event) =>
                                  setSupervisorActor(event.target.value)
                                }
                                placeholder="Enter actor label"
                              />
                            </label>
                            <label className="field">
                              <span>Review note (optional)</span>
                              <input
                                maxLength={1000}
                                value={actionNote}
                                onChange={(event) =>
                                  setActionNote(event.target.value)
                                }
                                placeholder="Record the evidence-based decision"
                              />
                            </label>
                            <p className="audit-hint">
                              Actor labels are recorded as entered; this local
                              application does not authenticate supervisor roles.
                            </p>
                            <button
                              type="button"
                              className="primary-button"
                              disabled={saving || supervisorActor.trim().length < 3}
                              onClick={handleFindingAction}
                            >
                              {saving
                                ? "Saving…"
                                : actionToRecord === "REVIEW"
                                  ? "Record supervisor review"
                                  : "Resolve finding"}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="muted">
                        Select a finding to inspect its captured observation
                        and expected-stock snapshot.
                      </p>
                    )}
                  </aside>
                </section>
              )}

              {audit.status === "COMPARED" && (
                <section className="panel audit-3d-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Affected warehouse bins</h2>
                      <p className="muted">
                        Amber outlines show bins tied to non-match findings;
                        the selected finding uses its persisted bin UUID.
                      </p>
                    </div>
                    <span>{affectedBinIds.length} affected bins</span>
                  </div>
                  <div className="audit-3d-viewport">
                    <Suspense
                      fallback={
                        <div className="notice" role="status">
                          Loading the 3D warehouse viewer…
                        </div>
                      }
                    >
                      <Warehouse3DViewer
                        warehouseId={warehouseId}
                        dataProvider={warehouseProvider}
                        selectedBinId={focusedBinId}
                        highlightedBinIds={affectedBinIds}
                        onBinSelect={(bin) => setFocusedBinId(bin?.id ?? null)}
                        realtimeClient={null}
                        quality="lite"
                        className="audit-3d-canvas"
                      />
                    </Suspense>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}