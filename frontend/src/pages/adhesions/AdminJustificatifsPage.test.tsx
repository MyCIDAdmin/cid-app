import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as adhesionsApi from "../../api/adhesions";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import * as useMembresHooks from "../../hooks/useMembres";
import * as useRbacHooks from "../../hooks/useRbac";
import type { CampagneAdhesion, Souscription } from "../../types/adhesion";
import AdminJustificatifsPage from "./AdminJustificatifsPage";

// Task #216 (2026-09-24) : "page_justificatifs" lecture/lecture_ecriture — plein accès par
// défaut pour ne pas casser les tests existants ; voir le describe dédié plus bas.
vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
});

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return {
    ...actual,
    useCampagnes: vi.fn(),
    useJustificatifsEnAttente: vi.fn(),
    useValiderJustificatif: vi.fn(),
    useUploaderJustificatif: vi.fn(),
    useAnnulerSouscription: vi.fn(),
  };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembre: vi.fn(),
  };
});

vi.mock("../../api/adhesions", async () => {
  const actual = await vi.importActual<typeof adhesionsApi>("../../api/adhesions");
  return {
    ...actual,
    telechargerJustificatif: vi.fn(),
  };
});

function campagne(): CampagneAdhesion {
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
    offres: [
      {
        id: "o1",
        campagne: "c1",
        nom: "Basic",
        prix_plein: "120.00",
        description: "",
        avantages: [],
        condition_age_min: null,
        condition_age_max: null,
        visible: true,
        ordre: 1,
        icone: null,
        couleur: "",
        populaire: false,
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
      },
    ],
  };
}

function souscriptionAvecJustificatif(overrides: Partial<Souscription> = {}): Souscription {
  return {
    id: "s1",
    membre: "m1",
    offre: "o1",
    campagne: "c1",
    date_souscription: "2026-02-01T10:00:00Z",
    prix_paye: "96.00",
    rabais: "r1",
    statut: "en_attente_justificatif",
    cotisation: null,
    snapshot_avantages: [],
    justificatif: {
      id: "j1",
      souscription: "s1",
      type_justificatif: "carte_etudiante",
      statut: "en_attente",
      valide_par: null,
      date_decision: null,
      motif_rejet: "",
      created_at: "2026-02-01T10:00:00Z",
    },
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    ...overrides,
  };
}

describe("AdminJustificatifsPage", () => {
  beforeEach(() => {
    vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
      accessible: true,
      modifiable: true,
      isLoading: false,
    });
    vi.mocked(useAdhesionsHooks.useCampagnes).mockReturnValue({
      data: { next: null, previous: null, results: [campagne()] },
    } as unknown as ReturnType<typeof useAdhesionsHooks.useCampagnes>);
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: { id: "m1", prenom: "Riadh", nom: "Bchini", numero_membre: "CA-2026-001" },
      isLoading: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    vi.mocked(useAdhesionsHooks.useValiderJustificatif).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useValiderJustificatif>);
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
  });

  it("affiche un message quand la file est vide", () => {
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);

    renderWithProviders(<AdminJustificatifsPage />);

    expect(screen.getByText("admin_justificatifs.aucun")).toBeInTheDocument();
  });

  it("affiche le membre, l'offre, le rabais et propose de voir le document", () => {
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: { next: null, previous: null, results: [souscriptionAvecJustificatif()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);

    renderWithProviders(<AdminJustificatifsPage />);

    expect(screen.getByText("Riadh Bchini (CA-2026-001)")).toBeInTheDocument();
    expect(screen.getByText("Basic")).toBeInTheDocument();
    expect(screen.getByText("Étudiant -20%")).toBeInTheDocument();
    expect(screen.getByText("admin_justificatifs.voir")).toBeInTheDocument();
  });

  it("propose d'uploader le document pour le membre quand il n'a pas encore été envoyé (demande utilisateur du 2026-09-16)", () => {
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [souscriptionAvecJustificatif({ justificatif: null })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);

    renderWithProviders(<AdminJustificatifsPage />);

    expect(
      screen.getByLabelText("admin_justificatifs.uploader_pour_membre — Basic"),
    ).toBeInTheDocument();
    expect(screen.queryByText("admin_justificatifs.approuver")).not.toBeInTheDocument();
  });

  it("uploade le fichier choisi pour le compte du membre", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useUploaderJustificatif).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useUploaderJustificatif>);
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: {
        next: null,
        previous: null,
        results: [souscriptionAvecJustificatif({ justificatif: null })],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);

    renderWithProviders(<AdminJustificatifsPage />);

    const fichier = new File(["contenu"], "carte.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("admin_justificatifs.uploader_pour_membre — Basic"), {
      target: { files: [fichier] },
    });

    expect(mutate).toHaveBeenCalledWith({ souscriptionId: "s1", fichier });
  });

  it("annule la souscription après confirmation", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useAnnulerSouscription).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useAnnulerSouscription>);
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: { next: null, previous: null, results: [souscriptionAvecJustificatif()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);

    renderWithProviders(<AdminJustificatifsPage />);

    fireEvent.click(screen.getByText("admin_justificatifs.annuler_souscription"));
    fireEvent.click(screen.getByText("action.confirmer"));

    expect(mutate).toHaveBeenCalledWith("s1", expect.anything());
  });

  it("ouvre le document dans un nouvel onglet via l'URL pré-signée", async () => {
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: { next: null, previous: null, results: [souscriptionAvecJustificatif()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);
    vi.mocked(adhesionsApi.telechargerJustificatif).mockResolvedValue({
      url: "https://minio.example/justificatifs/j1.pdf?signature=abc",
      expires_in: 900,
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderWithProviders(<AdminJustificatifsPage />);
    fireEvent.click(screen.getByText("admin_justificatifs.voir"));

    await waitFor(() => expect(adhesionsApi.telechargerJustificatif).toHaveBeenCalledWith("j1"));
    expect(openSpy).toHaveBeenCalledWith(
      "https://minio.example/justificatifs/j1.pdf?signature=abc",
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockRestore();
  });

  it("approuve le justificatif", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useValiderJustificatif).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useValiderJustificatif>);
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: { next: null, previous: null, results: [souscriptionAvecJustificatif()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);

    renderWithProviders(<AdminJustificatifsPage />);
    fireEvent.click(screen.getByText("admin_justificatifs.approuver"));

    expect(mutate).toHaveBeenCalledWith({ id: "j1", payload: { decision: "approuve" } });
  });

  it("rejette le justificatif avec un motif obligatoire", () => {
    const mutate = vi.fn();
    vi.mocked(useAdhesionsHooks.useValiderJustificatif).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useValiderJustificatif>);
    vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
      data: { next: null, previous: null, results: [souscriptionAvecJustificatif()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);

    renderWithProviders(<AdminJustificatifsPage />);

    // Le bouton "Confirmer" est désactivé tant qu'aucun motif n'est saisi.
    fireEvent.click(screen.getByText("admin_justificatifs.rejeter"));
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("admin_justificatifs.motif_placeholder"), {
      target: { value: "Carte étudiante expirée." },
    });
    fireEvent.click(screen.getByText("admin_justificatifs.confirmer_rejet"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      id: "j1",
      payload: { decision: "rejete", motif_rejet: "Carte étudiante expirée." },
    });
  });

  describe("accès lecture seule (task #216)", () => {
    beforeEach(() => {
      vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue({
        data: { next: null, previous: null, results: [souscriptionAvecJustificatif()] },
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useAdhesionsHooks.useJustificatifsEnAttente>);
    });

    it("n'affiche pas de bandeau et laisse Approuver/Rejeter actifs quand modifiable=true", () => {
      renderWithProviders(<AdminJustificatifsPage />);

      expect(screen.queryByText("acces.lecture_seule_banniere")).not.toBeInTheDocument();
      expect(screen.getByText("admin_justificatifs.approuver")).not.toBeDisabled();
      expect(screen.getByText("admin_justificatifs.rejeter")).not.toBeDisabled();
    });

    it("affiche un bandeau et désactive Approuver/Rejeter quand modifiable=false", () => {
      vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
        accessible: true,
        modifiable: false,
        isLoading: false,
      });

      renderWithProviders(<AdminJustificatifsPage />);

      expect(screen.getByText("acces.lecture_seule_banniere")).toBeInTheDocument();
      // Lecture : la file reste visible.
      expect(screen.getByText("Riadh Bchini (CA-2026-001)")).toBeInTheDocument();
      expect(screen.getByText("admin_justificatifs.approuver")).toBeDisabled();
      expect(screen.getByText("admin_justificatifs.rejeter")).toBeDisabled();
    });
  });
});
