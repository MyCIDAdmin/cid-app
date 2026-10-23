import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QrScanner from "./QrScanner";

describe("QrScanner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("meldet, wenn der Browser keine Kamera anbietet", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    render(<QrScanner onCode={vi.fn()} />);
    expect(await screen.findByText("scan_kamera_fehlt")).toBeInTheDocument();
  });

  it("meldet, wenn der Kamerazugriff verweigert wird", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<QrScanner onCode={vi.fn()} />);
    expect(await screen.findByText("scan_kamera_verweigert")).toBeInTheDocument();
  });

  it("gibt die Kamera beim Schließen frei", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia } });
    const { unmount } = render(<QrScanner onCode={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
