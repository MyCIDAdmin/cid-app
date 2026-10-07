import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useMembresHooks from "../../hooks/useMembres";
import type { RapprochementLigne } from "../../types/membre";
import MembreRapprochementPage from "./MembreRapprochementPage";

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useRapprochementList: vi.fn(),
    useFusionnerRapprochement: vi.fn(),
    useEcarterRapprochement: vi.fn(),
  };
});

const fiche = {
  prenom: "Sami",
  nom: "Trabelsi",
  email: "sami@example.de",
  date_naissance: "1990-05-12",
  ville_de: "Berlin",
  statut: "actif" as const,
  date_adhesion: "2020-09-01",
};

const LIGNE: RapprochementLigne = {
  inscrit: { ...fiche, id: "ins-1", numero_membre: "CA-2026-0300", compte_cree_le: "2026-10-07" },
  candidats: [
    { ...fiche, id: "imp-1", numero_membre: "CA-2020-0007", score: 95, raisons: ["cin", "nom"] },
    { ...fiche, id: "imp-2", numero_membre: "CA-2021-0042", score: 45, raisons: ["nom_proche"] },
  ],
};

function mutation() {
  return { mutate: vi.fn(), isPending: false, isError: false } as unknown;
}

describe("MembreRapprochementPage", () => {
  const fusion = mutation() as ReturnType<typeof useMembresHooks.useFusionnerRapprochement>;
  const ecarter = mutation() as ReturnType<typeof useMembresHooks.useEcarterRapprochement>;

  beforeEach(() => {
    vi.mocked(useMembresHooks.useFusionnerRapprochement).mockReturnValue(fusion);
    vi.mocked(useMembresHooks.useEcarterRapprochement).mockReturnValue(ecarter);
  });

  it("zeigt Leer-Hinweis ohne offene Zuordnungen", () => {
    vi.mocked(useMembresHooks.useRapprochementList).mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useRapprochementList>);
    renderWithProviders(<MembreRapprochementPage />);
    expect(screen.getByText("rapprochement.leer")).toBeInTheDocument();
  });

  it("zeigt Vorschläge mit Wahrscheinlichkeit", () => {
    vi.mocked(useMembresHooks.useRapprochementList).mockReturnValue({
      data: { count: 1, results: [LIGNE] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useRapprochementList>);
    renderWithProviders(<MembreRapprochementPage />);
    const scores = screen.getAllByTestId("score").map((el) => el.textContent);
    expect(scores[0]).toContain("95 %");
    expect(scores[1]).toContain("45 %");
  });

  it("Zuordnen braucht eine Bestätigung und ruft dann die Fusion auf", () => {
    vi.mocked(useMembresHooks.useRapprochementList).mockReturnValue({
      data: { count: 1, results: [LIGNE] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useRapprochementList>);
    renderWithProviders(<MembreRapprochementPage />);
    fireEvent.click(screen.getAllByText("rapprochement.zuordnen")[0]);
    expect(fusion.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("rapprochement.confirmer"));
    expect(fusion.mutate).toHaveBeenCalledWith({ inscritId: "ins-1", importeId: "imp-1" });
  });

  it("Kein Treffer ruft ecarter auf", () => {
    vi.mocked(useMembresHooks.useRapprochementList).mockReturnValue({
      data: { count: 1, results: [LIGNE] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useMembresHooks.useRapprochementList>);
    renderWithProviders(<MembreRapprochementPage />);
    fireEvent.click(screen.getByText("rapprochement.kein_treffer"));
    expect(ecarter.mutate).toHaveBeenCalledWith("ins-1");
  });
});
