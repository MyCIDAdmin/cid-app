import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { ClassementLigue } from "../../types/communaute";
import ClassementTab from "./ClassementTab";

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
    equipe: "ES Tunis",
    rang: 2,
    joues: 10,
    victoires: 6,
    nuls: 2,
    defaites: 2,
    buts_pour: 18,
    buts_contre: 9,
    difference: 9,
    points: 20,
    forme_recente: "VVNDV",
    maj_le: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

describe("ClassementTab", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("live.classement_chargement")).toBeInTheDocument();
  });

  it("affiche un message d'erreur", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("live.classement_erreur")).toBeInTheDocument();
  });

  it("affiche un message si le classement est vide", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("live.classement_vide")).toBeInTheDocument();
  });

  it("affiche le classement trié avec le rang, les points et la forme récente", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue({
      data: page([
        ligne({ id: "l1", equipe: "Club Africain", rang: 1, points: 24, forme_recente: "VVVND" }),
        ligne({ id: "l2", equipe: "ES Tunis", rang: 2 }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useClassementLigue>);

    renderWithProviders(<ClassementTab />);

    expect(screen.getByText("Club Africain")).toBeInTheDocument();
    expect(screen.getByText("ES Tunis")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.getByText("VVVND")).toBeInTheDocument();
  });
});
