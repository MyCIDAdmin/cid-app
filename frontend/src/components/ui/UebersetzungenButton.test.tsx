import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/uebersetzung";
import { renderWithProviders } from "../../test/renderWithProviders";
import UebersetzungenButton from "./UebersetzungenButton";

vi.mock("../../api/uebersetzung");

const daten: api.UebersetzungDaten = {
  aktiv: true,
  felder: [
    {
      feld: "description",
      original: "Bonjour",
      html: false,
      sprachen: {
        de: { text: "Guten Tag", automatisch: true },
        fr: { text: "", automatisch: true },
        ar: { text: "", automatisch: true },
      },
    },
  ],
};

describe("UebersetzungenButton", () => {
  beforeEach(() => {
    vi.mocked(api.getUebersetzungen).mockResolvedValue(daten);
  });

  it("lädt die Übersetzungen beim Öffnen und speichert eine Korrektur", async () => {
    vi.mocked(api.speichereUebersetzung).mockResolvedValue(daten);
    renderWithProviders(<UebersetzungenButton modell="evenements.evenement" objektId="1" />);
    fireEvent.click(screen.getByText("uebersetzung.button"));
    const feld = await screen.findByDisplayValue("Guten Tag");
    fireEvent.change(feld, { target: { value: "Guten Abend" } });
    fireEvent.click(screen.getAllByText("uebersetzung.speichern")[0]);
    await waitFor(() =>
      expect(api.speichereUebersetzung).toHaveBeenCalledWith("evenements.evenement", "1", {
        feld: "description",
        sprache: "de",
        text: "Guten Abend",
      }),
    );
  });

  it("warnt, wenn DeepL nicht aktiv ist", async () => {
    vi.mocked(api.getUebersetzungen).mockResolvedValue({ ...daten, aktiv: false });
    renderWithProviders(<UebersetzungenButton modell="evenements.evenement" objektId="1" />);
    fireEvent.click(screen.getByText("uebersetzung.button"));
    expect(await screen.findByText("uebersetzung.inaktiv")).toBeInTheDocument();
    expect(screen.getByText("uebersetzung.neu")).toBeDisabled();
  });
});
