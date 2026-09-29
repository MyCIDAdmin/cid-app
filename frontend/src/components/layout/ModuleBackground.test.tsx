/**
 * Image de fond par module (demande utilisateur du 2026-09-29, voir docstring
 * ModuleBackground.tsx) — vérifie : (1) rien n'est rendu au-delà du fond de base sur une page
 * sans `module` (ex. hors NAV_ITEMS ou groupe "administration"), (2) rien n'est rendu au-delà
 * du fond de base quand aucune image n'existe pour le module courant, (3) l'image + la
 * superposition apparaissent quand une image existe pour le module courant.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { ArrierePlanModule } from "../../types/communaute";
import ModuleBackground from "./ModuleBackground";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useArrierePlansModules: vi.fn() };
});

function arrierePlan(overrides: Partial<ArrierePlanModule> = {}): ArrierePlanModule {
  return {
    id: 1,
    module: "membres",
    image: "https://cid-media.example/configuration-site/arriere-plan/membres/fond.jpg",
    modifie_par: null,
    updated_at: "2026-09-29T10:00:00Z",
    ...overrides,
  };
}

function renderSurRoute(pathname: string, data: ArrierePlanModule[] | undefined) {
  vi.mocked(useCommunauteHooks.useArrierePlansModules).mockReturnValue({
    data,
  } as unknown as ReturnType<typeof useCommunauteHooks.useArrierePlansModules>);

  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={pathname} element={<ModuleBackground />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModuleBackground", () => {
  it("n'affiche aucune image sur une page hors NAV_ITEMS (getModuleForPath renvoie null)", () => {
    renderSurRoute("/route-inconnue", [arrierePlan({ module: "membres" })]);
    expect(screen.queryByTestId("module-background-image")).not.toBeInTheDocument();
  });

  it("n'affiche aucune image sur une page du groupe administration (aucun module renseigné)", () => {
    renderSurRoute("/admin/boutique", [arrierePlan({ module: "boutique" })]);
    expect(screen.queryByTestId("module-background-image")).not.toBeInTheDocument();
  });

  it("n'affiche aucune image quand aucune n'est configurée pour le module courant", () => {
    renderSurRoute("/membres", []);
    expect(screen.queryByTestId("module-background-image")).not.toBeInTheDocument();
  });

  it("affiche l'image de fond configurée pour le module de la page courante", () => {
    renderSurRoute("/membres", [
      arrierePlan({ module: "membres", image: "https://cid-media.example/fond-membres.jpg" }),
      arrierePlan({ id: 2, module: "boutique", image: "https://cid-media.example/fond-shop.jpg" }),
    ]);
    expect(screen.getByTestId("module-background-image")).toHaveAttribute(
      "src",
      "https://cid-media.example/fond-membres.jpg",
    );
  });
});
