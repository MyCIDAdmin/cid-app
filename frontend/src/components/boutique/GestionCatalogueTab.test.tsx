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
    useVerwaltungUeberblick: vi.fn(),
    useCreerProduit: vi.fn(),
    useModifierProduit: vi.fn(),
    useTeleverserImageProduit: vi.fn(),
    useVariantes: vi.fn(),
    useCreerVariante: vi.fn(),
    useModifierVariante: vi.fn(),
    useSupprimerVariante: vi.fn(),
    useSupprimerProduit: vi.fn(),
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
    reservierung_modus: "aus",
    reservierung_frist: null,
    reservierung_max_gesamt: null,
    reservierung_max_pro_mitglied: null,
    reservierung_verfuegbar: null,
    reservierung_offen: true,
    reservierung_meine_menge: 0,
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
  let supprimerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    creerMock = vi.fn();
    modifierMock = vi.fn();
    supprimerMock = vi.fn();
    vi.mocked(useBoutiqueHooks.useSupprimerProduit).mockReturnValue({
      mutate: supprimerMock,
      isPending: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerProduit>);

    vi.mocked(useBoutiqueHooks.useVerwaltungUeberblick).mockReturnValue({
      data: { hinweise: {} },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVerwaltungUeberblick>);
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

  const liste = (...p: Produit[]) =>
    vi.mocked(useBoutiqueHooks.useProduits).mockReturnValue({
      data: { next: null, previous: null, results: p },
      isLoading: false,
    } as unknown as ReturnType<typeof useBoutiqueHooks.useProduits>);

  const hinweise = (h: Record<string, unknown>) =>
    vi.mocked(useBoutiqueHooks.useVerwaltungUeberblick).mockReturnValue({
      data: { hinweise: h },
    } as unknown as ReturnType<typeof useBoutiqueHooks.useVerwaltungUeberblick>);

  /** Öffnet den Editor des Standardartikels über seine Kachel. */
  const oeffneEditor = (name = "Mug CA 1920") =>
    fireEvent.click(screen.getByLabelText(`katalog.kachel.bearbeiten — ${name}`));

  const bild = (id = "img1") => ({
    id,
    produit: "p1",
    image: "https://cdn.example.de/produits/galerie1.jpg",
    ordre: 0,
    uploaded_by: "m1",
    created_at: "2026-01-01T00:00:00Z",
  });

  describe("Kacheln und Filter", () => {
    it("zeigt Artikel als Kachel mit Preis, Bestand und Hinweis", () => {
      hinweise({
        p1: [{ code: "bestand_knapp", schwere: "orange", detail: { varianten: [] } }],
      });
      renderWithProviders(<GestionCatalogueTab />);
      expect(screen.getByText("Mug CA 1920")).toBeInTheDocument();
      expect(screen.getByText("18,00 €")).toBeInTheDocument();
      expect(screen.getByText("katalog.kachel.bestand")).toBeInTheDocument();
      expect(screen.getByText("katalog.hinweis.bestand_knapp.kurz")).toBeInTheDocument();
    });

    it("zeigt Streichpreis und Aktionspreis bei Rabatt", () => {
      liste(produit({ prix: "18.00", pourcentage_reduction: 20, prix_final: "14.40" }));
      renderWithProviders(<GestionCatalogueTab />);
      expect(screen.getByText("14,40 €")).toBeInTheDocument();
      expect(screen.getByText("18,00 €")).toBeInTheDocument();
    });

    it("filtert nach Status", () => {
      liste(produit(), produit({ id: "p2", nom: "Schal", statut: "brouillon" }));
      renderWithProviders(<GestionCatalogueTab />);
      fireEvent.click(screen.getByRole("button", { name: /katalog\.filter\.brouillon/ }));
      expect(screen.getByText("Schal")).toBeInTheDocument();
      expect(screen.queryByText("Mug CA 1920")).not.toBeInTheDocument();
    });

    it("startet mit dem Filter „Braucht Aufmerksamkeit“ und zeigt nur Artikel mit Hinweis", () => {
      liste(produit(), produit({ id: "p2", nom: "Schal" }));
      hinweise({ p2: [{ code: "preis_null", schwere: "orange", detail: {} }] });
      renderWithProviders(<GestionCatalogueTab startFilter="hinweise" />);
      expect(screen.getByText("Schal")).toBeInTheDocument();
      expect(screen.queryByText("Mug CA 1920")).not.toBeInTheDocument();
    });

    it("zählt reine Info-Hinweise nicht als „braucht Aufmerksamkeit“", () => {
      hinweise({ p1: [{ code: "bild_fehlt", schwere: "info", detail: {} }] });
      renderWithProviders(<GestionCatalogueTab startFilter="hinweise" />);
      expect(screen.getByText("katalog.ansicht_leer")).toBeInTheDocument();
    });
  });

  describe("Editor", () => {
    it("öffnet beim Klick auf die Kachel und listet die Hinweise im Klartext", () => {
      hinweise({ p1: [{ code: "preis_null", schwere: "orange", detail: {} }] });
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      expect(screen.getByRole("dialog", { name: "katalog.editor.titel" })).toBeInTheDocument();
      expect(screen.getByText("katalog.hinweis.preis_null.text")).toBeInTheDocument();
    });

    it("ändert die Sichtbarkeit sofort", () => {
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      fireEvent.change(screen.getByLabelText("catalogue_admin.changer_statut"), {
        target: { value: "archive" },
      });
      expect(modifierMock).toHaveBeenCalledWith({ id: "p1", payload: { statut: "archive" } });
    });

    it("speichert Grunddaten, Preis, Rabatt und Mitgliederpreis gemeinsam", () => {
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      fireEvent.change(screen.getByLabelText("catalogue_admin.prix_label"), {
        target: { value: "20.00" },
      });
      fireEvent.change(screen.getByLabelText("catalogue_admin.rabais_label"), {
        target: { value: "20" },
      });
      fireEvent.change(screen.getByLabelText("catalogue_admin.prix_membre_label"), {
        target: { value: "15.00" },
      });
      fireEvent.click(screen.getByText("katalog.editor.speichern"));
      expect(modifierMock).toHaveBeenCalledWith(
        {
          id: "p1",
          payload: expect.objectContaining({
            nom: "Mug CA 1920",
            prix: "20.00",
            pourcentage_reduction: 20,
            prix_membre: "15.00",
          }),
        },
        expect.anything(),
      );
    });

    it("zeigt Varianten, Mengenrabatte und Reservierung in ihren Themen", () => {
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      expect(screen.getByText("catalogue_admin.variantes_titre")).toBeInTheDocument();
      expect(screen.getByText("catalogue_admin.regles_reduction_titre")).toBeInTheDocument();
      expect(screen.getByText("reservierung_admin.satz.aus")).toBeInTheDocument();
    });

    it("beschreibt die Reservierung live in einem Satz", () => {
      liste(
        produit({
          reservierung_modus: "nur_reservieren",
          reservierung_max_pro_mitglied: 2,
        }),
      );
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      expect(screen.getByTestId("reservierung-satz")).toHaveTextContent(
        "reservierung_admin.satz.nur_reservieren",
      );
    });

    it("legt einen Mengenrabatt aus dem Editor an", () => {
      const creerRegleMock = vi.fn();
      vi.mocked(useBoutiqueHooks.useCreerRegleReduction).mockReturnValue({
        mutate: creerRegleMock,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof useBoutiqueHooks.useCreerRegleReduction>);
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      fireEvent.change(screen.getByLabelText("catalogue_admin.seuil_quantite_label"), {
        target: { value: "5" },
      });
      fireEvent.click(screen.getByText("catalogue_admin.ajouter_regle"));
      expect(creerRegleMock).toHaveBeenCalledWith(
        { produit: "p1", seuil_quantite: 5, type_reduction: "article_offert", pourcentage: null },
        expect.anything(),
      );
    });

    it("blendet bei Gutscheinen Bestand, Rabatt und Reservierung aus", () => {
      liste(produit({ type_produit: "bon_achat", categorie: "bon_achat" }));
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      expect(screen.queryByLabelText("catalogue_admin.rabais_label")).not.toBeInTheDocument();
      expect(screen.queryByText("catalogue_admin.variantes_titre")).not.toBeInTheDocument();
      expect(screen.queryByTestId("reservierung-satz")).not.toBeInTheDocument();
    });
  });

  describe("Löschen", () => {
    it("löscht erst nach Bestätigung", () => {
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      fireEvent.click(screen.getByText("catalogue_admin.supprimer_produit"));
      expect(supprimerMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText("catalogue_admin.supprimer_oui"));
      expect(supprimerMock).toHaveBeenCalledTimes(1);
    });

    it("bricht das Löschen über „Abbrechen“ ab", () => {
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      fireEvent.click(screen.getByText("catalogue_admin.supprimer_produit"));
      fireEvent.click(screen.getByText("catalogue_admin.supprimer_non"));
      expect(supprimerMock).not.toHaveBeenCalled();
      expect(screen.queryByText("catalogue_admin.supprimer_oui")).not.toBeInTheDocument();
    });

    it("zeigt im Lesemodus keinen Löschen-Knopf", () => {
      renderWithProviders(<GestionCatalogueTab modifiable={false} />);
      oeffneEditor();
      expect(screen.queryByText("catalogue_admin.supprimer_produit")).not.toBeInTheDocument();
    });
  });

  describe("Fotos", () => {
    it("zeigt vorhandene Fotos der Galerie", () => {
      liste(produit({ images: [bild()] }));
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      expect(screen.getByText("catalogue_admin.galerie_titre")).toBeInTheDocument();
      expect(screen.queryByText("catalogue_admin.galerie_vide")).not.toBeInTheDocument();
    });

    it("meldet, wenn die Galerie noch leer ist", () => {
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      expect(screen.getByText("catalogue_admin.galerie_vide")).toBeInTheDocument();
    });

    it("fügt ein Foto hinzu", () => {
      const ajouterMock = vi.fn();
      vi.mocked(useBoutiqueHooks.useAjouterImageProduit).mockReturnValue({
        mutate: ajouterMock,
        isPending: false,
      } as unknown as ReturnType<typeof useBoutiqueHooks.useAjouterImageProduit>);
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      const fichier = new File(["x"], "photo.jpg", { type: "image/jpeg" });
      const eingabe = screen
        .getByText("catalogue_admin.galerie_ajouter")
        .parentElement!.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(eingabe, { target: { files: [fichier] } });
      expect(ajouterMock).toHaveBeenCalledWith(
        { produit: "p1", image: fichier },
        expect.anything(),
      );
    });

    it("löscht ein Foto", () => {
      const loeschMock = vi.fn();
      vi.mocked(useBoutiqueHooks.useSupprimerImageProduit).mockReturnValue({
        mutate: loeschMock,
        isPending: false,
      } as unknown as ReturnType<typeof useBoutiqueHooks.useSupprimerImageProduit>);
      liste(produit({ images: [bild()] }));
      renderWithProviders(<GestionCatalogueTab />);
      oeffneEditor();
      fireEvent.click(screen.getByLabelText("catalogue_admin.galerie_supprimer"));
      expect(loeschMock).toHaveBeenCalledWith("img1", expect.anything());
    });

    it("sperrt Foto-Upload und -Löschen im Lesemodus", () => {
      liste(produit({ images: [bild()] }));
      renderWithProviders(<GestionCatalogueTab modifiable={false} />);
      oeffneEditor();
      expect(screen.getByText("catalogue_admin.galerie_ajouter")).toBeDisabled();
      expect(screen.getByLabelText("catalogue_admin.galerie_supprimer")).toBeDisabled();
    });
  });

  describe("Assistent „Neues Produkt“", () => {
    function bisPruefen(name: string, preis?: string, bestand?: string) {
      fireEvent.click(screen.getByText("katalog.neu"));
      fireEvent.change(screen.getByLabelText("catalogue_admin.nom_label"), {
        target: { value: name },
      });
      fireEvent.click(screen.getByText("katalog.assistent.weiter"));
      if (preis)
        fireEvent.change(screen.getByLabelText("catalogue_admin.prix_label"), {
          target: { value: preis },
        });
      if (bestand)
        fireEvent.change(screen.getByLabelText("catalogue_admin.stock_initial_label"), {
          target: { value: bestand },
        });
      fireEvent.click(screen.getByText("katalog.assistent.weiter"));
    }

    it("blockiert „Weiter“ ohne Namen", () => {
      renderWithProviders(<GestionCatalogueTab />);
      fireEvent.click(screen.getByText("katalog.neu"));
      expect(screen.getByText("katalog.assistent.weiter")).toBeDisabled();
    });

    it("speichert als Entwurf mit den eingegebenen Werten und Anfangsbestand", () => {
      renderWithProviders(<GestionCatalogueTab />);
      bisPruefen("Écharpe CA", "22.00", "12");
      fireEvent.click(screen.getByText("katalog.assistent.entwurf"));
      expect(creerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nom: "Écharpe CA",
          prix: "22.00",
          stock_initial: 12,
          statut: "brouillon",
        }),
        expect.anything(),
      );
    });

    it("veröffentlicht nur, wenn die Pflichtangaben stehen", () => {
      renderWithProviders(<GestionCatalogueTab />);
      bisPruefen("Écharpe CA");
      expect(screen.getByText("katalog.assistent.veroeffentlichen")).toBeDisabled();
      expect(screen.getByText("katalog.assistent.veroeffentlichen_gesperrt")).toBeInTheDocument();
      fireEvent.click(screen.getByText("katalog.assistent.zurueck"));
      fireEvent.change(screen.getByLabelText("catalogue_admin.prix_label"), {
        target: { value: "22.00" },
      });
      fireEvent.click(screen.getByText("katalog.assistent.weiter"));
      fireEvent.click(screen.getByText("katalog.assistent.veroeffentlichen"));
      expect(creerMock).toHaveBeenCalledWith(
        expect.objectContaining({ statut: "publie" }),
        expect.anything(),
      );
    });

    it("legt Gutscheine ohne Bestand und mit Kategorie bon_achat an", () => {
      renderWithProviders(<GestionCatalogueTab />);
      fireEvent.click(screen.getByText("katalog.neu"));
      fireEvent.click(screen.getByRole("radio", { name: /katalog\.assistent\.art_gutschein/ }));
      fireEvent.change(screen.getByLabelText("catalogue_admin.nom_label"), {
        target: { value: "Gutschein CID" },
      });
      fireEvent.click(screen.getByText("katalog.assistent.weiter"));
      expect(
        screen.queryByLabelText("catalogue_admin.stock_initial_label"),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("katalog.assistent.weiter"));
      fireEvent.click(screen.getByText("katalog.assistent.veroeffentlichen"));
      const payload = creerMock.mock.calls[0][0];
      expect(payload).toMatchObject({ type_produit: "bon_achat", categorie: "bon_achat" });
      expect(payload.stock_initial).toBeUndefined();
    });

    it("öffnet nach dem Anlegen den Editor des neuen Artikels", () => {
      creerMock.mockImplementation((_p, opts) =>
        opts.onSuccess(produit({ id: "p9", nom: "Neuer Artikel" })),
      );
      liste(produit(), produit({ id: "p9", nom: "Neuer Artikel" }));
      renderWithProviders(<GestionCatalogueTab />);
      bisPruefen("Neuer Artikel", "5.00");
      fireEvent.click(screen.getByText("katalog.assistent.entwurf"));
      expect(screen.getByRole("dialog", { name: "katalog.editor.titel" })).toBeInTheDocument();
    });
  });

  describe("Lesemodus (modifiable=false)", () => {
    it("sperrt „Neues Produkt“", () => {
      renderWithProviders(<GestionCatalogueTab modifiable={false} />);
      expect(screen.getByText("katalog.neu")).toBeDisabled();
    });

    it("sperrt Felder, Speichern und Sichtbarkeit im Editor und ruft nie modifier auf", () => {
      renderWithProviders(<GestionCatalogueTab modifiable={false} />);
      oeffneEditor();
      const status = screen.getByLabelText("catalogue_admin.changer_statut");
      const rabatt = screen.getByLabelText("catalogue_admin.rabais_label");
      expect(status).toBeDisabled();
      expect(rabatt).toBeDisabled();
      expect(screen.getByText("katalog.editor.speichern")).toBeDisabled();
      expect(screen.getByText("katalog.editor.nur_lesen")).toBeInTheDocument();
      fireEvent.change(status, { target: { value: "archive" } });
      fireEvent.click(screen.getByText("katalog.editor.speichern"));
      expect(modifierMock).not.toHaveBeenCalled();
    });
  });
});
