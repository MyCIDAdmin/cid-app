import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../../hooks/useProjets";
import { renderWithProviders } from "../../../test/renderWithProviders";
import type { KostenPosition, KostenUebersicht, PlanKostenEintrag } from "../../../types/projets";
import KostenTab from "./KostenTab";

vi.mock("../../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../../hooks/useProjets");
  return {
    ...actual,
    useKostenUebersicht: vi.fn(),
    usePlankosten: vi.fn(),
    useKosten: vi.fn(),
    usePlankostenErstellen: vi.fn(),
    usePlankostenAendern: vi.fn(),
    usePlankostenLoeschen: vi.fn(),
    useKostenErfassen: vi.fn(),
    useKostenAendern: vi.fn(),
    useKostenLoeschen: vi.fn(),
  };
});

const planErstellen = vi.fn();
const erfassen = vi.fn();

const UEBERSICHT: KostenUebersicht = {
  plan_gesamt: "150.00",
  ist_gesamt: "40.00",
  offen_gesamt: "10.00",
  abweichung: "110.00",
  einnahmen: "70.00",
  ergebnis: "30.00",
  kategorien: [
    {
      categorie: "k1",
      categorie_nom: "Druck",
      plan: "100.00",
      ist: "40.00",
      offen: "10.00",
      abweichung: "60.00",
      prozent: 40,
    },
  ],
  kostenarten: [
    { id: "k1", nom: "Druck" },
    { id: "k2", nom: "Technik" },
  ],
  aufgaben: [],
  darf_erfassen: true,
  darf_plan_bearbeiten: true,
};

const PLAN: PlanKostenEintrag[] = [
  { id: "pl1", projet: "p1", categorie: "k1", categorie_nom: "Druck", betrag: "100.00", notiz: "" },
];

function position(overrides: Partial<KostenPosition>): KostenPosition {
  return {
    id: "x1",
    projet: "p1",
    date_depense: "2026-05-04",
    montant: "40.00",
    categorie: "k1",
    categorie_nom: "Druck",
    fournisseur: "Druckerei",
    description: "",
    aufgabe: null,
    aufgabe_titel: null,
    justificatif_url: null,
    statut: "approuvee",
    saisie_par: "u1",
    saisie_par_nom: "Amel Ben",
    decide_par_nom: "",
    motif_rejet: "",
    ...overrides,
  };
}

function mockDaten(uebersicht: KostenUebersicht, positionen: KostenPosition[]) {
  vi.mocked(hooks.useKostenUebersicht).mockReturnValue({
    data: uebersicht,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useKostenUebersicht>);
  vi.mocked(hooks.useKosten).mockReturnValue({
    data: positionen,
  } as unknown as ReturnType<typeof hooks.useKosten>);
}

describe("KostenTab", () => {
  beforeEach(() => {
    planErstellen.mockReset().mockResolvedValue(undefined);
    erfassen.mockReset().mockResolvedValue(undefined);
    vi.mocked(hooks.usePlankosten).mockReturnValue({
      data: PLAN,
    } as unknown as ReturnType<typeof hooks.usePlankosten>);
    const stub = { mutateAsync: vi.fn(), isPending: false };
    vi.mocked(hooks.usePlankostenErstellen).mockReturnValue({
      mutateAsync: planErstellen,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.usePlankostenErstellen>);
    vi.mocked(hooks.usePlankostenAendern).mockReturnValue(
      stub as unknown as ReturnType<typeof hooks.usePlankostenAendern>,
    );
    vi.mocked(hooks.usePlankostenLoeschen).mockReturnValue(
      stub as unknown as ReturnType<typeof hooks.usePlankostenLoeschen>,
    );
    vi.mocked(hooks.useKostenErfassen).mockReturnValue({
      mutateAsync: erfassen,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useKostenErfassen>);
    vi.mocked(hooks.useKostenAendern).mockReturnValue(
      stub as unknown as ReturnType<typeof hooks.useKostenAendern>,
    );
    vi.mocked(hooks.useKostenLoeschen).mockReturnValue(
      stub as unknown as ReturnType<typeof hooks.useKostenLoeschen>,
    );
  });

  it("zeigt Kacheln, Plan/Ist-Zeile und Positionen mit Status", () => {
    mockDaten(UEBERSICHT, [
      position({ id: "a", statut: "approuvee" }),
      position({ id: "b", statut: "en_attente", montant: "10.00", fournisseur: "Kopierladen" }),
      position({
        id: "c",
        statut: "rejetee",
        fournisseur: "Bastelshop",
        motif_rejet: "Beleg fehlt",
      }),
    ]);
    renderWithProviders(<KostenTab projetId="p1" aufgaben={[]} />);
    expect(screen.getByText("150,00 €")).toBeInTheDocument();
    expect(screen.getByText("70,00 €")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.kosten.statut.approuvee")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.kosten.statut.en_attente")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.kosten.statut.rejetee")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.kosten.abgelehnt_grund")).toBeInTheDocument();
    // Freigegebene Positionen sind eingefroren: nur 2 Bearbeiten-Buttons (offen + abgelehnt).
    expect(screen.getAllByText("arbeitsbereich.kosten.bearbeiten")).toHaveLength(2);
  });

  it("blendet Schreibaktionen ohne Berechtigung aus", () => {
    mockDaten({ ...UEBERSICHT, darf_erfassen: false, darf_plan_bearbeiten: false }, [
      position({ statut: "en_attente" }),
    ]);
    renderWithProviders(<KostenTab projetId="p1" aufgaben={[]} />);
    expect(screen.queryByText("arbeitsbereich.kosten.erfassen")).not.toBeInTheDocument();
    expect(screen.queryByText("arbeitsbereich.kosten.bearbeiten")).not.toBeInTheDocument();
    expect(screen.queryByText("arbeitsbereich.kosten.plan_hinzufuegen")).not.toBeInTheDocument();
    expect(screen.queryByText("arbeitsbereich.kosten.plan_aendern")).not.toBeInTheDocument();
  });

  it("legt eine Plankostenzeile für eine noch ungeplante Kostenart an", async () => {
    mockDaten(UEBERSICHT, []);
    renderWithProviders(<KostenTab projetId="p1" aufgaben={[]} />);
    const waehler = screen.getByLabelText("arbeitsbereich.kosten.spalte.kostenart");
    // Nur ungeplante Kostenarten stehen zur Auswahl (Druck hat schon einen Plan).
    expect(screen.queryByRole("option", { name: "Druck" })).not.toBeInTheDocument();
    fireEvent.change(waehler, { target: { value: "k2" } });
    fireEvent.change(screen.getByLabelText("arbeitsbereich.kosten.spalte.plan"), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByText("arbeitsbereich.kosten.plan_hinzufuegen"));
    await waitFor(() =>
      expect(planErstellen).toHaveBeenCalledWith({ projet: "p1", categorie: "k2", betrag: "75" }),
    );
  });

  it("erfasst eine Ist-Position über das Formular", async () => {
    mockDaten(UEBERSICHT, []);
    renderWithProviders(<KostenTab projetId="p1" aufgaben={[]} />);
    fireEvent.click(screen.getByText("arbeitsbereich.kosten.erfassen"));
    fireEvent.change(screen.getByLabelText("arbeitsbereich.kosten.form.betrag"), {
      target: { value: "12.50" },
    });
    fireEvent.change(screen.getByLabelText("arbeitsbereich.kosten.form.lieferant"), {
      target: { value: "Baumarkt" },
    });
    fireEvent.change(screen.getByLabelText("arbeitsbereich.kosten.form.kostenart"), {
      target: { value: "k2" },
    });
    fireEvent.click(screen.getByText("arbeitsbereich.kosten.form.speichern"));
    await waitFor(() => expect(erfassen).toHaveBeenCalledTimes(1));
    expect(erfassen.mock.calls[0][0]).toMatchObject({
      projet: "p1",
      montant: "12.50",
      fournisseur: "Baumarkt",
      categorie: "k2",
      aufgabe: null,
    });
  });
});
