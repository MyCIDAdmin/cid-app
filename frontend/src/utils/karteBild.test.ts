import { afterEach, describe, expect, it, vi } from "vitest";

import { bildDateiname, bildSpeichern } from "./karteBild";

describe("bildDateiname", () => {
  it("macht aus dem Namen einen sicheren Dateinamen", () => {
    expect(bildDateiname("Amel Bekir")).toBe("mitgliedskarte-amel-bekir.png");
    expect(bildDateiname("Ahmed Ghazi Habita")).toBe("mitgliedskarte-ahmed-ghazi-habita.png");
    expect(bildDateiname("Zoë Müller-Çelik")).toBe("mitgliedskarte-zoe-muller-celik.png");
  });

  it("verträgt leere und ungewöhnliche Namen", () => {
    expect(bildDateiname("")).toBe("mitgliedskarte.png");
    expect(bildDateiname("../../etc/passwd")).toBe("mitgliedskarte-etc-passwd.png");
    expect(bildDateiname("  !!  ")).toBe("mitgliedskarte.png");
  });
});

describe("bildSpeichern", () => {
  const blob = new Blob(["png"], { type: "image/png" });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error Testaufräumen
    delete navigator.share;
    // @ts-expect-error Testaufräumen
    delete navigator.canShare;
  });

  function downloadStubs() {
    const url = vi.fn(() => "blob:test");
    const widerrufen = vi.fn();
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: widerrufen });
    const klick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return { url, klick };
  }

  it("lädt ohne Teilen-Menü als Datei herunter", async () => {
    const { url, klick } = downloadStubs();
    await expect(bildSpeichern(blob, "karte.png")).resolves.toBe("geladen");
    expect(url).toHaveBeenCalledWith(blob);
    expect(klick).toHaveBeenCalledTimes(1);
  });

  it("nutzt das Teilen-Menü, wenn Dateien geteilt werden können", async () => {
    const teilen = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: teilen, canShare: () => true });
    const { klick } = downloadStubs();
    await expect(bildSpeichern(blob, "karte.png")).resolves.toBe("geteilt");
    expect(teilen).toHaveBeenCalledTimes(1);
    expect(teilen.mock.calls[0][0].files[0].name).toBe("karte.png");
    expect(klick).not.toHaveBeenCalled();
  });

  it("behandelt Abbruch im Teilen-Menü nicht als Fehler und lädt nichts herunter", async () => {
    const abbruch = new DOMException("abgebrochen", "AbortError");
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(abbruch), canShare: () => true });
    const { klick } = downloadStubs();
    await expect(bildSpeichern(blob, "karte.png")).resolves.toBe("geteilt");
    expect(klick).not.toHaveBeenCalled();
  });

  it("fällt bei einem Teilen-Fehler auf den Download zurück", async () => {
    Object.assign(navigator, {
      share: vi.fn().mockRejectedValue(new Error("nicht erlaubt")),
      canShare: () => true,
    });
    const { klick } = downloadStubs();
    await expect(bildSpeichern(blob, "karte.png")).resolves.toBe("geladen");
    expect(klick).toHaveBeenCalledTimes(1);
  });
});
