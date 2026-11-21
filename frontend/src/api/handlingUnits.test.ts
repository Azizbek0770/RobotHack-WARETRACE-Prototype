import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiGet, apiPost } from "./client";
import {
  createHandlingUnit,
  getHandlingUnit,
  getHUEvents,
  listHandlingUnits,
  moveHandlingUnit,
} from "./handlingUnits";

vi.mock("./client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const hu = {
  id: "hu-1",
  external_code: "HU-0001",
  sku_id: "sku-1",
  bin_id: null,
  quantity: 5,
  status: "RECEIVED",
  version: 1,
  sku: {
    id: "sku-1",
    code: "SKU-001",
    name: "Calibration Kit",
  },
  bin: null,
};

const event = {
  id: "event-1",
  hu_id: "hu-1",
  event_type: "HU_CREATED",
  from_bin_id: null,
  to_bin_id: null,
  before_status: null,
  after_status: "RECEIVED",
  quantity: 5,
  before_version: null,
  after_version: 1,
  source_label: "WARETRACE_DEMO_API",
  created_at: "2026-11-20T12:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("handling-unit API validation", () => {
  it("lists and retrieves valid handling units", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [hu],
      page: 1,
      page_size: 100,
      total: 1,
    });

    await expect(listHandlingUnits("HU-0001")).resolves.toEqual({
      items: [hu],
      page: 1,
      page_size: 100,
      total: 1,
    });

    expect(apiGet).toHaveBeenCalledWith(
      "/handling-units?page_size=100&search=HU-0001",
      undefined,
    );

    vi.mocked(apiGet).mockResolvedValue(hu);
    await expect(getHandlingUnit("hu-1")).resolves.toEqual(hu);
  });

  it("rejects malformed handling-unit pages", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [{ ...hu, quantity: -1 }],
      page: 1,
      page_size: 100,
      total: 1,
    });

    await expect(listHandlingUnits()).rejects.toThrow(
      "Unexpected paginated API response",
    );
  });

  it("validates event quantities and versions", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      items: [event],
      page: 1,
      page_size: 100,
      total: 1,
    });

    await expect(getHUEvents("hu-1")).resolves.toEqual({
      items: [event],
      page: 1,
      page_size: 100,
      total: 1,
    });

    vi.mocked(apiGet).mockResolvedValue({
      items: [{ ...event, quantity: 0 }],
      page: 1,
      page_size: 100,
      total: 1,
    });

    await expect(getHUEvents("hu-1")).rejects.toThrow(
      "Unexpected paginated API response",
    );
  });

  it("creates and moves handling units through POST", async () => {
    vi.mocked(apiPost).mockResolvedValue(hu);

    await expect(
      createHandlingUnit({
        external_code: "HU-0001",
        sku_id: "sku-1",
        quantity: 5,
      }),
    ).resolves.toEqual(hu);

    await expect(
      moveHandlingUnit("hu-1", {
        target_bin_id: "bin-1",
        expected_version: 1,
      }),
    ).resolves.toEqual(hu);

    expect(apiPost).toHaveBeenNthCalledWith(
      1,
      "/handling-units",
      {
        external_code: "HU-0001",
        sku_id: "sku-1",
        quantity: 5,
      },
    );
    expect(apiPost).toHaveBeenNthCalledWith(
      2,
      "/handling-units/hu-1/move",
      {
        target_bin_id: "bin-1",
        expected_version: 1,
      },
    );
  });
});
