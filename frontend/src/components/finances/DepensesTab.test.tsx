import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useFinancesHooks from "../../hooks/useFinances";
import { useAuthStore } from "../../store/authStore";
import type { Depense } from "../../types/finances";
import DepensesTab from "./DepensesTab";

vi.mock("../../hooks/useFinances", async () => {
  const actual = await vi.importActual<typeof useFinancesHooks>("../../hooks/useFinances");
  return {
    ...actual,
    useDepenses: vi.fn(),
    useApprouverDepense: vi.fn(),
    useRejeterDepense: vi.fn(),
    useSupprimerDepense: vi.fn(),
  };
});

function depense(partiel: Partial<Depense>): Depense {
  return {
    id: "d1",
    date_depense: "2026-03-10",
    montant: "50.00",
    categorie: "c1",
    categorie_nom: "Transport",
    fournisseur: "Bus GmbH",
    description: "",
    evenement: null,
    evenement_titre: null,
    projet: null,
    projet_titre: null,
    justificatif_url: null,
    statut: "en_attente",
    saisie_par: "autre",
    saisie_par_nom: "Autre Personne",
    decide_par_nom: "",
    date_decision: null,
    motif_rejet: "",
    created_at: "2026-03-10T10:00:00Z",
    ...partiel,
  };
}

const approuverMutate = vi.fn().mockResolvedValue({});

function monter(liste: Depense[], modifiable = true) {
  vi.mocked(useFinancesHooks.useDepenses).mockReturnValue({
    data: liste,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useFinancesHooks.useDepenses>);
  vi.mocked(useFinancesHooks.useApprouverDepense).mockReturnValue({
    mutateAsync: approuverMutate,
  } as unknown as ReturnType<typeof useFinancesHooks.useApprouverDepense>);
  vi.mocked(useFinancesHooks.useRejeterDepense).mockReturnValue({
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useFinancesHooks.useRejeterDepense>);
  vi.mocked(useFinancesHooks.useSupprimerDepense).mockReturnValue({
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useFinancesHooks.useSupprimerDepense>);
  return renderWithProviders(<DepensesTab modifiable={modifiable} />);
}

describe("DepensesTab", () => {
  beforeEach(() => {
    approuverMutate.mockClear();
    useAuthStore.setState({ user: { id: "moi" } as never });
  });

  it("permet d'approuver la dépense d'une autre personne", async () => {
    monter([depense({})]);
    fireEvent.click(screen.getByText("approuver"));
    await waitFor(() => expect(approuverMutate).toHaveBeenCalledWith("d1"));
  });

  it("n'offre pas d'approbation pour sa propre saisie (quatre yeux)", () => {
    monter([depense({ saisie_par: "moi" })]);
    expect(screen.queryByText("approuver")).not.toBeInTheDocument();
    expect(screen.getByText("eigene_ausgabe")).toBeInTheDocument();
  });

  it("verrouille une dépense approuvée", () => {
    monter([depense({ statut: "approuvee" })]);
    expect(screen.queryByText("modifier")).not.toBeInTheDocument();
    expect(screen.queryByText("supprimer")).not.toBeInTheDocument();
    expect(screen.getByText("figee")).toBeInTheDocument();
  });

  it("masque toutes les actions d'écriture en lecture seule", () => {
    monter([depense({})], false);
    expect(screen.queryByText("nouvelle_depense")).not.toBeInTheDocument();
    expect(screen.queryByText("approuver")).not.toBeInTheDocument();
    expect(screen.queryByText("modifier")).not.toBeInTheDocument();
  });
});
