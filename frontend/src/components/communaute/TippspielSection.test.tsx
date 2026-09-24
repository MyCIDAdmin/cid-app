import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { Tippspiel, TippspielTeilnahme } from "../../types/communaute";
import TippspielSection from "./TippspielSection";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useTippspiele: vi.fn(),
    useTippspielTeilnahmen: vi.fn(),
    useTeilnehmenTippspiel: vi.fn(),
    useConfirmerPaiementTeilnahme: vi.fn(),
    useModifierTippspiel: vi.fn(),
    useCalendrierRencontres: vi.fn(),
    useTippspielTipps: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const superAdmin = { ...membre, id: "u2", role: "super_admin" as const };
const dirFinancier = { ...membre, id: "u3", role: "dir_financier" as const };

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function tippspiel(overrides: Partial<Tippspiel> = {}): Tippspiel {
  return {
    id: "tp1",
    titre: "Tippspiel Ligue 1",
    saison: "2026-2027",
    regles: "",
    statut: "publie",
    montant_participation: null,
    prix: [],
    created_by_nom: "admin@example.de",
    created_at: "2026-08-01T10:00:00Z",
    maj_le: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

function teilnahme(overrides: Partial<TippspielTeilnahme> = {}): TippspielTeilnahme {
  return {
    id: "t1",
    tippspiel: "tp1",
    membre_nom: "Membre Test",
    statut_paiement: "sans_frais",
    confirmee_le: null,
    created_at: "2026-08-02T10:00:00Z",
    total_points: 0,
    ...overrides,
  };
}

describe("TippspielSection", () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: membre, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useTeilnehmenTippspiel).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useTeilnehmenTippspiel>>(),
    );
    vi.mocked(useCommunauteHooks.useConfirmerPaiementTeilnahme).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useConfirmerPaiementTeilnahme>>(),
    );
    vi.mocked(useCommunauteHooks.useModifierTippspiel).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierTippspiel>>(),
    );
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
    vi.mocked(useCommunauteHooks.useTippspielTipps).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTipps>);
  });

  it("n'affiche rien à un membre standard quand aucun Tippspiel n'existe", () => {
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);

    const { container } = renderWithProviders(<TippspielSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it("propose la création d'un Tippspiel à l'Administrateur App quand aucun n'existe", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: superAdmin, isAuthenticated: true });
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);

    renderWithProviders(<TippspielSection />);

    expect(screen.getByText("tippspiel.kein_spiel")).toBeInTheDocument();
    expect(screen.getByText("tippspiel.admin_neues_spiel")).toBeInTheDocument();
  });

  it("affiche les règles, le statut de participation et propose de participer", () => {
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);

    expect(screen.getByText("Tippspiel Ligue 1")).toBeInTheDocument();
    expect(screen.getByText("tippspiel.punkte_exakt")).toBeInTheDocument();
    expect(screen.getByText("tippspiel.status_nicht_angemeldet")).toBeInTheDocument();
    expect(screen.getByText("tippspiel.teilnehmen_button")).toBeInTheDocument();
  });

  it("permet de rejoindre le Tippspiel", () => {
    const teilnehmenMutation = mutationMock<
      ReturnType<typeof useCommunauteHooks.useTeilnehmenTippspiel>
    >();
    vi.mocked(useCommunauteHooks.useTeilnehmenTippspiel).mockReturnValue(teilnehmenMutation);
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);
    fireEvent.click(screen.getByText("tippspiel.teilnehmen_button"));

    expect(teilnehmenMutation.mutate).toHaveBeenCalledWith("tp1", expect.anything());
  });

  it("affiche le statut de paiement en attente pour un jeu payant déjà rejoint", () => {
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel({ montant_participation: "10.00" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([teilnahme({ statut_paiement: "en_attente" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);

    expect(screen.getByText("tippspiel.status_en_attente")).toBeInTheDocument();
    expect(screen.queryByText("tippspiel.teilnehmen_button")).not.toBeInTheDocument();
  });

  it("affiche le classement des participants confirmés", () => {
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([teilnahme({ membre_nom: "Aya Confirmée", total_points: 7 })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);

    expect(screen.getByText("Aya Confirmée")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("masque les contrôles de gestion et le panneau de paiement à un membre standard", () => {
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel({ statut: "brouillon", montant_participation: "10.00" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);

    expect(screen.queryByText("tippspiel.admin_bearbeiten")).not.toBeInTheDocument();
    expect(screen.queryByText("tippspiel.admin_veroeffentlichen")).not.toBeInTheDocument();
    // Un Tippspiel `brouillon` masque aussi la participation/le classement (n'est de toute
    // façon jamais renvoyé à un membre standard par le backend, voir docstring de tête).
    expect(screen.queryByText("tippspiel.teilnehmen_button")).not.toBeInTheDocument();
  });

  it("propose de publier un brouillon à l'Administrateur App", () => {
    useAuthStore.setState({ accessToken: "t", refreshToken: "r", user: superAdmin, isAuthenticated: true });
    const modifierMutation = mutationMock<
      ReturnType<typeof useCommunauteHooks.useModifierTippspiel>
    >();
    vi.mocked(useCommunauteHooks.useModifierTippspiel).mockReturnValue(modifierMutation);
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel({ statut: "brouillon" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);
    fireEvent.click(screen.getByText("tippspiel.admin_veroeffentlichen"));

    expect(modifierMutation.mutate).toHaveBeenCalledWith({
      id: "tp1",
      payload: { statut: "publie" },
    });
  });

  it("affiche le panneau des paiements en attente au Directeur Financier pour un jeu payant", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: dirFinancier,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel({ montant_participation: "10.00" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockImplementation((filtres) => {
      if (filtres.statutPaiement === "en_attente") {
        return {
          data: page([teilnahme({ id: "t-pending", membre_nom: "En Attente" })]),
          isLoading: false,
          isError: false,
        } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>;
      }
      return {
        data: page([]),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>;
    });

    renderWithProviders(<TippspielSection />);

    expect(screen.getByText("tippspiel.zahlungen_titel")).toBeInTheDocument();
    expect(screen.getByText("En Attente")).toBeInTheDocument();
  });
});
