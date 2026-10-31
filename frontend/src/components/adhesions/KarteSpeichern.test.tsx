import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as karteBild from "../../utils/karteBild";
import KarteSpeichern from "./KarteSpeichern";

vi.mock("../../utils/karteBild", async () => {
  const actual = await vi.importActual<typeof karteBild>("../../utils/karteBild");
  return { ...actual, erzeugeKartenBild: vi.fn(), bildSpeichern: vi.fn() };
});

const daten = {
  stil: "gold",
  angebot: "CID PLUS",
  name: "Amel Bekir",
  vorteile: [],
  qr: "data:image/png;base64,AAAA",
};

describe("KarteSpeichern", () => {
  beforeEach(() => {
    vi.mocked(karteBild.erzeugeKartenBild).mockReset();
    vi.mocked(karteBild.bildSpeichern).mockReset();
  });

  it("erzeugt das Bild mit den Texten der App und speichert es unter dem Namen", async () => {
    const blob = new Blob(["png"]);
    vi.mocked(karteBild.erzeugeKartenBild).mockResolvedValue(blob);
    vi.mocked(karteBild.bildSpeichern).mockResolvedValue("geladen");
    renderWithProviders(<KarteSpeichern daten={daten} />);

    fireEvent.click(screen.getByRole("button", { name: "karte.speichern" }));

    await waitFor(() => expect(screen.getByText("karte.gespeichert")).toBeInTheDocument());
    const arg = vi.mocked(karteBild.erzeugeKartenBild).mock.calls[0][0];
    expect(arg).toMatchObject({ name: "Amel Bekir", qr: daten.qr });
    expect(arg.texte.titel).toBe("karte.titel");
    expect(karteBild.bildSpeichern).toHaveBeenCalledWith(blob, "mitgliedskarte-amel-bekir.png");
  });

  it("zeigt einen Fehler, wenn das Bild nicht entsteht, und lässt es erneut zu", async () => {
    vi.mocked(karteBild.erzeugeKartenBild).mockRejectedValue(new Error("kein Canvas"));
    renderWithProviders(<KarteSpeichern daten={daten} />);

    fireEvent.click(screen.getByRole("button", { name: "karte.speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("karte.speichern_fehler");
    expect(karteBild.bildSpeichern).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "karte.speichern" })).toBeEnabled();
  });

  it("sperrt den Knopf, solange das Bild erstellt wird", async () => {
    let fertig: (b: Blob) => void = () => {};
    vi.mocked(karteBild.erzeugeKartenBild).mockReturnValue(
      new Promise<Blob>((ok) => {
        fertig = ok;
      }),
    );
    vi.mocked(karteBild.bildSpeichern).mockResolvedValue("geteilt");
    renderWithProviders(<KarteSpeichern daten={daten} />);

    fireEvent.click(screen.getByRole("button", { name: "karte.speichern" }));
    expect(await screen.findByRole("button", { name: "karte.speichern_laeuft" })).toBeDisabled();
    fertig(new Blob(["x"]));
    await waitFor(() => expect(screen.getByText("karte.gespeichert")).toBeInTheDocument());
  });
});
