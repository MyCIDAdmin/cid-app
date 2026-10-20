import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";
import type { RencontreCalendrier } from "../../types/communaute";
import CalendrierTab from "./CalendrierTab";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useCalendrierRencontres: vi.fn(),
    useEquipesLogos: vi.fn(),
    useCreerRencontre: vi.fn(),
    useModifierRencontre: vi.fn(),
    useReinitialiserRencontre: vi.fn(),
    useSupprimerRencontre: vi.fn(),
  };
});

// EquipeLogoImage (voir docstring de tête CalendrierTab.tsx, retour utilisateur du
// 2026-09-28 "Fan-Club: Vereins-Logos anzeigen + Upload-Möglichkeit") appelle
// useEquipesLogos() en interne — mocké ici en liste vide pour ne dépendre d'aucun réseau ;
// son propre affichage (logo présent/absent) est couvert par EquipeLogoImage.test.tsx.
vi.mocked(useCommunauteHooks.useEquipesLogos).mockReturnValue({
  data: [],
  isLoading: false,
  isError: false,
} as unknown as ReturnType<typeof useCommunauteHooks.useEquipesLogos>);

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function rencontre(overrides: Partial<RencontreCalendrier> = {}): RencontreCalendrier {
  return {
    id: "r1",
    competition: "Ligue 1",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: "2026-04-01T18:00:00Z",
    score_domicile: null,
    score_exterieur: null,
    statut: "SCHEDULED",
    est_a_venir: true,
    modifie_manuellement: false,
    ajout_manuel: false,
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

describe("CalendrierTab", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_chargement")).toBeInTheDocument();
  });

  it("affiche un message d'erreur", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_erreur")).toBeInTheDocument();
  });

  it("affiche un message si le calendrier est vide", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_vide")).toBeInTheDocument();
  });

  it("sépare les rencontres à venir des résultats déjà joués", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({ id: "r1", equipe_exterieur: "ES Tunis", est_a_venir: true }),
        rencontre({
          id: "r2",
          equipe_exterieur: "CS Sfaxien",
          est_a_venir: false,
          score_domicile: 2,
          score_exterieur: 1,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText(/ES Tunis/)).toBeInTheDocument();
    expect(screen.getByText(/CS Sfaxien/)).toBeInTheDocument();
    expect(screen.getByText("2 : 1")).toBeInTheDocument();
  });

  // Badge de résultat (2026-09-24, "Ich möchte mehr Statistiken darstellen") — les scores
  // réels arrivent désormais via la requête SerpApi "<ligue> results" (voir services.py),
  // qui couvre TOUTE la ligue, pas seulement Club Africain : le badge ne doit apparaître
  // que pour les rencontres où Club Africain joue effectivement.
  it("affiche un badge Sieg quand Club Africain gagne à domicile", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Club Africain",
          equipe_exterieur: "Zarzis",
          est_a_venir: false,
          statut: "FINISHED",
          score_domicile: 1,
          score_exterieur: 0,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_resultat_sieg")).toBeInTheDocument();
  });

  it("affiche un badge Niederlage quand Club Africain perd à l'extérieur", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "CS Sfaxien",
          equipe_exterieur: "Club Africain",
          est_a_venir: false,
          statut: "FINISHED",
          score_domicile: 2,
          score_exterieur: 0,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_resultat_niederlage")).toBeInTheDocument();
  });

  it("n'affiche aucun badge de résultat pour un match sans Club Africain", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Ben Guerdane",
          equipe_exterieur: "CS Hammam-Lif",
          est_a_venir: false,
          statut: "FINISHED",
          score_domicile: 1,
          score_exterieur: 0,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.queryByText("live.calendrier_resultat_sieg")).not.toBeInTheDocument();
    expect(screen.queryByText("live.calendrier_resultat_niederlage")).not.toBeInTheDocument();
    expect(screen.queryByText("live.calendrier_resultat_unentschieden")).not.toBeInTheDocument();
  });

  it("n'affiche aucun badge de résultat tant que le match n'est pas encore joué", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Club Africain",
          equipe_exterieur: "TP Mazembe",
          est_a_venir: true,
          score_domicile: null,
          score_exterieur: null,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.queryByText("live.calendrier_resultat_sieg")).not.toBeInTheDocument();
  });

  // Statut GOAL API (2026-09-24, bascule SerpApi → GOAL API) — voir docstring de tête
  // CalendrierTab.tsx : un match reporté/annulé affiche un badge dédié plutôt qu'un
  // résultat calculé (même si un score resterait par erreur renseigné côté API).
  it("affiche un badge Verschoben pour une rencontre reportée", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Stade Tunisien",
          equipe_exterieur: "Club Africain",
          est_a_venir: false,
          statut: "POSTPONED",
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_statut_reportee")).toBeInTheDocument();
    expect(screen.queryByText("live.calendrier_resultat_sieg")).not.toBeInTheDocument();
  });

  // Ordre chronologique des rencontres à venir (2026-09-24, correctif suite retour
  // utilisateur "Es werden aber alte Spiele... dargestellt") — voir docstring de tête
  // CalendrierTab.tsx : la page arrive triée décroissant (rencontre la plus lointaine en
  // tête), le composant doit la réafficher avec la PROCHAINE rencontre en premier.
  it("affiche les rencontres à venir de la plus proche à la plus lointaine", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        // Page déjà triée décroissant par date_heure, comme la renvoie l'API.
        rencontre({
          id: "r1",
          equipe_exterieur: "Adversaire lointain",
          date_heure: "2026-12-30T18:00:00Z",
          est_a_venir: true,
        }),
        rencontre({
          id: "r2",
          equipe_exterieur: "Adversaire proche",
          date_heure: "2026-10-01T18:00:00Z",
          est_a_venir: true,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    const { container } = renderWithProviders(<CalendrierTab />);

    const positionProche = container.innerHTML.indexOf("Adversaire proche");
    const positionLointain = container.innerHTML.indexOf("Adversaire lointain");
    expect(positionProche).toBeGreaterThan(-1);
    expect(positionLointain).toBeGreaterThan(-1);
    expect(positionProche).toBeLessThan(positionLointain);
  });

  it("affiche un badge Abgesagt pour une rencontre annulée", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({
          equipe_domicile: "Club Africain",
          equipe_exterieur: "EST",
          est_a_venir: false,
          statut: "CANCELLED",
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);

    renderWithProviders(<CalendrierTab />);

    expect(screen.getByText("live.calendrier_statut_annulee")).toBeInTheDocument();
  });

  describe("manuelle Korrekturen (Bureau Admin+)", () => {
    const membre = {
      id: "u1",
      email: "membre@example.com",
      role: "membre" as const,
      langue_preferee: "fr" as const,
    };
    const admin = { ...membre, id: "u2", role: "bureau_admin" as const };

    function mutationMock() {
      const mutateAsync = vi.fn().mockResolvedValue({});
      return {
        mock: { mutate: vi.fn(), mutateAsync, isPending: false } as never,
        mutateAsync,
      };
    }

    function anmelden(user: typeof membre | typeof admin | null) {
      useAuthStore.setState({
        accessToken: user ? "t" : null,
        refreshToken: user ? "r" : null,
        user,
        isAuthenticated: !!user,
      });
    }

    function liste(...rencontres: RencontreCalendrier[]) {
      vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
        data: page(rencontres),
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
    }

    afterEach(() => {
      cleanup();
      anmelden(null);
    });

    it("zeigt Besuchern und Mitgliedern keine Bearbeiten-Knöpfe", () => {
      liste(rencontre());
      anmelden(membre);
      renderWithProviders(<CalendrierTab />);
      expect(screen.queryByText("live.calendrier_bearbeiten")).not.toBeInTheDocument();
      expect(screen.queryByText("live.calendrier_hinzufuegen")).not.toBeInTheDocument();
    });

    it("zeigt dem Vorstand Bearbeiten und Spiel hinzufügen, plus Badges", () => {
      liste(
        rencontre({ id: "r1", modifie_manuellement: true }),
        rencontre({ id: "r2", ajout_manuel: true, equipe_exterieur: "FC Köln" }),
      );
      anmelden(admin);
      renderWithProviders(<CalendrierTab />);
      expect(screen.getAllByText("live.calendrier_bearbeiten")).toHaveLength(2);
      expect(screen.getByText("live.calendrier_hinzufuegen")).toBeInTheDocument();
      expect(screen.getByText("live.calendrier_badge_korrigiert")).toBeInTheDocument();
      expect(screen.getByText("live.calendrier_badge_manuel")).toBeInTheDocument();
    });

    it("speichert Datum und Ergebnis einer API-Rencontre über PATCH", async () => {
      const { mock, mutateAsync } = mutationMock();
      vi.mocked(useCommunauteHooks.useModifierRencontre).mockReturnValue(mock);
      vi.mocked(useCommunauteHooks.useCreerRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useReinitialiserRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useSupprimerRencontre).mockReturnValue(mutationMock().mock);
      liste(rencontre({ id: "r1" }));
      anmelden(admin);
      renderWithProviders(<CalendrierTab />);

      fireEvent.click(screen.getByText("live.calendrier_bearbeiten"));
      // API-Spiel: Mannschaften nicht editierbar
      expect(screen.queryByLabelText("live.calendrier_form_heim")).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("live.calendrier_form_datum"), {
        target: { value: "2026-04-02T19:30" },
      });
      fireEvent.change(screen.getByLabelText("live.calendrier_form_tore_heim"), {
        target: { value: "2" },
      });
      fireEvent.change(screen.getByLabelText("live.calendrier_form_tore_gast"), {
        target: { value: "1" },
      });
      fireEvent.click(screen.getByText("live.calendrier_form_speichern"));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      const { id, payload } = mutateAsync.mock.calls[0][0];
      expect(id).toBe("r1");
      expect(payload.score_domicile).toBe(2);
      expect(payload.score_exterieur).toBe(1);
      expect(new Date(payload.date_heure).getTime()).toBe(new Date("2026-04-02T19:30").getTime());
      expect(payload.equipe_exterieur).toBeUndefined();
    });

    it("verlangt beide Tore oder keins", () => {
      vi.mocked(useCommunauteHooks.useModifierRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useCreerRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useReinitialiserRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useSupprimerRencontre).mockReturnValue(mutationMock().mock);
      liste(rencontre());
      anmelden(admin);
      renderWithProviders(<CalendrierTab />);
      fireEvent.click(screen.getByText("live.calendrier_bearbeiten"));
      fireEvent.change(screen.getByLabelText("live.calendrier_form_tore_heim"), {
        target: { value: "2" },
      });
      fireEvent.click(screen.getByText("live.calendrier_form_speichern"));
      expect(screen.getByRole("alert")).toHaveTextContent("live.calendrier_form_ergebnis_komplett");
    });

    it("legt ein neues Spiel mit allen Feldern an", async () => {
      const { mock, mutateAsync } = mutationMock();
      vi.mocked(useCommunauteHooks.useCreerRencontre).mockReturnValue(mock);
      vi.mocked(useCommunauteHooks.useModifierRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useReinitialiserRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useSupprimerRencontre).mockReturnValue(mutationMock().mock);
      liste(rencontre());
      anmelden(admin);
      renderWithProviders(<CalendrierTab />);

      fireEvent.click(screen.getByText("live.calendrier_hinzufuegen"));
      fireEvent.change(screen.getByLabelText("live.calendrier_form_gast"), {
        target: { value: "FC Köln" },
      });
      fireEvent.change(screen.getByLabelText("live.calendrier_form_datum"), {
        target: { value: "2026-11-01T18:00" },
      });
      fireEvent.click(screen.getByText("live.calendrier_form_speichern"));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      const payload = mutateAsync.mock.calls[0][0];
      expect(payload.equipe_exterieur).toBe("FC Köln");
      expect(payload.equipe_domicile).toBe("Club Africain");
      expect(payload.score_domicile).toBeNull();
    });

    it("bietet Zurücksetzen nur bei manuell korrigierten API-Spielen", () => {
      vi.mocked(useCommunauteHooks.useModifierRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useCreerRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useReinitialiserRencontre).mockReturnValue(mutationMock().mock);
      vi.mocked(useCommunauteHooks.useSupprimerRencontre).mockReturnValue(mutationMock().mock);
      liste(rencontre({ id: "r1", modifie_manuellement: true }));
      anmelden(admin);
      renderWithProviders(<CalendrierTab />);
      fireEvent.click(screen.getByText("live.calendrier_bearbeiten"));
      expect(screen.getByText("live.calendrier_form_zuruecksetzen")).toBeInTheDocument();
      expect(screen.queryByText("live.calendrier_form_loeschen")).not.toBeInTheDocument();
    });
  });
});
