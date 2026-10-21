import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useProjetsHooks from "../../hooks/useProjets";
import type { Meilenstein, Projet, ProjetUebersicht as UebersichtDaten } from "../../types/projets";
import ProjetUebersicht from "./ProjetUebersicht";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return {
    ...actual,
    useProjetUebersicht: vi.fn(),
    useCreerMeilenstein: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useModifierMeilenstein: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
    useSupprimerMeilenstein: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  };
});

function projet(overrides: Partial<Projet> = {}): Projet {
  return {
    id: "dach-1",
    titre: "Wiederaufbau Sportplätze",
    description_html: "",
    statut: "en_cours",
    responsable: null,
    responsable_detail: null,
    cagnote_active: true,
    objectif_montant: null,
    montant_collecte: "0.00",
    nb_contributeurs: 0,
    date_limite: null,
    echeance_depassee: false,
    ordre: 0,
    images: [],
    est_gestionnaire: false,
    sichtbarkeit: "veroeffentlicht",
    meine_rolle: null,
    darf_arbeitsbereich: false,
    darf_team_verwalten: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function daten(overrides: Partial<UebersichtDaten> = {}): UebersichtDaten {
  return {
    projet: projet(),
    teilprojekte: [],
    meilensteine: [],
    summen: {
      montant_collecte: "0.00",
      objectif_montant: null,
      nb_contributeurs: 0,
      teilprojekte_gesamt: 0,
      teilprojekte_termine: 0,
      teilprojekte_aktiv: 0,
      meilensteine_gesamt: 0,
      meilensteine_erledigt: 0,
      fortschritt_prozent: 0,
      beginn: null,
      ende: null,
    },
    ...overrides,
  };
}

function zeige(d: UebersichtDaten | undefined, p: Projet = projet(), extra = {}) {
  vi.mocked(useProjetsHooks.useProjetUebersicht).mockReturnValue({
    data: d,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useProjetsHooks.useProjetUebersicht>);
  return renderWithProviders(<ProjetUebersicht projet={p} />);
}

const meilenstein: Meilenstein = {
  id: "m1",
  projet: "dach-1",
  projet_titel: "Wiederaufbau Sportplätze",
  titel: "Baugenehmigung",
  beschreibung: "",
  faellig_am: "2027-03-01",
  erledigt: true,
  erledigt_am: "2027-02-20",
  ueberfaellig: false,
  ordre: 0,
  created_at: "2026-01-01T00:00:00Z",
};

describe("ProjetUebersicht", () => {
  it("zeigt Besuchern bei einem Projekt ohne Teilprojekte und Meilensteine nichts", () => {
    const { container } = zeige(daten());

    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt der Projektleitung auch ohne Inhalt den Meilenstein-Bereich zum Anlegen", () => {
    zeige(daten(), projet({ darf_team_verwalten: true }));

    expect(screen.getByText("dach.titel_meilensteine")).toBeInTheDocument();
    expect(screen.getByLabelText("dach.meilenstein_titel")).toBeInTheDocument();
  });

  it("zeigt ein Dachprojekt mit Gesamtfortschritt, Kennzahlen und Teilprojekten", () => {
    zeige(
      daten({
        teilprojekte: [
          projet({ id: "k1", titre: "Umkleidekabinen", statut: "termine" }),
          projet({
            id: "k2",
            titre: "Jugendhotel",
            objectif_montant: "50000.00",
            montant_collecte: "12500.00",
            date_debut: "2027-01-01",
            date_limite: "2029-12-31",
            meilensteine_gesamt: 4,
            meilensteine_erledigt: 1,
          }),
        ],
        meilensteine: [meilenstein],
        summen: {
          montant_collecte: "12500.00",
          objectif_montant: "50000.00",
          nb_contributeurs: 7,
          teilprojekte_gesamt: 2,
          teilprojekte_termine: 1,
          teilprojekte_aktiv: 1,
          meilensteine_gesamt: 1,
          meilensteine_erledigt: 1,
          fortschritt_prozent: 100,
          beginn: "2026-09-01",
          ende: "2031-12-31",
        },
      }),
      projet({ nb_teilprojekte: 2 }),
    );

    expect(screen.getByText("dach.titel")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("dach.fortschritt_meilensteine")).toBeInTheDocument();
    expect(screen.getByText("12500,00 €")).toBeInTheDocument();
    expect(screen.getByText("Umkleidekabinen").closest("a")).toHaveAttribute("href", "/projets/k1");
    expect(screen.getByText("Jugendhotel").closest("a")).toHaveAttribute("href", "/projets/k2");
    expect(screen.getByText("dach.kind_meilensteine")).toBeInTheDocument();
    expect(screen.getByTestId("zeitachse")).toBeInTheDocument();
    expect(screen.getByText("Baugenehmigung")).toBeInTheDocument();
  });

  it("erklärt, dass der Fortschritt ohne Meilensteine aus den Teilprojekten kommt", () => {
    zeige(
      daten({
        teilprojekte: [projet({ id: "k1", titre: "Umkleidekabinen" })],
        summen: {
          ...daten().summen,
          teilprojekte_gesamt: 1,
          fortschritt_prozent: 0,
        },
      }),
    );

    expect(screen.getByText("dach.fortschritt_teilprojekte")).toBeInTheDocument();
  });

  it("zeigt Lade- und Fehlerzustand", () => {
    zeige(undefined, projet(), { isLoading: true });
    expect(screen.getByText("page.chargement")).toBeInTheDocument();
  });

  it("zeigt eine Fehlermeldung, wenn die Übersicht nicht lädt", () => {
    zeige(undefined, projet(), { isError: true });
    expect(screen.getByText("page.erreur_chargement")).toBeInTheDocument();
  });
});
