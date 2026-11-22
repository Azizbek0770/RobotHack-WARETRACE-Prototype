import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CameraCapture from "./CameraCapture";

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
  vi.restoreAllMocks();
});

describe("Camera resource management", () => {
  it("explains camera unavailability", () => {
    const onError = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    render(<CameraCapture onPhoto={vi.fn()} onError={onError} />);
    fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("localhost or HTTPS"));
  });

  it("stops the hardware stream when the operator stops the camera", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<CameraCapture onPhoto={vi.fn()} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Scan current frame" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop camera" }));
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });

  it("releases camera tracks when the component unmounts", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const view = render(<CameraCapture onPhoto={vi.fn()} onError={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Scan current frame" })).toBeEnabled();
    });
    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
});
