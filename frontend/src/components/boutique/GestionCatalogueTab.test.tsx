import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useBoutiqueHooks from "../../hooks/useBoutique";
import type { Produit } from "../../types/boutique";
import GestionCatalogueTab from "./GestionCatalogueTab";

vi.mock("../../hooks/useBoutique", async () => {
  const actual = await vi.importActual<typeof useBoutiqueHooks>("../../hooks/useBoutique");
  return {
    ...actual,
    useProduits: vi.fn(),
    useCreerProduit: vi.fn(),
    useModifierProduit: vi.fn(),
    useTeleverserImageProduit: vi.fn(),
    useVariantes: vi.fn(),
    useCreerVariante: vi.fn(),
    useModifierVariante: vi.fn(),
    useSupprimerVariante: vi.fn(),
    useReglesReduction: vi.fn(),
    useCreerRegleReduction: vi.fn(),
    useModifierRegleReduction: vi.fn(),
    useSupprimerRegleReduction: vi.fn(),
    useAjouterImageProduit: vi.fn(),
    useSupprimerImageProduit: vi.fn(),
  };
});

function produit(overrides: Partial<Produit> = {}): Produit {
  const base: Omit<Produit, "prix_affiche" | "est_prix_membre"> = {
    id: "p1",
    nom: "Mug CA 1920",
    categorie: "articles_club",
    description: "",
    prix: "18.00",
    pourcentage_reduction: null,
    prix_final: "18.00",
    prix_membre: null,
    image: null,
    images: [],
    statut: "publie",
    type_produit: "physique",
    nouveaute: false,
    seuil_alerte_stock: 5,
    variantes: [],
    stock_total: 3,
    stock_faible: true,
    en_rupture: false,
    regles_reduction_actives: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
  // prix_affiche/est_prix_membre par défaut = même valeur que prix_final (aucun prix membre) —
  // sauf si le test les précise explicitement dans `overrides` (voir tests prix membre ci-dessous).
  return {
    ...base,
    prix_affiche: overrides.prix_affiche ?? base.prix_final,
    est_prix_membre: overrides.est_prix_membre ?? false,
  };
}

describe("GestionCatalogueTab", () => {
  let creerMock: ReturnType<typeof vi.fn>;
  let modifierMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    creerMock = vi.fn();
    modifierMock = vi.fn();

    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: { next: null, previous: null, results: [produit()] },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);
    vi.mocked(useBoutiqueHooks.useCreerProduit).mockReturnValue({
      mutate: creerMock,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerProduit>);
    vi.mocked(useBoutiqueHooks.useModifierProduit).mockReturnValue({
      mutate: modifierMock,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useModifierProduit>);
    vi.mocked(useBoutiqueHooks.useTeleverserImageProduit).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useTeleverserImageProduit>);
    vi.mocked(useBoutiqueHooks.useVariantes).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVariantes>);
    vi.mocked(useBoutiqueHooks.useCreerVariante).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerVariante>);
    vi.mocked(useBoutiqueHooks.useModifierVariante).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useModifierVariante>);
    vi.mocked(useBoutiqueHooks.useSupprimerVariante).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerVariante>);
    vi.mocked(useBoutiqueHooks.useReglesReduction).mockReturnValue({
      data: { next: null, previous: null, results: [] },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useReglesReduction>);
    vi.mocked(useBoutiqueHooks.useCreerRegleReduction).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerRegleReduction>);
    vi.mocked(useBoutiqueHooks.useModifierRegleReduction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useModifierRegleReduction>);
    vi.mocked(useBoutiqueHooks.useSupprimerRegleReduction).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerRegleReduction>);
    vi.mocked(useBoutiqueHooks.useAjouterImageProduit).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAjouterImageProduit>);
    vi.mocked(useBoutiqueHooks.useSupprimerImageProduit).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerImageProduit>);
  });

  it("affiche les produits existants avec leur alerte de stock faible", () => {
    renderWithProviders(<GestionCatalogueTab />);
    expect(screen.getByText("Mug CA 1920")).toBeInTheDocument();
    expect(screen.getByText(/catalogue_admin.stock_faible/)).toBeInTheDocument();
  });

  it("soumet le formulaire de création avec les champs saisis", () => {
    renderWithProviders(<GestionCatalogueTab />);

    fireEvent.change(screen.getByLabelText("catalogue_admin.nom_label"), {
      target: { value: "Écharpe CA" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_admin.prix_label"), {
      target: { value: "22.00" },
    });
    fireEvent.click(screen.getByText("catalogue_admin.creer"));

    expect(creerMock).toHaveBeenCalledWith(
      expect.objectContaining({ nom: "Écharpe CA", prix: "22.00" }),
      expect.anything(),
    );
  });

  it("change le statut d'un produit via le sélecteur", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.change(screen.getByLabelText("catalogue_admin.changer_statut"), {
      target: { value: "archive" },
    });
    expect(modifierMock).toHaveBeenCalledWith({ id: "p1", payload: { statut: "archive" } });
  });

  it("déplie le panneau de gestion des variantes", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_variantes"));
    expect(screen.getByText("catalogue_admin.variantes_titre")).toBeInTheDocument();
  });

  it("inclut le stock initial saisi à la création", () => {
    renderWithProviders(<GestionCatalogueTab />);

    fireEvent.change(screen.getByLabelText("catalogue_admin.nom_label"), {
      target: { value: "Écharpe CA" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_admin.stock_initial_label"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByText("catalogue_admin.creer"));

    expect(creerMock).toHaveBeenCalledWith(
      expect.objectContaining({ nom: "Écharpe CA", stock_initial: 12 }),
      expect.anything(),
    );
  });

  it("impose la catégorie 'bon_achat' et masque stock/rabais quand le type bon d'achat est choisi", () => {
    renderWithProviders(<GestionCatalogueTab />);

    fireEvent.change(screen.getByLabelText("catalogue_admin.nom_label"), {
      target: { value: "Bon d'achat CID" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_admin.type_label"), {
      target: { value: "bon_achat" },
    });

    // Le champ rabais existe aussi par produit dans la liste ci-dessous (aria-label "…—
    // Mug CA 1920") — cibler l'id du champ du FORMULAIRE de création pour lever toute ambiguïté.
    expect(document.getElementById("prod-stock-initial")).not.toBeInTheDocument();
    expect(document.getElementById("prod-rabais")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("categorie.bon_achat")).toBeDisabled();

    fireEvent.click(screen.getByText("catalogue_admin.creer"));

    expect(creerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nom: "Bon d'achat CID",
        type_produit: "bon_achat",
        categorie: "bon_achat",
      }),
      expect.anything(),
    );
  });

  it("modifie le rabais d'un produit existant", () => {
    renderWithProviders(<GestionCatalogueTab />);
    const champRabais = screen.getByLabelText("catalogue_admin.rabais_label — Mug CA 1920");
    fireEvent.change(champRabais, { target: { value: "20" } });
    fireEvent.blur(champRabais);
    expect(modifierMock).toHaveBeenCalledWith({
      id: "p1",
      payload: { pourcentage_reduction: 20 },
    });
  });

  it("affiche le prix soldé et le prix barré quand un rabais est actif", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [produit({ prix: "18.00", pourcentage_reduction: 20, prix_final: "14.40" })],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);
    renderWithProviders(<GestionCatalogueTab />);
    expect(screen.getByText("14,40 €")).toBeInTheDocument();
  });

  // --- RegleReductionManager (demande utilisateur du 2026-09-23) ---

  it("déplie le panneau de gestion des réductions par quantité", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_regles_reduction"));
    expect(screen.getByText("catalogue_admin.regles_reduction_titre")).toBeInTheDocument();
  });

  it("replie le panneau de gestion des réductions au second clic", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_regles_reduction"));
    fireEvent.click(screen.getByText("catalogue_admin.masquer_regles_reduction"));
    expect(screen.queryByText("catalogue_admin.regles_reduction_titre")).not.toBeInTheDocument();
  });

  it("ajoute un palier de réduction depuis le panneau déplié", () => {
    const creerRegleMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useCreerRegleReduction).mockReturnValue({
      mutate: creerRegleMock,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerRegleReduction>);

    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_regles_reduction"));

    fireEvent.change(screen.getByLabelText("catalogue_admin.seuil_quantite_label"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByText("catalogue_admin.ajouter_regle"));

    expect(creerRegleMock).toHaveBeenCalledWith(
      { produit: "p1", seuil_quantite: 5, type_reduction: "article_offert", pourcentage: null },
      expect.anything(),
    );
  });

  // --- GalerieProduitManager (demande utilisateur du 2026-09-27, point 13.1) ---

  it("déplie le panneau de galerie photo et affiche les vignettes existantes", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          produit({
            images: [
              {
                id: "img1",
                produit: "p1",
                image: "https://cdn.example.de/produits/galerie1.jpg",
                ordre: 0,
                uploaded_by: "m1",
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_galerie"));

    expect(screen.getByText("catalogue_admin.galerie_titre")).toBeInTheDocument();
    expect(screen.queryByText("catalogue_admin.galerie_vide")).not.toBeInTheDocument();
  });

  it("replie le panneau de galerie photo au second clic", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_galerie"));
    fireEvent.click(screen.getByText("catalogue_admin.masquer_galerie"));
    expect(screen.queryByText("catalogue_admin.galerie_titre")).not.toBeInTheDocument();
  });

  it("affiche un message quand la galerie ne contient encore aucune photo", () => {
    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_galerie"));
    expect(screen.getByText("catalogue_admin.galerie_vide")).toBeInTheDocument();
  });

  it("ajoute une photo de galerie via le bouton d'ajout", () => {
    const ajouterMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useAjouterImageProduit).mockReturnValue({
      mutate: ajouterMock,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useAjouterImageProduit>);

    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_galerie"));

    const fichier = new File(["contenu"], "photo.jpg", { type: "image/jpeg" });
    // Le champ de fichier du panneau de galerie est un frère caché du bouton "Ajouter une
    // photo" — voir GalerieProduitManager (même principe que inputsFichierImage côté image
    // principale, mais un seul input ici puisque le panneau ne concerne qu'un seul produit).
    const inputFichier = screen
      .getByText("catalogue_admin.galerie_ajouter")
      .parentElement!.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(inputFichier, { target: { files: [fichier] } });

    expect(ajouterMock).toHaveBeenCalledWith(
      { produit: "p1", image: fichier },
      expect.anything(),
    );
  });

  it("supprime une photo de galerie via le bouton ×", () => {
    const supprimerMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useSupprimerImageProduit).mockReturnValue({
      mutate: supprimerMock,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerImageProduit>);
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          produit({
            images: [
              {
                id: "img1",
                produit: "p1",
                image: "https://cdn.example.de/produits/galerie1.jpg",
                ordre: 0,
                uploaded_by: "m1",
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<GestionCatalogueTab />);
    fireEvent.click(screen.getByText("catalogue_admin.gerer_galerie"));
    fireEvent.click(screen.getByLabelText("catalogue_admin.galerie_supprimer"));

    expect(supprimerMock).toHaveBeenCalledWith("img1", expect.anything());
  });

  it("désactive l'ajout et la suppression de photos de galerie quand modifiable=false", () => {
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          produit({
            images: [
              {
                id: "img1",
                produit: "p1",
                image: "https://cdn.example.de/produits/galerie1.jpg",
                ordre: 0,
                uploaded_by: "m1",
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
          }),
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

    renderWithProviders(<GestionCatalogueTab modifiable={false} />);
    fireEvent.click(screen.getByText("catalogue_admin.voir_galerie"));

    expect(screen.getByText("catalogue_admin.galerie_ajouter")).toBeDisabled();
    expect(screen.getByLabelText("catalogue_admin.galerie_supprimer")).toBeDisabled();
  });

  // Bug remonté par l'utilisateur (2026-09-24, task #216) : le `disabled` sur les champs bloque
  // déjà l'interaction réelle, mais toggleStatut/modifierRabais étaient déclenchés par
  // onChange/onBlur (pas un <button disabled>) et n'avaient jusqu'ici aucun garde interne — voir
  // le même correctif sur OffresManager/RabaisManager.
  describe("accès lecture seule (modifiable=false)", () => {
    it("désactive le statut et le rabais d'un produit existant, et n'appelle jamais modifierMutation", () => {
      renderWithProviders(<GestionCatalogueTab modifiable={false} />);

      const selectStatut = screen.getByLabelText("catalogue_admin.changer_statut");
      const champRabais = screen.getByLabelText("catalogue_admin.rabais_label — Mug CA 1920");
      expect(selectStatut).toBeDisabled();
      expect(champRabais).toBeDisabled();

      fireEvent.change(selectStatut, { target: { value: "archive" } });
      fireEvent.change(champRabais, { target: { value: "20" } });
      fireEvent.blur(champRabais);

      expect(modifierMock).not.toHaveBeenCalled();
    });

    it("désactive le formulaire de création de produit", () => {
      renderWithProviders(<GestionCatalogueTab modifiable={false} />);
      expect(screen.getByText("catalogue_admin.creer")).toBeDisabled();
    });

    // Même correctif de libellé que sur AdminCampagnesPage/OffresManager : ces deux boutons
    // sont des dépli/repli d'affichage jamais désactivés par `modifiable`, mais leur libellé
    // en lecture seule doit refléter qu'aucune modification n'est possible derrière.
    it("libellé 'voir' (pas 'gérer') pour variantes et réductions quand modifiable=false", () => {
      renderWithProviders(<GestionCatalogueTab modifiable={false} />);

      expect(screen.queryByText("catalogue_admin.gerer_variantes")).not.toBeInTheDocument();
      const boutonVariantes = screen.getByText("catalogue_admin.voir_variantes");
      expect(boutonVariantes).not.toBeDisabled();
      fireEvent.click(boutonVariantes);
      expect(screen.getByText("catalogue_admin.variantes_titre")).toBeInTheDocument();

      expect(screen.queryByText("catalogue_admin.gerer_regles_reduction")).not.toBeInTheDocument();
      expect(screen.getByText("catalogue_admin.voir_regles_reduction")).not.toBeDisabled();
    });
  });
});
