import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBackendHealth } from "../src/api/health";
import { getSKUs, getWarehouses } from "../src/api/warehouse";
import App from "../src/app/App";

vi.mock("../src/api/health", () => ({
  fetchBackendHealth: vi.fn(),
}));

vi.mock("../src/api/warehouse", () => ({
  getWarehouses: vi.fn(),
  getSKUs: vi.fn(),
  getZones: vi.fn(),
  getBins: vi.fn(),
  getExpectedInventory: vi.fn(),
}));

const mockedHealth = vi.mocked(fetchBackendHealth);

describe("warehouse dashboard status", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedHealth.mockResolvedValue({
      status: "ok",
      service: "waretrace-api",
      version: "0.1.0",
    });

    vi.mocked(getWarehouses).mockResolvedValue({
      items: [],
      page: 1,
      page_size: 100,
      total: 0,
    });

    vi.mocked(getSKUs).mockResolvedValue({
      items: [],
      page: 1,
      page_size: 100,
      total: 0,
    });
  });

  it("shows active warehouse work and labels unfinished modules", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: "Warehouse intelligence starts with reliable data.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Warehouse Operations" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", { name: "Inventory Discrepancy Review" })
        .closest(".module-card"),
    ).toHaveTextContent("Available");
    expect(screen.getAllByText("Available")).toHaveLength(4);
    expect(screen.getAllByText("Placeholder")).toHaveLength(3);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
  });
});