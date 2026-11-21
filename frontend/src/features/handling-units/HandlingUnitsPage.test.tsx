
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createHandlingUnit,
  getHandlingUnit,
  getHUEvents,
  listHandlingUnits,
  moveHandlingUnit,
  type HandlingUnit,
} from "../../api/handlingUnits";
import {
  getBins,
  getSKUs,
  getWarehouses,
  getZones,
} from "../../api/warehouse";
import HandlingUnitsPage from "./HandlingUnitsPage";

vi.mock("../../api/handlingUnits", () => ({
  createHandlingUnit: vi.fn(),
  getHandlingUnit: vi.fn(),
  getHUEvents: vi.fn(),
  listHandlingUnits: vi.fn(),
  moveHandlingUnit: vi.fn(),
}));

vi.mock("../../api/warehouse", () => ({
  getBins: vi.fn(),
  getSKUs: vi.fn(),
  getWarehouses: vi.fn(),
  getZones: vi.fn(),
}));

const warehouseId = "warehouse-1";
const zoneId = "zone-1";
const binId = "bin-1";
const skuId = "sku-1";

const sampleHU: HandlingUnit = {
  id: "hu-1",
  external_code: "HU-0001",
  sku_id: skuId,
  bin_id: null,
  quantity: 5,
  status: "RECEIVED",
  version: 1,
  sku: {
    id: skuId,
    code: "SKU-001",
    name: "Calibration Kit",
  },
  bin: null,
};

beforeEach(() => {
  vi.resetAllMocks();

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
    ],
    page: 1,
    page_size: 100,
    total: 1,
  });

  vi.mocked(getWarehouses).mockResolvedValue({
    items: [
      {
        id: warehouseId,
        code: "RIX-DEMO",
        name: "Demo Warehouse",
        is_active: true,
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
      code: "A-02",
      grid_x: 1,
      grid_y: 0,
      is_accessible: true,
      capacity_units: 30,
    },
  ]);

  vi.mocked(listHandlingUnits).mockResolvedValue({
    items: [sampleHU],
    page: 1,
    page_size: 100,
    total: 1,
  });

  vi.mocked(getHandlingUnit).mockResolvedValue(sampleHU);

  vi.mocked(getHUEvents).mockResolvedValue({
    items: [],
    page: 1,
    page_size: 100,
    total: 0,
  });

  vi.mocked(createHandlingUnit).mockResolvedValue({
    ...sampleHU,
    id: "hu-2",
    external_code: "HU-NEW",
    quantity: 3,
  });

  vi.mocked(moveHandlingUnit).mockResolvedValue({
    ...sampleHU,
    bin_id: binId,
    bin: { id: binId, code: "A-02" },
    status: "STORED",
    version: 2,
  });
});

describe("Handling Unit interface", () => {
  it("loads existing handling units and their details", async () => {
    render(<HandlingUnitsPage />);

    const huButton = await screen.findByRole("button", {
      name: /HU-0001/,
    });

    expect(huButton).toBeInTheDocument();

    expect(
      await screen.findByText("Calibration Kit"),
    ).toBeInTheDocument();

    expect(getHandlingUnit).toHaveBeenCalledWith(
      sampleHU.id,
      expect.any(AbortSignal),
    );

    expect(getHUEvents).toHaveBeenCalledWith(
      sampleHU.id,
      expect.any(AbortSignal),
    );
  });

  it("submits a valid incoming handling unit", async () => {
    render(<HandlingUnitsPage />);

    await screen.findByRole("option", {
      name: /SKU-001/,
    });

    fireEvent.change(screen.getByLabelText("HU label"), {
      target: { value: "HU-NEW" },
    });

    fireEvent.change(screen.getByLabelText("Product SKU"), {
      target: { value: skuId },
    });

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "3" },
    });

    const registerButton = screen.getByRole("button", {
      name: "Register HU",
    });
    fireEvent.submit(registerButton.closest("form")!);

    await waitFor(() => {
      expect(createHandlingUnit).toHaveBeenCalledWith({
        external_code: "HU-NEW",
        sku_id: skuId,
        quantity: 3,
      });
    });
  });

  it("submits a movement with the current HU version", async () => {
    render(<HandlingUnitsPage />);

    const destination = await screen.findByLabelText(
      "Destination storage bin",
    );

    fireEvent.change(destination, {
      target: { value: binId },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Book Movement" }),
    );

    await waitFor(() => {
      expect(moveHandlingUnit).toHaveBeenCalledWith(
        sampleHU.id,
        {
          target_bin_id: binId,
          expected_version: 1,
        },
      );
    });
  });

  it("displays a backend movement rejection", async () => {
    vi.mocked(moveHandlingUnit).mockRejectedValue(
      new Error("Stale handling unit version"),
    );

    render(<HandlingUnitsPage />);

    fireEvent.change(
      await screen.findByLabelText(
        "Destination storage bin",
      ),
      { target: { value: binId } },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Book Movement" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Stale handling unit version");
  });

  it("rejects invalid registration input before calling the API", async () => {
    render(<HandlingUnitsPage />);

    await screen.findByRole("option", {
      name: /SKU-001/,
    });

    fireEvent.change(screen.getByLabelText("HU label"), {
      target: { value: "bad label" },
    });
    fireEvent.change(screen.getByLabelText("Product SKU"), {
      target: { value: skuId },
    });
    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "1" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Register HU" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Use a valid HU label");
    expect(createHandlingUnit).not.toHaveBeenCalled();
  });

  it("searches by label or SKU and shows no-match state", async () => {
    vi.mocked(listHandlingUnits).mockResolvedValue({
      items: [],
      page: 1,
      page_size: 100,
      total: 0,
    });

    render(<HandlingUnitsPage />);

    fireEvent.change(
      await screen.findByLabelText("HU label or SKU code"),
      { target: { value: "NOT-FOUND" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Search" }),
    );

    expect(
      await screen.findByText("No matching handling units."),
    ).toBeInTheDocument();
    expect(listHandlingUnits).toHaveBeenCalledWith(
      "NOT-FOUND",
      expect.any(AbortSignal),
    );
  });

  it("hides movement controls for statuses that cannot move", async () => {
    vi.mocked(getHandlingUnit).mockResolvedValue({
      ...sampleHU,
      status: "QUARANTINED",
    });

    render(<HandlingUnitsPage />);

    expect(
      await screen.findByText(
        "This status requires another workflow",
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Book Movement" }),
    ).not.toBeInTheDocument();
  });
});
