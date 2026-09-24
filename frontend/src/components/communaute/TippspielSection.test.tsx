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
    useModifierTippspiel: vi.fn(),
    useCalendrierRencontres: vi.fn(),
    useTippspielTipps: vi.fn(),
    useCreerTippspielTip: vi.fn(),
    useModifierTippspielTip: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const superAdmin = { ...membre, id: "u2", role: "super_admin" as const };

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
    tippspiel_titre: "Tippspiel Ligue 1 (2026-2027)",
    membre_nom: "Membre Test",
    statut_paiement: "sans_frais",
    montant_participation: null,
    confirmee_le: null,
    created_at: "2026-08-02T10:00:00Z",
    total_points: 0,
    ...overrides,
  };
}

describe("TippspielSection", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useTeilnehmenTippspiel).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useTeilnehmenTippspiel>>(),
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
    vi.mocked(useCommunauteHooks.useCreerTippspielTip).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerTippspielTip>>(),
    );
    vi.mocked(useCommunauteHooks.useModifierTippspielTip).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierTippspielTip>>(),
    );
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
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: superAdmin,
      isAuthenticated: true,
    });
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
    const teilnehmenMutation =
      mutationMock<ReturnType<typeof useCommunauteHooks.useTeilnehmenTippspiel>>();
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

  it("propose de partager le Tippspiel en dehors de l'association", () => {
    // Bug-Report 2026-09-24 : "Es muss möglich sein, Tippspiel in Social Media zu teilen".
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

    expect(screen.getByLabelText("partage.bouton_aria")).toBeInTheDocument();
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
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: superAdmin,
      isAuthenticated: true,
    });
    const modifierMutation =
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierTippspiel>>();
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

  // Le panneau de confirmation des paiements a été déplacé vers le module "Ausstehende
  // Zahlungen" le 2026-09-24 (retour utilisateur) — voir désormais
  // components/cotisations/TippspielZahlungenPanel.test.tsx.

  // Retour utilisateur du 2026-09-24 : "Die Tipps sind verfügbar bevor ich auf teilnehmen
  // klicke. Für Beitragspflichtige Spiele, müssen Tipps verfügbar sein, nachdem die
  // Bezahlung bestätigt wird" — les trois tests suivants couvrent les trois états.
  it("masque les pronostics tant que le membre n'a pas rejoint le Tippspiel", () => {
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel({ montant_participation: "10.00" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);

    expect(screen.queryByText("tippspiel.tipps_titel")).not.toBeInTheDocument();
    expect(screen.queryByText("tippspiel.tipps_gesperrt_zahlung")).not.toBeInTheDocument();
  });

  it("masque les pronostics et affiche un message tant que le paiement n'est pas confirmé", () => {
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

    expect(screen.getByText("tippspiel.tipps_gesperrt_zahlung")).toBeInTheDocument();
    expect(screen.queryByText("tippspiel.tipps_titel")).not.toBeInTheDocument();
  });

  it("affiche les pronostics une fois la participation confirmée", () => {
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([tippspiel({ montant_participation: "10.00" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue({
      data: page([teilnahme({ statut_paiement: "confirmee" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTeilnahmen>);

    renderWithProviders(<TippspielSection />);

    expect(screen.getByText("tippspiel.tipps_titel")).toBeInTheDocument();
    expect(screen.queryByText("tippspiel.tipps_gesperrt_zahlung")).not.toBeInTheDocument();
  });
});
