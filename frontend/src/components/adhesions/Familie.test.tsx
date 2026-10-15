import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { CampagneAdhesion, OffreAdhesion, Souscription } from "../../types/adhesion";
import FamilienBereich from "./FamilienBereich";
import FamilienPlaetze from "./FamilienPlaetze";
import FamilienpaketeBuero from "./FamilienpaketeBuero";
import { familienPreis } from "./familienpreis";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useKindAnlegen: vi.fn(),
    useKindLoeschen: vi.fn(),
    useFamilienpakete: vi.fn(),
  };
});

const FAMILIE = {
  prix_plein: "60.00",
  ist_familienpaket: true,
  preis_je_erwachsener: "30.00",
  preis_je_kind: "10.00",
};

function souscription(overrides: Partial<Souscription> = {}): Souscription {
  return {
    id: "s1",
    membre: "m1",
    offre: "o1",
    campagne: "c1",
    date_souscription: "2026-02-01T10:00:00Z",
    prix_paye: "110.00",
    rabais: null,
    statut: "payee",
    cotisation: null,
    snapshot_avantages: [],
    plaetze_erwachsene: 1,
    plaetze_kinder: 2,
    kinder: [
      {
        id: "k1",
        vorname: "Lina",
        nachname: "Muster",
        geburtsjahr: 2018,
        alter: 8,
        kartennummer: "CA-2026-001-J1",
        einwilligung_am: "2026-02-02T10:00:00Z",
      },
    ],
    justificatif: null,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    ...overrides,
  };
}

function bereich(s: Souscription) {
  return renderWithProviders(
    <FamilienBereich souscription={s} angebot="Familie" stil="gold" kampagne="Test 2026" />,
  );
}

describe("familienPreis", () => {
  it("Grundpreis plus Zuschlag je Erwachsener und je Kind", () => {
    expect(familienPreis(FAMILIE, 1, 3)).toBe(120);
    expect(familienPreis(FAMILIE, 0, 0)).toBe(60);
  });

  it("Einzelangebot bleibt beim Grundpreis", () => {
    expect(familienPreis({ ...FAMILIE, ist_familienpaket: false }, 2, 2)).toBe(60);
  });
});

describe("FamilienPlaetze", () => {
  it("begrenzt die Auswahl auf die Obergrenzen und meldet Änderungen", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <FamilienPlaetze
        offre={{ id: "o1", max_erwachsene: 1, max_kinder: 3, ...FAMILIE } as OffreAdhesion}
        erwachsene={0}
        kinder={0}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByLabelText("familie.plaetze_erwachsene").querySelectorAll("option"),
    ).toHaveLength(2);
    expect(screen.getByLabelText("familie.plaetze_kinder").querySelectorAll("option")).toHaveLength(
      4,
    );
    fireEvent.change(screen.getByLabelText("familie.plaetze_kinder"), { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith(0, 2);
  });
});

describe("FamilienBereich", () => {
  const anlegen = vi.fn();
  const loeschen = vi.fn();

  beforeEach(() => {
    anlegen.mockReset();
    loeschen.mockReset();
    vi.mocked(useAdhesionsHooks.useKindAnlegen).mockReturnValue({
      mutate: anlegen,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useKindAnlegen>);
    vi.mocked(useAdhesionsHooks.useKindLoeschen).mockReturnValue({
      mutate: loeschen,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useKindLoeschen>);
  });

  it("zeigt je Kind eine Junior-Karte mit eigener Nummer, sobald bezahlt", () => {
    bereich(souscription());
    expect(screen.getAllByText(/Lina Muster/).length).toBeGreaterThan(0);
    expect(screen.getByText("CA-2026-001-J1")).toBeInTheDocument();
  });

  it("zeigt vor der Zahlung keine Karte", () => {
    bereich(souscription({ statut: "en_attente_paiement" }));
    expect(screen.queryByText("CA-2026-001-J1")).not.toBeInTheDocument();
    expect(screen.getByText("familie.karten_nach_zahlung")).toBeInTheDocument();
  });

  it("legt ein Kind mit Einwilligung an", () => {
    bereich(souscription());
    fireEvent.change(screen.getByLabelText("familie.vorname"), { target: { value: " Max " } });
    fireEvent.change(screen.getByLabelText("familie.nachname"), { target: { value: "Muster" } });
    fireEvent.change(screen.getByLabelText("familie.geburtsjahr"), { target: { value: "2020" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("familie.hinzufuegen"));

    expect(anlegen.mock.calls[0][0]).toEqual({
      souscriptionId: "s1",
      payload: { vorname: "Max", nachname: "Muster", geburtsjahr: 2020, einwilligung: true },
    });
  });

  it("blendet das Formular aus, wenn alle Kinderplätze belegt sind", () => {
    bereich(souscription({ plaetze_kinder: 1 }));
    expect(screen.queryByLabelText("familie.vorname")).not.toBeInTheDocument();
    expect(screen.getByText("familie.alle_plaetze_belegt")).toBeInTheDocument();
  });

  it("entfernt ein Kind erst nach Bestätigung", () => {
    bereich(souscription());
    fireEvent.click(screen.getByLabelText("familie.entfernen_aria"));
    expect(loeschen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("action.confirmer"));
    expect(loeschen.mock.calls[0][0]).toEqual({ souscriptionId: "s1", kindId: "k1" });
  });
});

describe("FamilienpaketeBuero", () => {
  it("listet Pakete mit Kindern und Zusammenfassung", () => {
    vi.mocked(useAdhesionsHooks.useFamilienpakete).mockReturnValue({
      data: {
        zusammenfassung: { pakete_bezahlt: 1, plaetze_erwachsene: 1, kinder_eingetragen: 1 },
        pakete: [
          {
            id: "s1",
            hauptperson: "Anna Muster",
            numero_membre: "CA-2026-001",
            angebot: "Familie",
            campagne: "Test 2026",
            statut: "payee",
            prix_paye: "110.00",
            plaetze_erwachsene: 1,
            plaetze_kinder: 2,
            kinder: [{ id: "k1", name: "Lina Muster", alter: 8 }],
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useFamilienpakete>);
    const c = { id: "c1", nom: "Test 2026" } as CampagneAdhesion;
    renderWithProviders(<FamilienpaketeBuero campagnen={[c]} />);

    expect(screen.getByText("familie_buero.titel")).toBeInTheDocument();
    expect(screen.getByText(/Anna Muster/)).toBeInTheDocument();
    expect(screen.getByText(/Lina Muster/)).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });
});
