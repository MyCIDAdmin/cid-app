import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { renderWithProviders } from "../../test/renderWithProviders";
import ReiseNeuPage from "./ReiseNeuPage";

vi.mock("../../api/reisen");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReiseNeuPage", () => {
  it("lässt ohne Titel nicht weiter und legt nach drei Schritten die Reise an", async () => {
    vi.mocked(api.createReise).mockResolvedValue({ id: "neu1" });
    renderWithProviders(<ReiseNeuPage />, { route: "/reisen/neu", path: "/reisen/neu" });

    expect(screen.getByRole("button", { name: "neu.weiter" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("neu.titel"), {
      target: { value: "Hamburg Wochenende" },
    });
    fireEvent.click(screen.getByRole("button", { name: "neu.weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "neu.weiter" }));
    fireEvent.click(screen.getByLabelText(/vorlage\.wochenende/));
    fireEvent.click(screen.getByRole("button", { name: "neu.erstellen" }));

    await waitFor(() => expect(api.createReise).toHaveBeenCalledTimes(1));
    const daten = vi.mocked(api.createReise).mock.calls[0][0];
    expect(daten).toMatchObject({
      titel: "Hamburg Wochenende",
      sichtbarkeit: "eingeladen",
      beitritt: "genehmigung",
      vorlage: "wochenende",
    });
    expect(daten.rencontre).toBeUndefined();
  });

  it("übernimmt Stadion und Stadt aus dem Spielplan und gibt das Spiel mit", async () => {
    vi.mocked(api.getStadionVorschlag).mockResolvedValue({
      gegner: "USM Alger",
      stadion: "Stade 5 Juillet",
      stadt: "Algier",
      land: "Algerien",
    });
    vi.mocked(api.createReise).mockResolvedValue({ id: "neu2" });
    renderWithProviders(<ReiseNeuPage />, {
      route: "/reisen/neu?rencontre=m1",
      path: "/reisen/neu",
    });

    await waitFor(() =>
      expect(screen.getByLabelText("neu.stadion")).toHaveValue("Stade 5 Juillet"),
    );
    expect(screen.getByLabelText("neu.ziel_ort")).toHaveValue("Algier");
    // Titel ist beim Spielplan-Weg optional.
    fireEvent.click(screen.getByRole("button", { name: "neu.weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "neu.weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "neu.erstellen" }));

    await waitFor(() => expect(api.createReise).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.createReise).mock.calls[0][0]).toMatchObject({
      rencontre: "m1",
      stadion: "Stade 5 Juillet",
      ziel_ort: "Algier",
      land: "Algerien",
      vorlage: "auswaerts_ausland",
    });
  });
});
