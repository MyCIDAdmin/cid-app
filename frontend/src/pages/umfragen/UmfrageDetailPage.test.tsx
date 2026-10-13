import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../../i18n";
import * as hooks from "../../hooks/useUmfragen";
import { renderWithProviders } from "../../test/renderWithProviders";
import { umfrage } from "../../test/umfrageFixture";
import type { Umfrage } from "../../types/umfragen";
import UmfrageDetailPage from "./UmfrageDetailPage";

vi.mock("../../hooks/useUmfragen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useUmfragen");
  return {
    ...actual,
    useUmfrage: vi.fn(),
    useUmfrageTeilnehmen: vi.fn(),
    useUmfrageErgebnisse: vi.fn(),
  };
});

const teilnehmen = vi.fn();

function zeige(daten: Umfrage | undefined, fehler = false) {
  vi.mocked(hooks.useUmfrage).mockReturnValue({
    data: daten,
    isLoading: false,
    isError: fehler,
  } as unknown as ReturnType<typeof hooks.useUmfrage>);
  renderWithProviders(<UmfrageDetailPage />, { route: "/umfragen/u1", path: "/umfragen/:id" });
}

describe("UmfrageDetailPage", () => {
  beforeEach(() => {
    teilnehmen.mockReset();
    vi.mocked(hooks.useUmfrageTeilnehmen).mockReturnValue({
      mutate: teilnehmen,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useUmfrageTeilnehmen>);
    vi.mocked(hooks.useUmfrageErgebnisse).mockReturnValue({
      data: {
        teilnehmende: 3,
        anonym: true,
        fragen: [
          {
            id: "f1",
            text: "Welcher Tag?",
            typ: "einzel",
            optionen: [{ id: "o1", text: "Samstag", anzahl: 2, anteil: 67 }],
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useUmfrageErgebnisse>);
  });

  it("verlangt Pflichtfragen und sendet die gewählten Antworten", () => {
    zeige(umfrage());
    fireEvent.click(screen.getByRole("button", { name: "fragebogen.senden" }));
    expect(teilnehmen).not.toHaveBeenCalled();
    expect(screen.getByText("fragebogen.pflicht")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Sonntag"));
    fireEvent.change(screen.getByLabelText("Sonstiges"), { target: { value: "Gern" } });
    fireEvent.click(screen.getByRole("button", { name: "fragebogen.senden" }));
    expect(teilnehmen).toHaveBeenCalledWith(
      {
        id: "u1",
        antworten: [
          { frage: "f1", optionen: ["o2"] },
          { frage: "f2", text: "Gern" },
        ],
      },
      expect.any(Object),
    );
  });

  it("zeigt nach der Teilnahme Dank und – wenn freigegeben – die Ergebnisse", () => {
    zeige(umfrage({ teilgenommen: true, kann_ergebnisse_sehen: true }));
    expect(screen.queryByTestId("umfrage-fragebogen")).not.toBeInTheDocument();
    expect(screen.getByText(/danke/)).toBeInTheDocument();
    expect(screen.getByTestId("umfrage-ergebnisse")).toHaveTextContent("2 · 67 %");
  });

  it("nennt den Grund, wenn die Ergebnisse noch nicht sichtbar sind", () => {
    zeige(umfrage({ teilgenommen: true, ergebnis_modus: "nach_frist" }));
    expect(screen.getByText("ergebnisse.nach_frist")).toBeInTheDocument();
    expect(screen.queryByTestId("umfrage-ergebnisse")).not.toBeInTheDocument();
  });

  it("sperrt den Fragebogen nach Ablauf der Frist", () => {
    zeige(umfrage({ abgelaufen: true }));
    expect(screen.queryByTestId("umfrage-fragebogen")).not.toBeInTheDocument();
    expect(screen.getByText("frist_abgelaufen")).toBeInTheDocument();
  });

  it("zeigt eine Meldung, wenn die Umfrage nicht verfügbar ist", () => {
    zeige(undefined, true);
    expect(screen.getByText("nicht_verfuegbar")).toBeInTheDocument();
  });

  it("gruppiert Fragen nach Thema, zeigt Übersetzungen und sendet den Kommentar", () => {
    const sprache = i18n.language.slice(0, 2) as "de" | "fr";
    const basis = umfrage();
    zeige(
      umfrage({
        uebersetzungen: { titel: { [sprache]: "Titel übersetzt" } },
        fragen: [
          {
            ...basis.fragen[0],
            thema: "Termin",
            freitext_zusatz: true,
            uebersetzungen: {
              text: { [sprache]: "Frage übersetzt" },
              thema: { [sprache]: "Thema übersetzt" },
            },
            optionen: [
              {
                id: "o1",
                text: "Samstag",
                uebersetzungen: { text: { [sprache]: "Option übersetzt" } },
              },
              { id: "o2", text: "Sonntag" },
            ],
          },
          { ...basis.fragen[1], thema: "Termin" },
        ],
      }),
    );
    expect(screen.getByRole("heading", { name: "Titel übersetzt" })).toBeInTheDocument();
    expect(screen.getAllByTestId("umfrage-thema")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Thema übersetzt" })).toBeInTheDocument();
    expect(screen.getByText("Frage übersetzt")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Option übersetzt"));
    fireEvent.change(screen.getByPlaceholderText("fragebogen.kommentar"), {
      target: { value: "Gern früher" },
    });
    fireEvent.click(screen.getByRole("button", { name: "fragebogen.senden" }));
    expect(teilnehmen).toHaveBeenCalledTimes(1);
    expect(teilnehmen.mock.calls[0][0].antworten[0]).toEqual({
      frage: "f1",
      optionen: ["o1"],
      text: "Gern früher",
    });
  });
});
