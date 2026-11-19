import { describe, expect, it, vi } from "vitest";

import { apiGet } from "../src/api/client";
import { fetchBackendHealth } from "../src/api/health";

vi.mock("../src/api/client", () => ({
  apiGet: vi.fn(),
}));

const mockedApiGet = vi.mocked(apiGet);

describe("fetchBackendHealth", () => {
  it("returns a valid backend health response", async () => {
    mockedApiGet.mockResolvedValue({
      status: "ok",
      service: "waretrace-api",
      version: "0.1.0",
    });

    await expect(fetchBackendHealth()).resolves.toEqual({
      status: "ok",
      service: "waretrace-api",
      version: "0.1.0",
    });
  });

  it("rejects malformed backend responses", async () => {
    mockedApiGet.mockResolvedValue({ status: "ok" });

    await expect(fetchBackendHealth()).rejects.toThrow(
      "Unexpected backend health response.",
    );
  });
});