import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as projets from "../../hooks/useProjets";
import * as rbac from "../../hooks/useRbac";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Projet } from "../../types/projets";
import { waehleProjekte } from "../../utils/startseite";
import ProjekteImFokus from "./ProjekteImFokus";

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof rbac>("../../hooks/useRbac");
  return { ...actual, useModuleOuvert: vi.fn() };
});
vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof projets>("../../hooks/useProjets");
  return { ...actual, useProjets: vi.fn() };
});

function projekt(id: string, extra: Partial<Projet> = {}): Projet {
  return {
    id,
    titre: `Projekt ${id}`,
    statut: "en_cours",
    ordre: 0,
    montant_collecte: "0",
    objectif_montant: null,
    nb_teilprojekte: 0,
    ...extra,
  } as unknown as Projet;
}

describe("waehleProjekte", () => {
  it("nimmt nur laufende Projekte, Dachprojekte zuerst, höchstens drei", () => {
    const liste = [
      projekt("a", { ordre: 1 }),
      projekt("b", { statut: "termine" }),
      projekt("c", { nb_teilprojekte: 2 }),
      projekt("d", { ordre: 2 }),
      projekt("e", { ordre: 3 }),
    ];
    expect(waehleProjekte(liste).map((p) => p.id)).toEqual(["c", "a", "d"]);
  });
});

describe("ProjekteImFokus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: true, chargement: false });
  });

  it("zeigt Stand, Fortschritt und Meilensteine eines Dachprojekts", () => {
    vi.mocked(projets.useProjets).mockReturnValue({
      data: {
        results: [
          projekt("1", {
            titre: "Sportplätze",
            montant_collecte: "12465.00",
            objectif_montant: "50000.00",
            nb_teilprojekte: 2,
            meilensteine_gesamt: 8,
            meilensteine_erledigt: 2,
          }),
        ],
      },
    } as unknown as ReturnType<typeof projets.useProjets>);
    renderWithProviders(<ProjekteImFokus />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText(/12\D465,00/)).toBeInTheDocument();
    expect(screen.getByText(/startseite.projekte.dach/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sportplätze/ })).toHaveAttribute("href", "/projets/1");
  });

  it("zeigt nichts ohne laufende Projekte", () => {
    vi.mocked(projets.useProjets).mockReturnValue({
      data: { results: [projekt("1", { statut: "termine" })] },
    } as unknown as ReturnType<typeof projets.useProjets>);
    const { container } = renderWithProviders(<ProjekteImFokus />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt nichts bei geschlossenem Modul", () => {
    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: false, chargement: false });
    const { container } = renderWithProviders(<ProjekteImFokus />);
    expect(container).toBeEmptyDOMElement();
    expect(projets.useProjets).not.toHaveBeenCalled();
  });
});
