import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import type { CampagneAdhesion, OffreAdhesion, Souscription } from "../../types/adhesion";
import MonAdhesionPage from "./MonAdhesionPage";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useCampagneActive: vi.fn(),
    useCampagnes: vi.fn(),
    useMesSouscriptions: vi.fn(),
    useSouscrire: vi.fn(),
    useUploaderJustificatif: vi.fn(),
    useAnnulerSouscription: vi.fn(),
  };
});

// Phase F (2026-09-26, fusion "Mitgliedsbeitrag" -> "Meine Mitgliedschaft") : cette page rend
// désormais aussi <PaiementStepper/> (voir components/adhesions/PaiementStepper.tsx), qui utilise
// ces mêmes hooks que l'ancienne CotisationStepperPage.test.tsx — mockés ici avec des valeurs
// neutres par défaut (aucune donnée) pour que les tests ci-dessus, qui ne portent que sur la
// grille offre/historique existante, ne dépendent pas d'un vrai appel réseau non mocké.
vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useMesCotisations: vi.fn(),
    useCreerCotisation: vi.fn(),
    useInitierPaiementEnLigne: vi.fn(),
    useArticlesCatalogue: vi.fn(),
    useCotisation: vi.fn(),
  };
});

function offre(overrides: Partial<OffreAdhesion> = {}): OffreAdhesion {
  return {
    id: "o1",
    campagne: "c1",
    nom: "Basic",
    prix_plein: "120.00",
    description: "Adhésion standard",
    avantages: [],
    condition_age_min: null,
    condition_age_max: null,
    visible: true,
    ordre: 1,
    rabais: [
      {
        id: "r1",
        offre: "o1",
        type_rabais: "etudiant",
        label_fr: "Étudiant -20%",
        label_de: "",
        label_ar: "",
        montant_reduction: null,
        pct_reduction: "20.00",
        justificatif_requis: true,
        instructions_fr: "",
        instructions_de: "",
        instructions_ar: "",
      },
    ],
    ...overrides,
  };
}

function campagne(overrides: Partial<CampagneAdhesion> = {}): CampagneAdhesion {
  return {
    id: "c1",
    nom: "Test 2026",
    annee: 2026,
    date_debut: "2026-01-01",
    date_fin: "2026-12-31",
    description: "",
    statut: "publiee",
    created_by: "m-admin",
    created_at: "2026-01-01T00:00:00Z",
    offres: [offre()],
    ...overrides,
  };
}

function souscription(overrides: Partial<Souscription> = {}): Souscription {
  return {
    id: "s1",
    membre: "m1",
    offre: "o1",
    campagne: "c1",
    date_souscription: "2026-02-01T10:00:00Z",
    prix_paye: "96.00",
    rabais: "r1",
    statut: "en_attente_paiement",
    cotisation: null,
    snapshot_avantages: [{ ordre: 1, texte_fr: "Accès complet" }],
    justificatif: null,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    ...overrides,
  };
}

describe("MonAdhesionPage", () => {
  beforeEach(() => {
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [campagne()] },
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
    vi.mocked(useAdhesionsHooks.useUploaderJustificatif).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useUploaderJustificatif>);
    vi.mocked(useAdhesionsHooks.useAnnulerSouscription).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useAnnulerSouscription>);

    // Valeurs neutres par défaut pour <PaiementStepper/> (voir commentaire du mock ci-dessus) —
    // aucune de ces valeurs n'est exercée par les tests existants de cette page, qui ne portent
    // que sur la grille offre/historique ; voir PaiementStepper.test.tsx pour la couverture du
    // stepper lui-même.
    vi.mocked(useCotisationsHooks.useMesCotisations).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useMesCotisations>);
    vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
    vi.mocked(useCotisationsHooks.useCreerCotisation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerCotisation>);
    vi.mocked(useCotisationsHooks.useInitierPaiementEnLigne).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useInitierPaiementEnLigne>);
    vi.mocked(useCotisationsHooks.useCotisation).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCotisation>);
  });

  it("intègre la section de paiement libre-service (Phase F, fusion Mitgliedsbeitrag -> Meine Mitgliedschaft)", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    // PaiementStepper (ex-CotisationStepperPage) est bien rendu comme section de cette page.
    expect(screen.getByText("etape.choisir")).toBeInTheDocument();
    expect(screen.getByText("continuer")).toBeInTheDocument();
  });

  it("affiche un message quand aucune campagne n'est publiée", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.getAllByText("offres.aucune_campagne").length).toBeGreaterThan(0);
  });

  it("affiche la carte d'adhésion active et l'historique quand une souscription existe", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [souscription()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.getByText("hero.titre")).toBeInTheDocument();
    // "Basic" apparaît trois fois : dans la carte d'adhésion active, dans la
    // liste des offres disponibles (changement d'offre toujours permis tant
    // que la souscription n'est pas payée) et dans la ligne d'historique.
    expect(screen.getAllByText("Basic").length).toBe(3);
    // Idem : prix affiché à la fois dans la carte active et l'historique.
    expect(screen.getAllByText("96,00 €").length).toBe(2);
    expect(screen.getByText(/Accès complet/)).toBeInTheDocument();
  });

  it("souscrit avec le rabais sélectionné", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    // Carte façon mycid.org/membership (retour utilisateur du 2026-09-27) : le bouton
    // "offres.rejoindre" ("Jetzt beitreten") déplie la carte, comme cliquer sur la ligne le
    // faisait avant — voir docstring MonAdhesionPage.tsx.
    fireEvent.click(screen.getByText("offres.rejoindre"));
    fireEvent.change(screen.getByLabelText("offres.rabais_label"), { target: { value: "r1" } });
    fireEvent.click(screen.getByText("offres.souscrire"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ offre: "o1", rabais: "r1" });
  });

  it("affiche le formulaire d'upload de justificatif et l'envoie (AHM-20)", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useUploaderJustificatif).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useUploaderJustificatif>);
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [souscription({ statut: "en_attente_justificatif" })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.getByText("justificatif.titre")).toBeInTheDocument();
    const fichierInput = screen.getByLabelText("justificatif.fichier_label") as HTMLInputElement;
    const fichier = new File(["contenu"], "carte-etudiante.pdf", { type: "application/pdf" });
    fireEvent.change(fichierInput, { target: { files: [fichier] } });

    fireEvent.click(screen.getByText("justificatif.envoyer"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ souscriptionId: "s1", fichier });
  });

  it("affiche le motif de rejet quand le rabais a été refusé (AHM-20)", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [
          souscription({
            statut: "rabais_refuse",
            justificatif: {
              id: "j1",
              souscription: "s1",
              type_justificatif: "",
              statut: "rejete",
              valide_par: "m-rh",
              date_decision: "2026-02-02T10:00:00Z",
              motif_rejet: "Carte étudiante expirée.",
              created_at: "2026-02-01T10:00:00Z",
            },
          }),
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.getByText("Carte étudiante expirée.")).toBeInTheDocument();
  });

  it("propose de retirer sa demande tant qu'elle n'est pas payée et confirme avant d'agir (demande utilisateur du 2026-09-16)", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useAnnulerSouscription).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useAnnulerSouscription>);
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [souscription({ statut: "en_attente_paiement" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    fireEvent.click(screen.getByText("hero.retirer"));
    expect(mutate).not.toHaveBeenCalled(); // confirmation requise avant d'agir
    fireEvent.click(screen.getByText("action.confirmer"));

    expect(mutate).toHaveBeenCalledWith("s1", expect.anything());
  });

  it("affiche les avantages et la tranche d'âge de chaque offre, avec une couleur propre à chacune (demande utilisateur 2026-09-25)", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne({
        offres: [
          offre({
            id: "o1",
            nom: "Basic",
            avantages: [{ ordre: 1, texte_fr: "Accès au fil d'actualité" }],
            condition_age_min: 18,
          }),
          offre({
            id: "o2",
            nom: "Famille",
            prix_plein: "200.00",
            avantages: [{ ordre: 1, texte_fr: "Jusqu'à 4 membres" }],
            condition_age_min: 0,
            condition_age_max: 17,
          }),
        ],
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.getByText("Accès au fil d'actualité")).toBeInTheDocument();
    expect(screen.getByText("Jusqu'à 4 membres")).toBeInTheDocument();
    expect(screen.getByText("offres.condition_age_min")).toBeInTheDocument();
    expect(screen.getByText("offres.condition_age_min_max")).toBeInTheDocument();

    // Chaque offre porte un liseré de couleur distinct et fixe (palette catégorielle, pas de
    // recyclage arbitraire) — repéré ici via la carte englobant son nom. Bordure HAUTE depuis le
    // passage au style carte façon mycid.org/membership (retour utilisateur du 2026-09-27, voir
    // docstring MonAdhesionPage.tsx), auparavant une bordure gauche.
    const carteBasic = screen.getByText("Basic").closest("div.rounded-cid-lg");
    const carteFamille = screen.getByText("Famille").closest("div.rounded-cid-lg");
    expect(carteBasic).toHaveClass("border-t-cat-1");
    expect(carteFamille).toHaveClass("border-t-cat-2");
  });

  it("ne propose pas de retirer une adhésion déjà payée", () => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue({
      data: campagne(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagneActive>);
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue({
      data: { next: null, previous: null, results: [souscription({ statut: "payee" })] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useMesSouscriptions>);
    vi.mocked(useAdhesionsHooks.useSouscrire).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useSouscrire>);

    renderWithProviders(<MonAdhesionPage />);

    expect(screen.queryByText("hero.retirer")).not.toBeInTheDocument();
  });
});
