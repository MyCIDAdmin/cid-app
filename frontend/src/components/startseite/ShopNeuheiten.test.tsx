import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as boutique from "../../hooks/useBoutique";
import * as rbac from "../../hooks/useRbac";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Produit } from "../../types/boutique";
import { waehleArtikel } from "../../utils/startseite";
import ShopNeuheiten from "./ShopNeuheiten";

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof rbac>("../../hooks/useRbac");
  return { ...actual, useModuleOuvert: vi.fn() };
});
vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof boutique>("../../hooks/useBoutique");
  return { ...actual, useProduits: vi.fn() };
});

function produkt(id: string, extra: Partial<Produit> = {}): Produit {
  return {
    id,
    nom: `Artikel ${id}`,
    statut: "publie",
    type_produit: "physique",
    nouveaute: false,
    image: null,
    prix_affiche: "12.00",
    ...extra,
  } as unknown as Produit;
}

describe("waehleArtikel", () => {
  it("nimmt veröffentlichte Artikel ohne Gutscheine, Neuheiten zuerst, höchstens drei", () => {
    const liste = [
      produkt("a"),
      produkt("b", { statut: "archive" }),
      produkt("c", { type_produit: "bon_achat" }),
      produkt("d", { nouveaute: true }),
      produkt("e"),
      produkt("f"),
    ];
    expect(waehleArtikel(liste).map((p) => p.id)).toEqual(["d", "a", "e"]);
  });
});

describe("ShopNeuheiten", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: true, chargement: false });
  });

  it("zeigt Name, aufgelösten Preis und Link zum Artikel", () => {
    vi.mocked(boutique.useProduits).mockReturnValue({
      data: { results: [produkt("1", { nom: "Schal CID", nouveaute: true })] },
    } as unknown as ReturnType<typeof boutique.useProduits>);
    renderWithProviders(<ShopNeuheiten />);

    expect(screen.getByText("Schal CID")).toBeInTheDocument();
    expect(screen.getByText(/12,00/)).toBeInTheDocument();
    expect(screen.getByText("startseite.shop.neu")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Schal CID/ })).toHaveAttribute("href", "/boutique/1");
  });

  it("zeigt nichts bei geschlossenem Modul oder ohne Artikel", () => {
    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: false, chargement: false });
    const { container } = renderWithProviders(<ShopNeuheiten />);
    expect(container).toBeEmptyDOMElement();
    expect(boutique.useProduits).not.toHaveBeenCalled();
  });
});
