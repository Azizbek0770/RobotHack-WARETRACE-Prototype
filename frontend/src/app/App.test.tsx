
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBackendHealth } from "../api/health";
import {
  getBins,
  getExpectedInventory,
  getSKUs,
  getWarehouses,
  getZones,
} from "../api/warehouse";
import App from "./App";

vi.mock("../api/health", () => ({
  fetchBackendHealth: vi.fn(),
}));

vi.mock("../api/warehouse", () => ({
  getWarehouses: vi.fn(),
  getSKUs: vi.fn(),
  getZones: vi.fn(),
  getBins: vi.fn(),
  getExpectedInventory: vi.fn(),
}));

const warehouseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const zoneId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const binId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const skuId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(fetchBackendHealth).mockResolvedValue({
    status: "ok",
    service: "waretrace-api",
    version: "0.1.0",
  });

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
  ]);

  vi.mocked(getExpectedInventory).mockResolvedValue({
    items: [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        bin_id: binId,
        sku_id: skuId,
        expected_qty: 8,
        source: "SYNTHETIC",
        revision: 1,
        sku: {
          id: skuId,
          code: "SKU-001",
          name: "Calibration Kit",
        },
        bin: {
          id: binId,
          code: "A-01",
        },
      },
    ],
    page: 1,
    page_size: 100,
    total: 1,
  });
});

describe("WARETRACE operational frontend", () => {
  it("displays live backend and warehouse metrics", async () => {
    render(<App />);

    expect(
      await screen.findByText("Backend connected"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Expected stored units"),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("8"),
    ).toBeInTheDocument();

    expect(
      vi.mocked(getExpectedInventory),
    ).toHaveBeenCalledWith(
      warehouseId,
      expect.any(AbortSignal),
    );
  });

  it("navigates to real inventory and location data", async () => {
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Inventory & Locations",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Inventory & Locations",
      }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("Calibration Kit"),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("A-01")).toHaveLength(2);
    });

    expect(
      screen.getByLabelText("Warehouse"),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("Zone"),
    ).toBeInTheDocument();
  });

  it("shows an error when warehouse catalog requests fail", async () => {
    vi.mocked(getWarehouses).mockRejectedValue(
      new Error("Catalog unavailable"),
    );

    render(<App />);

    expect(
      await screen.findByText(
        "Unable to load warehouse metrics.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Catalog unavailable"),
    ).toBeInTheDocument();
  });

  it("reports backend connection failure", async () => {
    vi.mocked(fetchBackendHealth).mockRejectedValue(
      new Error("Connection refused"),
    );

    render(<App />);

    expect(
      await screen.findByText("Backend unavailable"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
  });
});
