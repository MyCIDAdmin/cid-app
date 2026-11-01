import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import LiveMatchPage from "./LiveMatchPage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useClassementLigue: vi.fn(),
    useCalendrierRencontres: vi.fn(),
    useStatistiquesJoueurs: vi.fn(),
    useEquipeInfo: vi.fn(),
    useTippspiele: vi.fn(),
    useSpielerDesSpiels: vi.fn(),
    useMeinTippstand: vi.fn(),
    useTippspielMatrix: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

const admin = { ...membre, id: "u2", role: "bureau_admin" as const };

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("LiveMatchPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
    // StatistiquesTab (2026-09-24, redesign dashboard) — appelés inconditionnellement par
    // le composant même quand le classement est vide (garde précoce sur clubAfricain
    // absent), voir StatistiquesTab.test.tsx pour la couverture détaillée de ces hooks.
    vi.mocked(useCommunauteHooks.useStatistiquesJoueurs).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useStatistiquesJoueurs>);
    vi.mocked(useCommunauteHooks.useEquipeInfo).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useEquipeInfo>);
    // TippspielSection (2026-09-24, onglet Tippspiel) : aucun jeu par défaut — un membre
    // standard ne voit alors rien (voir TippspielSection.tsx), ce qui laisse les
    // assertions existantes de ce fichier inchangées.
    vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspiele>);
    vi.mocked(useCommunauteHooks.useSpielerDesSpiels).mockReturnValue({
      data: { rencontre: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useSpielerDesSpiels>);
    vi.mocked(useCommunauteHooks.useMeinTippstand).mockReturnValue({
      tippspiel: undefined,
      teilnahme: undefined,
      bestaetigt: false,
      tippsProSpiel: new Map(),
    });
    vi.mocked(useCommunauteHooks.useTippspielMatrix).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielMatrix>);
  });

  // --- Fan-Club — conteneur à onglets (Ticker retiré le 2026-10-30) ---

  it("öffnet standardmäßig den Reiter Spieltag, ohne Ticker und ohne Spielliste", () => {
    renderWithProviders(<LiveMatchPage />);

    expect(screen.getByText("live.onglet_spieltag")).toBeInTheDocument();
    expect(screen.getByText("spieltag.kein_naechstes")).toBeInTheDocument();
    expect(screen.getByText("live.onglet_tippspiel")).toBeInTheDocument();
    expect(screen.queryByText("live.onglet_ticker")).not.toBeInTheDocument();
    expect(screen.queryByText("live.nouveau_match")).not.toBeInTheDocument();
    expect(screen.queryByText("live.aucun_match")).not.toBeInTheDocument();
    expect(screen.queryByText("live.classement_vide")).not.toBeInTheDocument();
  });

  it("n'affiche aucun bouton de création de match, même pour un Bureau Admin+", () => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: admin,
      isAuthenticated: true,
    });

    renderWithProviders(<LiveMatchPage />);

    expect(screen.queryByText("live.nouveau_match")).not.toBeInTheDocument();
  });

  it("öffnet per ?tab= direkt den Reiter Tippspiel", () => {
    renderWithProviders(<LiveMatchPage />, { route: "/live?tab=tippspiel", path: "/live" });

    expect(screen.getByText("live.onglet_tippspiel")).toBeInTheDocument();
    expect(screen.queryByText("spieltag.kein_naechstes")).not.toBeInTheDocument();
  });

  it("ignoriert einen unbekannten ?tab= und zeigt den Spieltag", () => {
    renderWithProviders(<LiveMatchPage />, { route: "/live?tab=unsinn", path: "/live" });

    expect(screen.getByText("spieltag.kein_naechstes")).toBeInTheDocument();
  });

  it("bascule vers l'onglet Tabelle", () => {
    renderWithProviders(<LiveMatchPage />);

    fireEvent.click(screen.getByText("live.onglet_tabelle"));

    expect(screen.getByText("live.classement_vide")).toBeInTheDocument();
  });

  it("bascule vers l'onglet Spielplan", () => {
    renderWithProviders(<LiveMatchPage />);

    fireEvent.click(screen.getByText("live.onglet_spielplan"));

    expect(screen.getByText("live.calendrier_vide")).toBeInTheDocument();
  });

  it("bascule vers l'onglet Statistiken", () => {
    renderWithProviders(<LiveMatchPage />);

    fireEvent.click(screen.getByText("live.onglet_statistiken"));

    expect(screen.getByText("live.statistiques_vide")).toBeInTheDocument();
  });
});
