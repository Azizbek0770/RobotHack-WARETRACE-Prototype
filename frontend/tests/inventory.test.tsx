import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBackendHealth } from "../src/api/health";
import App from "../src/app/App";

vi.mock("../src/api/health", () => ({
  fetchBackendHealth: vi.fn(),
}));

const mockedHealth = vi.mocked(fetchBackendHealth);

describe("inventory module status", () => {
  beforeEach(() => {
    mockedHealth.mockResolvedValue({
      status: "ok",
      service: "waretrace-api",
      version: "0.1.0",
    });
  });

  it("keeps inventory marked as planned until implemented", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Inventory & Handling Units" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Planned")).toHaveLength(6);
  });
});