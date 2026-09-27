import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useProjetsHooks from "../../hooks/useProjets";
import KennzahlenBar from "./KennzahlenBar";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return { ...actual, useKennzahlenProjets: vi.fn() };
});

describe("KennzahlenBar", () => {
  it("affiche des tirets tant que les données ne sont pas chargées", () => {
    vi.mocked(useProjetsHooks.useKennzahlenProjets).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useProjetsHooks.useKennzahlenProjets>);

    renderWithProviders(<KennzahlenBar />);
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("affiche les kennzahlen une fois chargées", () => {
    vi.mocked(useProjetsHooks.useKennzahlenProjets).mockReturnValue({
      data: { nb_projets: 4, montant_collecte: "1250.50", nb_donateurs: 37 },
    } as unknown as ReturnType<typeof useProjetsHooks.useKennzahlenProjets>);

    renderWithProviders(<KennzahlenBar />);
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("1.251 €")).toBeInTheDocument();
    expect(screen.getByText("kennzahlen.donateurs")).toBeInTheDocument();
    expect(screen.getByText("kennzahlen.collecte")).toBeInTheDocument();
    expect(screen.getByText("kennzahlen.projets")).toBeInTheDocument();
  });
});
