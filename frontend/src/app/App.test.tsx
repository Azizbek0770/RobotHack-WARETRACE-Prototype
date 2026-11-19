
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBackendHealth } from "../api/health";
import App from "./App";

vi.mock("../api/health", () => ({
  fetchBackendHealth: vi.fn(),
}));

const mockedHealth = vi.mocked(fetchBackendHealth);

describe("WARETRACE dashboard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the connected backend", async () => {
    mockedHealth.mockResolvedValue({
      status: "ok",
      service: "waretrace-api",
      version: "0.1.0",
    });

    render(<App />);

    expect(
    await screen.findAllByText("Backend connected"),
    ).toHaveLength(2);

    expect(
      screen.getByText(/waretrace-api/),
    ).toBeInTheDocument();
  });

  it("handles backend connection failures", async () => {
    mockedHealth.mockRejectedValue(
      new Error("Connection refused"),
    );

    render(<App />);

    expect(
    await screen.findAllByText("Backend unavailable"),
    ).toHaveLength(2);

    expect(
      screen.getByText(/Connection refused/),
    ).toBeInTheDocument();
  });

});
