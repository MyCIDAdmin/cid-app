import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Produit, ProduitImage } from "../../types/boutique";
import GalerieProduitManager from "./GalerieProduitManager";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useAjouterImageProduit: vi.fn(),
    useSupprimerImageProduit: vi.fn(),
  };
});

function produit(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "p1",
    nom: "Mug CA 1920",
    categorie: "articles_club",
    description: "",
    prix: "18.00",
    pourcentage_reduction: null,
    prix_final: "18.00",
    prix_membre: null,
    prix_affiche: "18.00",
    est_prix_membre: false,
    image: null,
    images: [],
    statut: "publie",
    type_produit: "physique",
    nouveaute: false,
    seuil_alerte_stock: 5,
    variantes: [],
    stock_total: 30,
    stock_faible: false,
    en_rupture: false,
    regles_reduction_actives: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function image(overrides: Partial<ProduitImage> = {}): ProduitImage {
  return {
    id: "img1",
    produit: "p1",
    image: "https://cdn.example.de/produits/galerie1.jpg",
    ordre: 0,
    uploaded_by: "m1",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("GalerieProduitManager", () => {
  let ajouterMock: ReturnType<typeof vi.fn>;
  let supprimerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ajouterMock = vi.fn();
    supprimerMock = vi.fn();

    vi.mocked(useBoutiqueHooks.useAjouterImageProduit).mockReturnValue({
      mutate: ajouterMock,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAjouterImageProduit>);
    vi.mocked(useBoutiqueHooks.useSupprimerImageProduit).mockReturnValue({
      mutate: supprimerMock,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerImageProduit>);
  });

  it("affiche un message quand la galerie est vide", () => {
    renderWithProviders(<GalerieProduitManager produit={produit()} />);
    expect(screen.getByText("catalogue_admin.galerie_vide")).toBeInTheDocument();
  });

  it("affiche une vignette par photo de la galerie", () => {
    renderWithProviders(
      <GalerieProduitManager produit={produit({ images: [image(), image({ id: "img2" })] })} />,
    );
    expect(screen.queryByText("catalogue_admin.galerie_vide")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "catalogue_admin.galerie_supprimer" }),
    ).toHaveLength(2);
  });

  it("ajoute une photo via le champ de fichier caché", () => {
    renderWithProviders(<GalerieProduitManager produit={produit()} />);

    const fichier = new File(["contenu"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fichier] } });

    expect(ajouterMock).toHaveBeenCalledWith(
      { produit: "p1", image: fichier },
      expect.anything(),
    );
  });

  it("supprime une photo au clic sur le bouton ×", () => {
    renderWithProviders(<GalerieProduitManager produit={produit({ images: [image()] })} />);
    fireEvent.click(screen.getByRole("button", { name: "catalogue_admin.galerie_supprimer" }));
    expect(supprimerMock).toHaveBeenCalledWith("img1", expect.anything());
  });

  it("affiche un message d'erreur quand l'ajout échoue", () => {
    ajouterMock.mockImplementation((_payload, opts) => {
      opts?.onError?.({
        isAxiosError: true,
        response: { data: { message: "Fichier invalide" } },
      });
      opts?.onSettled?.();
    });

    renderWithProviders(<GalerieProduitManager produit={produit()} />);
    const fichier = new File(["contenu"], "photo.txt", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fichier] } });

    expect(screen.getByText("Fichier invalide")).toBeInTheDocument();
  });

  it("en lecture seule (modifiable=false), désactive l'ajout et la suppression", () => {
    renderWithProviders(
      <GalerieProduitManager produit={produit({ images: [image()] })} modifiable={false} />,
    );

    expect(screen.getByText("catalogue_admin.galerie_ajouter")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "catalogue_admin.galerie_supprimer" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "catalogue_admin.galerie_supprimer" }));
    expect(supprimerMock).not.toHaveBeenCalled();
  });
});
