import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { ClassementLigue } from "../../types/communaute";
import StatistiquesTab from "./StatistiquesTab";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useClassementLigue: vi.fn() };
});

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function ligne(overrides: Partial<ClassementLigue> = {}): ClassementLigue {
  return {
    id: "l1",
    saison: "2025-2026",
    equipe: "Club Africain",
    rang: 1,
    joues: 10,
    victoires: 7,
    nuls: 2,
    defaites: 1,
    buts_pour: 20,
    buts_contre: 8,
    difference: 12,
    points: 23,
    forme_recente: "VVNDV",
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

describe("StatistiquesTab", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_chargement")).toBeInTheDocument();
  });

  it("affiche un message si Club Africain est absent du classement", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([ligne({ equipe: "ES Tunis" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_vide")).toBeInTheDocument();
  });

  it("affiche la forme récente de Club Africain sous forme de badges", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([ligne({ forme_recente: "VVNDV" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<StatistiquesTab />);

    expect(screen.getByText("live.statistiques_forme_titre")).toBeInTheDocument();
    expect(screen.getAllByText("V")).toHaveLength(3);
    expect(screen.getAllByText("N")).toHaveLength(1);
    expect(screen.getAllByText("D")).toHaveLength(1);
  });
});
