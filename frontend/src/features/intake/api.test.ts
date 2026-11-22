import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiUpload } from "../../api/client";
import { decodePhoto } from "./api";

vi.mock("../../api/client", () => ({
  apiUpload: vi.fn(),
}));

beforeEach(() => vi.resetAllMocks());

describe("receiving decode adapter", () => {
  it("uploads a multipart image to the existing intake API", async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      codes: [{ value: "DEMO-2026", symbology: "QRCode" }],
    });
    const file = new File(["example"], "label.png", { type: "image/png" });

    await expect(decodePhoto(file)).resolves.toEqual([
      { value: "DEMO-2026", symbology: "QRCode" },
    ]);

    expect(apiUpload).toHaveBeenCalledWith(
      "/intake/decode",
      expect.any(FormData),
      undefined,
    );
    const sentForm = vi.mocked(apiUpload).mock.calls[0][1];
    expect((sentForm.get("image") as File).name).toBe("label.png");
  });

  it("rejects invalid decode API responses", async () => {
    vi.mocked(apiUpload).mockResolvedValue({
      codes: [{ value: 12345, symbology: "QRCode" }],
    });
    const file = new File(["example"], "label.png", { type: "image/png" });

    await expect(decodePhoto(file)).rejects.toThrow(
      "Unexpected scan service response",
    );
  });
});
