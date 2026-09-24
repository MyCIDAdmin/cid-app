import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { RencontreCalendrier, TippspielTip } from "../../types/communaute";
import TippspielTippAbgabe from "./TippspielTippAbgabe";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useCalendrierRencontres: vi.fn(),
    useTippspielTipps: vi.fn(),
    useCreerTippspielTip: vi.fn(),
    useModifierTippspielTip: vi.fn(),
  };
});

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function rencontre(overrides: Partial<RencontreCalendrier> = {}): RencontreCalendrier {
  return {
    id: "r1",
    competition: "Ligue 1",
    equipe_domicile: "Club Africain",
    equipe_exterieur: "ES Tunis",
    date_heure: "2099-04-10T18:00:00Z",
    score_domicile: null,
    score_exterieur: null,
    statut: "SCHEDULED",
    est_a_venir: true,
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

function tip(overrides: Partial<TippspielTip> = {}): TippspielTip {
  return {
    id: "tip1",
    rencontre: "r1",
    rencontre_infos: rencontre(),
    score_domicile: 2,
    score_exterieur: 1,
    points: null,
    created_at: "2026-08-01T10:00:00Z",
    maj_le: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

describe("TippspielTippAbgabe", () => {
  it("affiche un message quand aucune rencontre n'est ouverte aux pronostics", () => {
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

    renderWithProviders(<TippspielTippAbgabe tippspielId="tp1" />);

    expect(screen.getByText("tippspiel.tipps_leer")).toBeInTheDocument();
  });

  // Périmètre Ligue 1 uniquement + date-limite 1 jour avant le coup d'envoi (retour
  // utilisateur) — une rencontre hors Ligue 1, déjà passée, ou dans moins de 24h ne doit
  // jamais apparaître ici (voir rencontresPronostiquables).
  it("filtre les rencontres hors périmètre (compétition, passées, sous la date-limite)", () => {
    const dansMoinsDunJour = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([
        rencontre({ id: "r-ligue1-tunisie", competition: "Ligue 1 Tunisie" }),
        rencontre({ id: "r-passee", est_a_venir: false }),
        rencontre({ id: "r-trop-proche", date_heure: dansMoinsDunJour }),
        rencontre({ id: "r-ok" }),
      ]),
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

    renderWithProviders(<TippspielTippAbgabe tippspielId="tp1" />);

    expect(screen.getAllByText(/Club Africain — ES Tunis/)).toHaveLength(1);
  });

  it("pré-remplit le pronostic déjà enregistré", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([rencontre()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
    vi.mocked(useCommunauteHooks.useTippspielTipps).mockReturnValue({
      data: page([tip()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTipps>);
    vi.mocked(useCommunauteHooks.useCreerTippspielTip).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerTippspielTip>>(),
    );
    vi.mocked(useCommunauteHooks.useModifierTippspielTip).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierTippspielTip>>(),
    );

    renderWithProviders(<TippspielTippAbgabe tippspielId="tp1" />);

    expect(
      screen.getByLabelText("tippspiel.tipp_heim_label"),
    ).toHaveValue(2);
    expect(screen.getByLabelText("tippspiel.tipp_gast_label")).toHaveValue(1);
  });

  it("crée un nouveau pronostic quand aucun n'existe encore pour cette rencontre", () => {
    const creerMutation = mutationMock<ReturnType<typeof useCommunauteHooks.useCreerTippspielTip>>();
    vi.mocked(useCommunauteHooks.useCreerTippspielTip).mockReturnValue(creerMutation);
    vi.mocked(useCommunauteHooks.useModifierTippspielTip).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useModifierTippspielTip>>(),
    );
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([rencontre()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
    vi.mocked(useCommunauteHooks.useTippspielTipps).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTipps>);

    renderWithProviders(<TippspielTippAbgabe tippspielId="tp1" />);

    fireEvent.change(screen.getByLabelText("tippspiel.tipp_heim_label"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("tippspiel.tipp_gast_label"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByText("tippspiel.tipp_speichern"));

    expect(creerMutation.mutate).toHaveBeenCalledWith(
      { tippspiel: "tp1", rencontre: "r1", score_domicile: 3, score_exterieur: 0 },
      expect.anything(),
    );
  });

  it("modifie un pronostic existant plutôt que d'en créer un nouveau", () => {
    const modifierMutation = mutationMock<
      ReturnType<typeof useCommunauteHooks.useModifierTippspielTip>
    >();
    vi.mocked(useCommunauteHooks.useModifierTippspielTip).mockReturnValue(modifierMutation);
    vi.mocked(useCommunauteHooks.useCreerTippspielTip).mockReturnValue(
      mutationMock<ReturnType<typeof useCommunauteHooks.useCreerTippspielTip>>(),
    );
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue({
      data: page([rencontre()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useCalendrierRencontres>);
    vi.mocked(useCommunauteHooks.useTippspielTipps).mockReturnValue({
      data: page([tip()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useTippspielTipps>);

    renderWithProviders(<TippspielTippAbgabe tippspielId="tp1" />);

    fireEvent.change(screen.getByLabelText("tippspiel.tipp_heim_label"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByText("tippspiel.tipp_speichern"));

    expect(modifierMutation.mutate).toHaveBeenCalledWith(
      { id: "tip1", payload: { score_domicile: 4, score_exterieur: 1 } },
      expect.anything(),
    );
  });
});
