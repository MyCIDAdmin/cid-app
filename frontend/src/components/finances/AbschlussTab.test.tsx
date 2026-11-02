import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as useFinancesHooks from "../../hooks/useFinances";
import { renderWithProviders } from "../../test/renderWithProviders";
import AbschlussTab from "./AbschlussTab";
import { abschluss, ladeFinanzTexte, probelauf, punkt } from "./fixtures";

vi.mock("../../hooks/useFinances", async () => {
  const actual = await vi.importActual<typeof useFinancesHooks>("../../hooks/useFinances");
  return {
    ...actual,
    useAbschluss: vi.fn(),
    useProbelauf: vi.fn(),
    useJahrAbschliessen: vi.fn(),
    useJahrWiedereroeffnen: vi.fn(),
  };
});

const abschliessen = vi.fn().mockResolvedValue({});

function monter(
  lauf = probelauf(),
  status = abschluss(),
  { modifiable = true, onGoto = vi.fn() } = {},
) {
  vi.mocked(useFinancesHooks.useAbschluss).mockReturnValue({
    data: status,
  } as unknown as ReturnType<typeof useFinancesHooks.useAbschluss>);
  vi.mocked(useFinancesHooks.useProbelauf).mockReturnValue({
    data: lauf,
  } as unknown as ReturnType<typeof useFinancesHooks.useProbelauf>);
  vi.mocked(useFinancesHooks.useJahrAbschliessen).mockReturnValue({
    mutateAsync: abschliessen,
    isPending: false,
  } as unknown as ReturnType<typeof useFinancesHooks.useJahrAbschliessen>);
  vi.mocked(useFinancesHooks.useJahrWiedereroeffnen).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useFinancesHooks.useJahrWiedereroeffnen>);
  renderWithProviders(<AbschlussTab modifiable={modifiable} onGoto={onGoto} />);
  // Das Jahr der Fixtures statt „letztes Jahr“, damit der Test nicht vom Datum abhängt.
  fireEvent.change(screen.getByLabelText("Année"), { target: { value: "2025" } });
  return { onGoto };
}

const mitPflicht = () =>
  probelauf({
    pruefliste: [
      punkt({ id: "freigaben", stufe: "pflicht", anzahl: 2, betrag: "300.00", ok: false }),
      punkt({ id: "belege" }),
    ],
    bewertung: { ampel: "rot", bereit_prozent: 40, hinweise: [] },
  });

describe("AbschlussTab", () => {
  beforeAll(ladeFinanzTexte);
  beforeEach(() => vi.clearAllMocks());

  it("zeigt rot und sperrt den Abschluss, solange eine Pflicht offen ist", () => {
    monter(mitPflicht());
    expect(screen.getByText("Clôture pas encore possible")).toBeInTheDocument();
    expect(screen.getByText(/2 dépenses attendent une approbation/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clôturer/ })).toBeDisabled();
  });

  it("springt vom Prüfpunkt zur passenden Liste", () => {
    const { onGoto } = monter(mitPflicht());
    fireEvent.click(screen.getByRole("button", { name: "Voir" }));
    expect(onGoto).toHaveBeenCalledWith("depenses");
  });

  it("erlaubt den Probelauf mit Pflichtpunkt, aber nicht den Weg zum Abschluss", () => {
    monter(mitPflicht());
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    expect(screen.getByText("Et si… ?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    expect(screen.getByRole("button", { name: /Passer à la clôture/ })).toBeDisabled();
  });

  it("fragt den Probelauf mit den Annahmen ab, ohne etwas zu speichern", () => {
    monter(
      probelauf({
        pruefliste: [
          punkt({ id: "freigaben", stufe: "pflicht", anzahl: 2, betrag: "300.00", ok: false }),
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    fireEvent.click(screen.getByLabelText(/2 dépenses ouvertes étaient approuvées/));
    expect(useFinancesHooks.useProbelauf).toHaveBeenLastCalledWith(2025, {
      offeneAusgaben: true,
      offeneBeitraege: false,
    });
    expect(abschliessen).not.toHaveBeenCalled();
  });

  it("schließt erst nach Eintippen des Jahres ab und gibt die Begründungen mit", async () => {
    monter(
      probelauf({
        kostenarten: [
          {
            categorie_id: "k1",
            nom: "Raum",
            montant: "2300.00",
            montant_precedent: "2000.00",
            budget: "2000.00",
            prozent: 115,
            status: "depasse",
          },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    fireEvent.change(screen.getByLabelText(/Raum \(115 % du budget\)/), {
      target: { value: "Neue Miete" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Passer à la clôture/ }));

    const knopf = screen.getByRole("button", { name: /définitivement/ });
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Pour confirmer, saisissez l'année"), {
      target: { value: "2025" },
    });
    expect(knopf).toBeEnabled();
    fireEvent.click(knopf);

    await waitFor(() =>
      expect(abschliessen).toHaveBeenCalledWith({
        annee: 2025,
        begruendungen: { k1: "Neue Miete" },
      }),
    );
  });

  it("lässt Nur-Lese-Nutzer nicht abschließen", () => {
    monter(probelauf(), abschluss(), { modifiable: false });
    fireEvent.click(screen.getByRole("button", { name: /Clôturer/ }));
    expect(screen.getByText(/seulement des droits de lecture/)).toBeInTheDocument();
    expect(screen.getByLabelText("Pour confirmer, saisissez l'année")).toBeDisabled();
  });

  it("zeigt für ein abgeschlossenes Jahr festgehaltene Zahlen, Begründungen und Berichte", () => {
    monter(
      probelauf({
        abgeschlossen: true,
        kostenarten: [
          {
            categorie_id: "k1",
            nom: "Raum",
            montant: "2300.00",
            montant_precedent: "2000.00",
            budget: "2000.00",
            prozent: 115,
            status: "depasse",
          },
        ],
      }),
      abschluss({
        abgeschlossen: true,
        abgeschlossen_am: "2026-02-01T10:00:00Z",
        abgeschlossen_durch: "Beispiel Person",
        snapshot: {
          recettes: "20000.00",
          depenses: "15000.00",
          resultat: "5000.00",
          begruendungen: { k1: "Neue Miete" },
        },
      }),
    );
    expect(screen.getByText("Cette année est clôturée")).toBeInTheDocument();
    expect(screen.getByText("Neue Miete")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Écritures (CSV)" })).toBeInTheDocument();
    // Wiedereröffnen ist dem Administrator App vorbehalten.
    expect(screen.queryByRole("button", { name: "Rouvrir l'année" })).not.toBeInTheDocument();
    expect(screen.getByText(/Seul l'administrateur/)).toBeInTheDocument();
  });
});
