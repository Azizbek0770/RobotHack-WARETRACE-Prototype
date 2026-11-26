import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  }: {
    selectedBinId: string | null;
    highlightedBinIds: string[];
  }) => (
    <output
      data-testid="audit-warehouse-viewer"
      data-selected-bin-id={selectedBinId ?? ""}
      data-highlighted-bin-ids={highlightedBinIds.join(",")}
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
): auditApi.AuditSession {
  return {
    id,
    warehouse_id: warehouseId,
    request_key: requestKey,
    started_by: "Demo Operator",
    classification: "SIMULATED",
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
  vi.mocked(auditApi.startAudit).mockImplementation(async () => {
    const auditNumber = ++state.auditNumber;
    const audit = makeAudit(`audit-${auditNumber}`, `demo-audit-${auditNumber}`);
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
