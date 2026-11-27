import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBins,
  getExpectedInventory,
  getSKUs,
  getWarehouses,
  getZones,
} from "../../api/warehouse";
import * as auditApi from "./api";
import AuditPage from "./AuditPage";

vi.mock("../../api/warehouse", () => ({
  getBins: vi.fn(),
  getExpectedInventory: vi.fn(),
  getSKUs: vi.fn(),
  getWarehouses: vi.fn(),
  getZones: vi.fn(),
}));

vi.mock("../warehouse-3d/services/apiProvider", () => ({
  ApiWarehouseProvider: class {
    constructor() {}
  },
}));

vi.mock("../warehouse-3d", () => ({
  Warehouse3DViewer: ({
    selectedBinId,
    highlightedBinIds,
    amrVisualization,
  }: {
    selectedBinId: string | null;
    highlightedBinIds: string[];
    amrVisualization?: { phase: string; pose: { mastExtension: number } } | null;
  }) => (
    <output
      data-testid="audit-warehouse-viewer"
      data-selected-bin-id={selectedBinId ?? ""}
      data-highlighted-bin-ids={highlightedBinIds.join(",")}
      data-amr-phase={amrVisualization?.phase ?? ""}
      data-amr-mast={
        amrVisualization ? String(amrVisualization.pose.mastExtension) : ""
      }
    />
  ),
}));

vi.mock("./api", () => ({
  compareAudit: vi.fn(),
  getAudit: vi.fn(),
  getAuditSnapshot: vi.fn(),
  importObservationCsv: vi.fn(),
  listAudits: vi.fn(),
  listFindingActions: vi.fn(),
  listFindings: vi.fn(),
  listObservations: vi.fn(),
  recordFindingAction: vi.fn(),
  recordManualObservation: vi.fn(),
  recordObservationEvent: vi.fn(),
  startAudit: vi.fn(),
}));

const warehouseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const zoneId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const binId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const secondBinId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const skuId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const secondSkuId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const timestamp = "2026-07-12T10:00:00.000Z";

const state = {
  audits: new Map<string, auditApi.AuditSession>(),
  observations: new Map<string, auditApi.StockObservation[]>(),
  findings: new Map<string, auditApi.AuditFinding[]>(),
  actions: new Map<string, auditApi.FindingAction[]>(),
  auditNumber: 0,
  observationNumber: 0,
  findingNumber: 0,
  actionNumber: 0,
};

function makeAudit(
  id: string,
  requestKey: string,
  status: auditApi.AuditState = "OPEN",
  classification: auditApi.AuditClassification = "SIMULATED",
): auditApi.AuditSession {
  return {
    id,
    warehouse_id: warehouseId,
    request_key: requestKey,
    started_by: "Demo Operator",
    classification,
    status,
    snapshot_taken_at: timestamp,
    created_at: timestamp,
  };
}

function makeFinding(
  auditId: string,
  observation: auditApi.StockObservation,
): auditApi.AuditFinding {
  const expected = observation.sku_id === skuId ? 8 : 4;
  const delta = observation.observed_qty - expected;
  return {
    id: `finding-${++state.findingNumber}`,
    audit_id: auditId,
    observation_id: observation.id,
    idempotency_key: `${auditId}:${observation.id}`,
    finding_type:
      delta < 0 ? "MISSING" : delta > 0 ? "EXCESS" : "MATCH",
    expected_qty: expected,
    observed_qty: observation.observed_qty,
    discrepancy_qty: delta,
    handling_unit_code: null,
    registered_bin_id: null,
    status: "OPEN",
    created_at: timestamp,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.resetAllMocks();
  state.audits.clear();
  state.observations.clear();
  state.findings.clear();
  state.actions.clear();
  state.auditNumber = 0;
  state.observationNumber = 0;
  state.findingNumber = 0;
  state.actionNumber = 0;

  vi.mocked(getWarehouses).mockResolvedValue({
    items: [
      {
        id: warehouseId,
        code: "RIX-DEMO",
        name: "WARETRACE Demo Warehouse",
        is_active: true,
      },
    ],
    page: 1,
    page_size: 100,
    total: 1,
  });
  vi.mocked(getSKUs).mockResolvedValue({
    items: [
      {
        id: skuId,
        code: "SKU-001",
        name: "Calibration Kit",
        unit_weight_g: "850.000",
        length_mm: "240.000",
        width_mm: "160.000",
        height_mm: "90.000",
        is_fragile: true,
      },
      {
        id: secondSkuId,
        code: "SKU-002",
        name: "Sensor Module",
        unit_weight_g: "250.000",
        length_mm: "110.000",
        width_mm: "75.000",
        height_mm: "45.000",
        is_fragile: true,
      },
    ],
    page: 1,
    page_size: 100,
    total: 1,
  });
  vi.mocked(getZones).mockResolvedValue([
    {
      id: zoneId,
      warehouse_id: warehouseId,
      code: "ST-A",
      name: "Storage A",
      kind: "STORAGE",
    },
  ]);
  vi.mocked(getBins).mockResolvedValue([
    {
      id: binId,
      zone_id: zoneId,
      code: "A-01",
      grid_x: 0,
      grid_y: 0,
      is_accessible: true,
      capacity_units: 30,
    },
    {
      id: secondBinId,
      zone_id: zoneId,
      code: "A-02",
      grid_x: 1,
      grid_y: 1,
      is_accessible: true,
      capacity_units: 30,
    },
  ]);
  vi.mocked(auditApi.listAudits).mockResolvedValue([]);
  vi.mocked(auditApi.startAudit).mockImplementation(async (request) => {
    const auditNumber = ++state.auditNumber;
    const audit = makeAudit(
      `audit-${auditNumber}`,
      `demo-audit-${auditNumber}`,
      "OPEN",
      request.classification,
    );
    state.audits.set(audit.id, audit);
    state.observations.set(audit.id, []);
    state.findings.set(audit.id, []);
    return audit;
  });
  vi.mocked(auditApi.getAudit).mockImplementation(async (auditId) => {
    const audit = state.audits.get(auditId);
    if (!audit) throw new Error("Audit not found in test state");
    return { ...audit };
  });
  vi.mocked(auditApi.getAuditSnapshot).mockImplementation(async (auditId) => ({
    audit_id: auditId,
    snapshot_taken_at: timestamp,
    items: [
      {
        expected_inventory_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        bin_id: binId,
        sku_id: skuId,
        expected_qty: 8,
        revision: 1,
      },
      {
        expected_inventory_id: "11111111-1111-4111-8111-111111111111",
        bin_id: secondBinId,
        sku_id: secondSkuId,
        expected_qty: 4,
        revision: 1,
      },
    ],
  }));
  vi.mocked(auditApi.listObservations).mockImplementation(
    async (auditId) => state.observations.get(auditId) ?? [],
  );
  vi.mocked(auditApi.listFindings).mockImplementation(
    async (auditId) =>
      (state.findings.get(auditId) ?? []).map((finding) => ({ ...finding })),
  );
  vi.mocked(auditApi.recordManualObservation).mockImplementation(
    async (auditId, request) => {
      const observation: auditApi.StockObservation = {
        id: `observation-${++state.observationNumber}`,
        audit_id: auditId,
        bin_id: request.bin_id,
        sku_id: request.sku_id,
        observed_qty: request.observed_qty,
        source: "MANUAL",
        observed_by: request.observed_by,
        source_device_id: null,
        source_event_id: null,
        source_observed_at: null,
        classification: "SIMULATED",
        handling_unit_codes: [],
        created_at: timestamp,
      };
      state.observations.set(auditId, [
        ...(state.observations.get(auditId) ?? []),
        observation,
      ]);
      return observation;
    },
  );
  vi.mocked(auditApi.recordObservationEvent).mockImplementation(
    async (auditId, request) => {
      const observation: auditApi.StockObservation = {
        id: `observation-${++state.observationNumber}`,
        audit_id: auditId,
        bin_id: request.bin_id,
        sku_id: request.sku_id,
        observed_qty: request.observed_qty,
        source: request.source,
        observed_by: request.observed_by,
        source_device_id: request.device_id,
        source_event_id: request.event_id,
        source_observed_at: request.observed_at,
        classification: state.audits.get(auditId)?.classification ?? "SIMULATED",
        handling_unit_codes: request.handling_unit_codes ?? [],
        created_at: timestamp,
      };
      state.observations.set(auditId, [
        ...(state.observations.get(auditId) ?? []),
        observation,
      ]);
      return observation;
    },
  );
  vi.mocked(auditApi.compareAudit).mockImplementation(async (auditId) => {
    const audit = state.audits.get(auditId);
    if (!audit) throw new Error("Audit not found in test state");
    audit.status = "COMPARED";
    const findings = (state.observations.get(auditId) ?? []).map((observation) =>
      makeFinding(auditId, observation),
    );
    state.findings.set(auditId, findings);
    return {
      audit_id: auditId,
      status: "COMPARED",
      finding_count: findings.length,
      counts_by_type: {
        MISSING: findings.filter((row) => row.finding_type === "MISSING").length,
        EXCESS: findings.filter((row) => row.finding_type === "EXCESS").length,
        MATCH: findings.filter((row) => row.finding_type === "MATCH").length,
        UNREGISTERED_HU: 0,
        MISPLACED_HU: 0,
      },
    };
  });
  vi.mocked(auditApi.listFindingActions).mockImplementation(
    async (_auditId, findingId) => state.actions.get(findingId) ?? [],
  );
  vi.mocked(auditApi.recordFindingAction).mockImplementation(
    async (_auditId, findingId, request) => {
      const finding = Array.from(state.findings.values())
        .flat()
        .find((row) => row.id === findingId);
      if (!finding) throw new Error("Finding not found in test state");
      const nextState =
        request.action === "REVIEW" ? "REVIEWED" : "RESOLVED";
      const action: auditApi.FindingAction = {
        id: `action-${++state.actionNumber}`,
        finding_id: findingId,
        action: request.action,
        from_status: finding.status,
        to_status: nextState,
        actor: request.actor,
        note: request.note ?? null,
        created_at: timestamp,
      };
      finding.status = nextState;
      state.actions.set(findingId, [
        ...(state.actions.get(findingId) ?? []),
        action,
      ]);
      return action;
    },
  );
});

describe("inventory audit demo flow", () => {
  it("labels simulated AMR evidence and highlights its stable bin ID", async () => {
    const audit = makeAudit("audit-amr", "simulated-amr-demo");
    const observation: auditApi.StockObservation = {
      id: "observation-amr-1",
      audit_id: audit.id,
      bin_id: binId,
      sku_id: skuId,
      observed_qty: 7,
      source: "SIMULATED_AMR",
      observed_by: "sim-amr-01",
      source_device_id: "sim-amr-01",
      source_event_id: "amr-event-0001",
      source_observed_at: timestamp,
      classification: "SIMULATED",
      handling_unit_codes: [],
      created_at: timestamp,
    };
    state.audits.set(audit.id, audit);
    state.observations.set(audit.id, []);
    vi.mocked(auditApi.listAudits).mockResolvedValue([audit]);

    render(<AuditPage />);
    const sessionSelect = await screen.findByLabelText("Audit session");
    await waitFor(() => {
      expect(sessionSelect).toBeEnabled();
    });
    fireEvent.change(sessionSelect, { target: { value: audit.id } });
    expect(await screen.findByText(/No observations yet/)).toBeInTheDocument();

    state.observations.set(audit.id, [observation]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh evidence" }));
    expect(
      await screen.findByText(
        "Simulated AMR · sim-amr-01 · event amr-event-0001 · sim-amr-01",
      ),
    ).toBeInTheDocument();
    const viewer = await screen.findByTestId("audit-warehouse-viewer");
    expect(viewer).toHaveAttribute("data-highlighted-bin-ids", binId);
    expect(screen.getByText(/SIMULATED RECORDS/)).toBeInTheDocument();
  });

  it("compares correct and discrepant counts, resolves evidence, and highlights the stable bin ID", async () => {
    render(<AuditPage />);

    await screen.findByRole("heading", { name: "Start an audit" });
    fireEvent.change(screen.getByPlaceholderText("Enter an actor label"), {
      target: { value: "Demo Operator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start audit" }));

    await screen.findByText("demo-audit-1");
    await enterAndCompareCount("8");
    expect(await screen.findByText("MATCH", { selector: ".audit-finding-title" }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start another audit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start audit" }));
    await screen.findByText("demo-audit-2");
    await enterCount("0", binId, skuId, "A-01");
    await enterCount("6", secondBinId, secondSkuId, "A-02");
    fireEvent.click(
      screen.getByRole("button", { name: "Compare with snapshot" }),
    );

    expect(await screen.findByText("MISSING", { selector: ".audit-finding-title" }))
      .toBeInTheDocument();
    expect(await screen.findByText("EXCESS", { selector: ".audit-finding-title" }))
      .toBeInTheDocument();
    expect(
      Array.from(
        document.querySelectorAll(".audit-finding-title"),
        (element) => element.textContent,
      ),
    ).toEqual(["MISSING", "EXCESS"]);
    expect(screen.getByText(/-8/, { selector: ".audit-finding-delta" }))
      .toBeInTheDocument();
    expect(screen.getByText(binId, { selector: ".audit-uuid" }))
      .toBeInTheDocument();

    const viewer = await screen.findByTestId("audit-warehouse-viewer");
    await waitFor(() => {
      expect(viewer).toHaveAttribute("data-selected-bin-id", binId);
      expect(viewer).toHaveAttribute(
        "data-highlighted-bin-ids",
        `${binId},${secondBinId}`,
      );
    });

    fireEvent.change(screen.getByLabelText("Filter findings"), {
      target: { value: "EXCESS" },
    });
    expect(screen.getAllByText("EXCESS", { selector: ".audit-finding-title" }))
      .toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Filter findings"), {
      target: { value: "ALL" },
    });

    fireEvent.change(screen.getByPlaceholderText("Enter actor label"), {
      target: { value: "Supervisor One" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Record the evidence-based decision"),
      { target: { value: "Count independently verified." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Record supervisor review" }),
    );
    await screen.findByText("REVIEW", { selector: "strong" });

    fireEvent.click(screen.getByRole("button", { name: "Resolve finding" }));
    await screen.findByText("RESOLVE", { selector: "strong" });
    expect(await screen.findAllByText("RESOLVED")).not.toHaveLength(0);
    expect(screen.getByText("1", { selector: ".audit-metric:nth-child(3) strong" }))
      .toBeInTheDocument();
    expect(screen.getByText("1", { selector: ".audit-metric:nth-child(4) strong" }))
      .toBeInTheDocument();

    expect(vi.mocked(auditApi.recordFindingAction)).toHaveBeenNthCalledWith(
      1,
      "audit-2",
      "finding-2",
      expect.objectContaining({ action: "REVIEW", actor: "Supervisor One" }),
    );
    expect(vi.mocked(auditApi.recordFindingAction)).toHaveBeenNthCalledWith(
      2,
      "audit-2",
      "finding-2",
      expect.objectContaining({ action: "RESOLVE", actor: "Supervisor One" }),
    );
    expect(getExpectedInventory).not.toHaveBeenCalled();
  });

  it("runs simulated AMR motion, mast elevation, explicit submission, mismatch, bin highlighting, and supervisor review", async () => {
    render(<AuditPage />);

    await screen.findByRole("heading", { name: "Start an audit" });
    fireEvent.change(screen.getByPlaceholderText("Enter an actor label"), {
      target: { value: "Demo Operator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start audit" }));
    await screen.findByText("demo-audit-1");

    const binSelect = (await screen.findByLabelText(
      "AMR target bin",
    )) as HTMLSelectElement;
    const skuSelect = (await screen.findByLabelText(
      "AMR target SKU",
    )) as HTMLSelectElement;
    expect(binSelect.value).toBe(binId);
    expect(skuSelect.value).toBe(skuId);

    const viewer = await screen.findByTestId("audit-warehouse-viewer");
    expect(viewer).toHaveAttribute("data-amr-phase", "IDLE");

    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });

    fireEvent.click(screen.getByRole("button", { name: "Start AMR mission" }));
    expect(viewer).toHaveAttribute("data-amr-phase", "TRAVELING");
    expect(auditApi.recordObservationEvent).not.toHaveBeenCalled();

    // Advance into travel then test Pause and Resume
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText(/\(Paused\)/)).toBeInTheDocument();
    const resumeButton = screen.getByRole("button", { name: "Resume" });
    expect(resumeButton).toBeEnabled();
    fireEvent.click(resumeButton);

    // Advance remaining timeline to complete travel, stopping, mast elevation, and simulated scan
    for (let step = 0; step < 320; step += 1) {
      if (viewer.getAttribute("data-amr-phase") === "SCANNED") break;
      await act(async () => {
        vi.advanceTimersByTime(32);
      });
    }

    vi.useRealTimers();

    expect(viewer).toHaveAttribute("data-amr-phase", "SCANNED");
    expect(viewer).toHaveAttribute("data-amr-mast", "1");
    expect(screen.getByText("Simulated scan complete")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("6 (Δ -2)")).toBeInTheDocument();

    // Must not auto-submit while animating or upon completing scan
    expect(auditApi.recordObservationEvent).not.toHaveBeenCalled();

    const submitButton = screen.getByRole("button", {
      name: "Submit SIMULATED_AMR observation",
    });
    expect(submitButton).toBeEnabled();
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(auditApi.recordObservationEvent).toHaveBeenCalledTimes(1);
    });
    expect(auditApi.recordObservationEvent).toHaveBeenCalledWith(
      "audit-1",
      expect.objectContaining({
        source: "SIMULATED_AMR",
        device_id: "sim-amr-01",
        observed_qty: 6,
        bin_id: binId,
        sku_id: skuId,
        observed_by: "sim-amr-01",
        event_id: expect.stringMatching(/^sim-amr-a-01-/),
      }),
    );

    const responseOutput = await screen.findByLabelText(
      "Persisted AMR observation response",
    );
    expect(responseOutput).toHaveTextContent("SIMULATED_AMR");
    expect(responseOutput).toHaveTextContent("sim-amr-01");
    expect(responseOutput).toHaveTextContent("6");

    // Duplicate submission is prevented after persistence
    const persistedButton = screen.getByRole("button", {
      name: "Observation persisted",
    });
    expect(persistedButton).toBeDisabled();
    fireEvent.click(persistedButton);
    expect(auditApi.recordObservationEvent).toHaveBeenCalledTimes(1);

    // Compare to produce deterministic MISSING -2 finding and highlight A-01
    fireEvent.click(
      screen.getByRole("button", { name: "Compare with snapshot" }),
    );
    expect(
      await screen.findByText("MISSING", { selector: ".audit-finding-title" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/-2/, { selector: ".audit-finding-delta" })).toBeInTheDocument();
    expect(viewer).toHaveAttribute("data-highlighted-bin-ids", binId);
    expect(viewer).toHaveAttribute("data-selected-bin-id", binId);

    // Complete supervisor review -> resolve workflow
    fireEvent.change(screen.getByPlaceholderText("Enter actor label"), {
      target: { value: "Supervisor One" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record supervisor review" }),
    );
    await screen.findByText("REVIEW", { selector: "strong" });
    fireEvent.click(screen.getByRole("button", { name: "Resolve finding" }));
    await screen.findByText("RESOLVE", { selector: "strong" });
    expect(getExpectedInventory).not.toHaveBeenCalled();
  });

  it("shows visible AMR submission failures, supports Reset AMR, and blocks SIMULATED_AMR on OPERATIONAL audits", async () => {
    vi.mocked(auditApi.recordObservationEvent).mockRejectedValueOnce(
      new Error("Observation source event has already been processed"),
    );

    render(<AuditPage />);
    await screen.findByRole("heading", { name: "Start an audit" });
    fireEvent.change(screen.getByPlaceholderText("Enter an actor label"), {
      target: { value: "Demo Operator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start audit" }));
    await screen.findByText("demo-audit-1");

    const viewer = await screen.findByTestId("audit-warehouse-viewer");
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Start AMR mission" }));
    for (let step = 0; step < 320; step += 1) {
      if (viewer.getAttribute("data-amr-phase") === "SCANNED") break;
      await act(async () => {
        vi.advanceTimersByTime(32);
      });
    }
    vi.useRealTimers();

    fireEvent.click(
      screen.getByRole("button", { name: "Submit SIMULATED_AMR observation" }),
    );
    expect(
      await screen.findByText("AMR observation could not be persisted."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Observation source event has already been processed")
        .length,
    ).toBeGreaterThan(0);

    // Lost-response reconciliation: if server actually persisted the event before response dropped,
    // clicking Submit again or Reconcile recovers the persisted record without duplicating.
    const persistedAfterDrop: auditApi.StockObservation = {
      id: "observation-reconciled-1",
      audit_id: "audit-1",
      bin_id: binId,
      sku_id: skuId,
      observed_qty: 6,
      source: "SIMULATED_AMR",
      observed_by: "sim-amr-01",
      source_device_id: "sim-amr-01",
      source_event_id: "sim-amr-a-01-reconciled",
      source_observed_at: timestamp,
      classification: "SIMULATED",
      handling_unit_codes: [],
      created_at: timestamp,
    };
    state.observations.set("audit-1", [persistedAfterDrop]);
    fireEvent.click(
      screen.getByRole("button", { name: "Reconcile from server" }),
    );
    expect(
      await screen.findByLabelText("Persisted AMR observation response"),
    ).toHaveTextContent("sim-amr-a-01-reconciled");
    expect(
      screen.getByRole("button", { name: "Observation persisted" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reset AMR" }));
    expect(viewer).toHaveAttribute("data-amr-phase", "IDLE");
    expect(viewer).toHaveAttribute("data-amr-mast", "0");

    // Operational audit rejects SIMULATED_AMR mission controls
    fireEvent.click(screen.getByRole("button", { name: "Start another audit" }));
    fireEvent.change(await screen.findByLabelText("Data classification"), {
      target: { value: "OPERATIONAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start audit" }));
    await screen.findByText("demo-audit-2");
    expect(
      await screen.findByText(/Simulated AMR missions require a SIMULATED audit/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start AMR mission" }),
    ).not.toBeInTheDocument();
  });

  async function enterAndCompareCount(quantity: string) {
    await enterCount(quantity, binId, skuId, "A-01");
    fireEvent.click(
      screen.getByRole("button", { name: "Compare with snapshot" }),
    );
    await waitFor(() => {
      expect(vi.mocked(auditApi.compareAudit)).toHaveBeenCalled();
    });
  }

  async function enterCount(
    quantity: string,
    selectedBinId: string,
    selectedSkuId: string,
    binCode: string,
  ) {
    fireEvent.change(screen.getByLabelText("Observation bin"), {
      target: { value: selectedBinId },
    });
    fireEvent.change(screen.getByLabelText("Observation SKU"), {
      target: { value: selectedSkuId },
    });
    fireEvent.change(screen.getByLabelText("Observed quantity"), {
      target: { value: quantity },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter counter actor label"), {
      target: { value: "Count Operator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record observation" }));
    await screen.findByText(`Recorded simulated observation for ${binCode}.`);
  }
});
