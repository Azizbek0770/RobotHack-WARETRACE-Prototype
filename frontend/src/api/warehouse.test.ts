
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet } from "./client";
import {
  getExpectedInventory,
  getWarehouses,
} from "./warehouse";

vi.mock("./client", () => ({
  apiGet: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

const expectedInventoryPage = {
  items: [
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      bin_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      sku_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      expected_qty: 8,
      source: "SYNTHETIC",
      revision: 1,
      sku: {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        code: "SKU-001",
        name: "Calibration Kit",
      },
      bin: {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        code: "A-01",
      },
    },
  ],
  page: 1,
  page_size: 100,
  total: 1,
};

describe("warehouse API response validation", () => {
  it("accepts a valid paginated warehouse response", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [
        {
          id: "test-id",
          code: "RIX-DEMO",
          name: "Demo Warehouse",
          is_active: true,
        },
      ],
      page: 1,
      page_size: 100,
      total: 1,
    });

    const result = await getWarehouses();

    expect(result.total).toBe(1);
    expect(result.items[0].code).toBe("RIX-DEMO");
  });

  it("rejects an invalid API response", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [{ code: "RIX-DEMO" }],
      page: 1,
      page_size: 100,
      total: 1,
    });

    await expect(getWarehouses()).rejects.toThrow(
      "Invalid warehouse API response.",
    );
  });

  it("accepts SKU names and bins with only their brief fields", async () => {
    vi.mocked(apiGet).mockResolvedValue(expectedInventoryPage);

    await expect(
      getExpectedInventory("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).resolves.toEqual(expectedInventoryPage);
  });

  it("rejects expected inventory without an SKU name", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      ...expectedInventoryPage,
      items: [
        {
          ...expectedInventoryPage.items[0],
          sku: {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            code: "SKU-001",
          },
        },
      ],
    });

    await expect(
      getExpectedInventory("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).rejects.toThrow("Invalid warehouse API response.");
  });
});
