import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { EquipeLogo } from "../../types/communaute";
import EquipeLogoImage from "./EquipeLogoImage";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useEquipesLogos: vi.fn() };
});

function mockLogos(data: EquipeLogo[] | undefined) {
  vi.mocked(useCommunauteHooks.useEquipesLogos).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useEquipesLogos>);
}

function renderLogo(equipe: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EquipeLogoImage equipe={equipe} />
    </QueryClientProvider>,
  );
}

describe("EquipeLogoImage", () => {
  it("n'affiche rien tant qu'aucun logo n'existe pour ce nom d'équipe", () => {
    mockLogos([]);
    const { container } = renderLogo("Espérance de Tunis");
    expect(container).toBeEmptyDOMElement();
  });

  it("n'affiche rien tant que les données ne sont pas chargées", () => {
    mockLogos(undefined);
    const { container } = renderLogo("Espérance de Tunis");
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche le logo correspondant au nom EXACT de l'équipe", () => {
    mockLogos([
      { id: 1, equipe: "Espérance de Tunis", logo: "https://cid-media.example/est.png", modifie_par: null, updated_at: "2026-01-01T00:00:00Z" },
      { id: 2, equipe: "Club Africain", logo: "https://cid-media.example/ca.png", modifie_par: null, updated_at: "2026-01-01T00:00:00Z" },
    ]);
    const { container } = renderLogo("Club Africain");
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cid-media.example/ca.png");
  });

  it("n'affiche rien si le nom ne correspond à aucun logo (correspondance non exacte)", () => {
    mockLogos([
      { id: 1, equipe: "Club Africain", logo: "https://cid-media.example/ca.png", modifie_par: null, updated_at: "2026-01-01T00:00:00Z" },
    ]);
    const { container } = renderLogo("club africain");
    expect(container).toBeEmptyDOMElement();
  });
});
