import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { entscheidung, option } from "../../test/reisenDaten";
import { renderWithProviders } from "../../test/renderWithProviders";
import EntscheidungKarte from "./EntscheidungKarte";

vi.mock("../../api/reisen");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const karte = (e = entscheidung(), voll = true, kannVerwalten = false) =>
  renderWithProviders(
    <EntscheidungKarte
      reiseId="r1"
      e={e}
      kannVerwalten={kannVerwalten}
      vorschlaegeErlaubt
      voll={voll}
    />,
  );

describe("EntscheidungKarte", () => {
  it("stimmt bei einer Auswahl mit genau einer Option ab", async () => {
    vi.mocked(api.stimmeAb).mockResolvedValue(entscheidung());
    karte();
    fireEvent.click(screen.getAllByRole("button", { name: "entscheidung.waehlen" })[1]);
    await waitFor(() =>
      expect(api.stimmeAb).toHaveBeenCalledWith("r1", "e1", [{ option: "o2", wert: "ja" }]),
    );
  });

  it("ersetzt bei einer Auswahl die bisherige Stimme", async () => {
    vi.mocked(api.stimmeAb).mockResolvedValue(entscheidung());
    karte(
      entscheidung({
        optionen: [option({ meine: "ja" }), option({ id: "o2", titel: "Mit Umstieg" })],
      }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "entscheidung.waehlen" })[1]);
    await waitFor(() =>
      expect(api.stimmeAb).toHaveBeenCalledWith("r1", "e1", [{ option: "o2", wert: "ja" }]),
    );
  });

  it("bei der Terminfindung zählt jede Option einzeln mit Ja, Vielleicht oder Nein", async () => {
    vi.mocked(api.stimmeAb).mockResolvedValue(entscheidung());
    karte(
      entscheidung({
        typ: "termin",
        optionen: [
          option({ id: "t1", titel: "Fr–So" }),
          option({ id: "t2", titel: "Sa–Mo", meine: "nein" }),
        ],
      }),
    );
    const gruppe = screen.getByRole("group", { name: "Fr–So" });
    fireEvent.click(gruppe.querySelectorAll("button")[1]);
    await waitFor(() =>
      expect(api.stimmeAb).toHaveBeenCalledWith("r1", "e1", [
        { option: "t2", wert: "nein" },
        { option: "t1", wert: "vielleicht" },
      ]),
    );
  });

  it("Interessierte ohne Mitreise-Status und geschlossene Entscheidungen haben keine Abstimm-Knöpfe", () => {
    karte(entscheidung(), false);
    expect(screen.queryByRole("button", { name: "entscheidung.waehlen" })).not.toBeInTheDocument();
    cleanup();
    karte(entscheidung({ status: "beschlossen", beschluss: null }), true);
    expect(screen.queryByRole("button", { name: "entscheidung.waehlen" })).not.toBeInTheDocument();
  });

  it("zeigt Namen der Wählenden nur, wenn das Backend sie mitliefert", () => {
    karte(
      entscheidung({
        optionen: [
          option({
            stimmen: { ja: 1, vielleicht: 0, nein: 0 },
            waehler: { ja: ["Amel"], vielleicht: [], nein: [] },
          }),
          option({
            id: "o2",
            titel: "Mit Umstieg",
            stimmen: { ja: 1, vielleicht: 0, nein: 0 },
            waehler: null,
          }),
        ],
      }),
    );
    expect(screen.getByText(/Amel/)).toBeInTheDocument();
    expect(screen.getByTestId("stimmen-o2")).toHaveTextContent("1 / 0 / 0");
  });
});
