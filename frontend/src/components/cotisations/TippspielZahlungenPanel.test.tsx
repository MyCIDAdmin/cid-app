import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { TippspielTeilnahme } from "../../types/communaute";
import TippspielZahlungenPanel from "./TippspielZahlungenPanel";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useTippspielTeilnahmen: vi.fn(),
    useConfirmerPaiementTeilnahme: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const dirFinancier = { ...membre, id: "u3", role: "dir_financier" as const };

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function teilnahme(overrides: Partial<TippspielTeilnahme> = {}): TippspielTeilnahme {
  return {
    id: "t1",
    tippspiel: "tp1",
    tippspiel_titre: "Tippspiel Ligue 1 (2026-2027)",
    membre_nom: "Membre Test",
    statut_paiement: "en_attente",
    montant_participation: "10.00",
    confirmee_le: null,
    created_at: "2026-08-02T10:00:00Z",
    total_points: 0,
    ...overrides,
  };
}

describe("TippspielZahlungenPanel", () => {
  beforeEach(() => {
    vi.mocked(useCommunauteHooks.useConfirmerPaiementTeilnahme).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useConfirmerPaiementTeilnahme>>(),
    );
  });

  it("n'affiche rien à un membre standard", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([teilnahme()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    const { container } = renderWithProviders(<TippspielZahlungenPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it("interroge la liste sans filtrer sur un Tippspiel précis (tous jeux confondus)", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: dirFinancier,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielZahlungenPanel />);

    expect(useCommunauteHooks.useTippspielTeilnahmen).toHaveBeenCalledWith({
      statutPaiement: "en_attente",
    });
    expect(screen.getByText("tippspiel.zahlungen_leer")).toBeInTheDocument();
  });

  it("affiche les paiements en attente de tous les Tippspiele au Directeur Financier", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: dirFinancier,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([
        teilnahme({ id: "t-a", membre_nom: "En Attente A", tippspiel_titre: "Tippspiel A" }),
        teilnahme({ id: "t-b", membre_nom: "En Attente B", tippspiel_titre: "Tippspiel B" }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielZahlungenPanel />);

    expect(screen.getByText("En Attente A")).toBeInTheDocument();
    expect(screen.getByText("Tippspiel A")).toBeInTheDocument();
    expect(screen.getByText("En Attente B")).toBeInTheDocument();
    expect(screen.getByText("Tippspiel B")).toBeInTheDocument();
  });

  it("confirme un paiement au clic", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: dirFinancier,
      isAuthenticated: true,
    });
    const confirmerMutation =
      mutationMock<ReturnType<typeof useCommunauteHooks.useConfirmerPaiementTeilnahme>>();
    vi.mocked(useCommunauteHooks.useConfirmerPaiementTeilnahme).mockReturnValue(confirmerMutation);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([teilnahme({ id: "t-a" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielZahlungenPanel />);
    fireEvent.click(screen.getByText("tippspiel.zahlungen_bestaetigen"));

    expect(confirmerMutation.mutate).toHaveBeenCalledWith("t-a", expect.anything());
  });
});
