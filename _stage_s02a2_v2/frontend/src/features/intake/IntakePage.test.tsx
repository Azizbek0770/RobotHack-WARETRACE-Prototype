import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getHandlingUnitByCode } from "../../api/handlingUnits";
import { decodePhoto } from "./api";
import IntakePage from "./IntakePage";

vi.mock("../../api/handlingUnits", () => ({ getHandlingUnitByCode: vi.fn() }));
vi.mock("./api", () => ({ decodePhoto: vi.fn() }));

const hu = {
  id: "test-uuid",
  external_code: "HU-0001",
  sku_id: "sku-uuid",
  bin_id: "bin-uuid",
  quantity: 8,
  status: "STORED" as const,
  version: 2,
  sku: { id: "sku-uuid", code: "SKU-001", name: "Calibration Kit" },
  bin: { id: "bin-uuid", code: "A-01" },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getHandlingUnitByCode).mockResolvedValue(hu);
});

describe("Receiving scanner", () => {
  it("looks up an existing handling-unit label manually", async () => {
    render(<IntakePage />);
    fireEvent.change(screen.getByLabelText("Handling-unit code"), {
      target: { value: "hu-0001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up handling unit" }));
    expect(await screen.findByText("Calibration Kit")).toBeInTheDocument();
    expect(getHandlingUnitByCode).toHaveBeenCalledWith("HU-0001", expect.any(AbortSignal));
  });

  it("decodes an uploaded QR image and retrieves the matching HU", async () => {
    vi.mocked(decodePhoto).mockResolvedValue([{ value: "HU-0001", symbology: "QRCode" }]);
    render(<IntakePage />);
    const file = new File(["fake-png"], "label.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload PNG or JPEG image"), {
      target: { files: [file] },
    });
    expect(await screen.findByText("Calibration Kit")).toBeInTheDocument();
    expect(decodePhoto).toHaveBeenCalledWith(file, expect.any(AbortSignal));
  });

  it("shows an explicit empty-code result", async () => {
    vi.mocked(decodePhoto).mockResolvedValue([]);
    render(<IntakePage />);
    fireEvent.change(screen.getByLabelText("Upload PNG or JPEG image"), {
      target: { files: [new File(["x"], "label.png", { type: "image/png" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("No readable barcode");
    expect(getHandlingUnitByCode).not.toHaveBeenCalled();
  });

  it("does not silently select one of multiple detected codes", async () => {
    vi.mocked(decodePhoto).mockResolvedValue([
      { value: "HU-0001", symbology: "QRCode" },
      { value: "HU-0002", symbology: "Code128" },
    ]);
    render(<IntakePage />);
    fireEvent.change(screen.getByLabelText("Upload PNG or JPEG image"), {
      target: { files: [new File(["x"], "label.png", { type: "image/png" })] },
    });
    expect(await screen.findByText("Multiple codes detected")).toBeInTheDocument();
    expect(getHandlingUnitByCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /HU-0001 \(QRCode\)/ }));
    await waitFor(() => expect(getHandlingUnitByCode).toHaveBeenCalledOnce());
  });

  it("rejects scanned URLs instead of requesting them", async () => {
    vi.mocked(decodePhoto).mockResolvedValue([{ value: "https://example.com", symbology: "QRCode" }]);
    render(<IntakePage />);
    fireEvent.change(screen.getByLabelText("Upload PNG or JPEG image"), {
      target: { files: [new File(["x"], "label.png", { type: "image/png" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid handling-unit code");
    expect(getHandlingUnitByCode).not.toHaveBeenCalled();
  });

  it("accepts valid non-HU-prefix labels defined by the backend schema", async () => {
    render(<IntakePage />);
    fireEvent.change(screen.getByLabelText("Handling-unit code"), {
      target: { value: "demo-2026" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up handling unit" }));
    await waitFor(() => {
      expect(getHandlingUnitByCode).toHaveBeenCalledWith("DEMO-2026", expect.any(AbortSignal));
    });
  });

  it("rejects oversized uploads before calling the API", async () => {
    render(<IntakePage />);
    const hugeFile = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload PNG or JPEG image"), {
      target: { files: [hugeFile] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("smaller than 3 MiB");
    expect(decodePhoto).not.toHaveBeenCalled();
  });
});
