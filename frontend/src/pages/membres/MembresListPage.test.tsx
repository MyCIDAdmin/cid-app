import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as membresApi from "../../api/membres";
import { useAuthStore } from "../../store/authStore";
import type { CursorPage, MembreListItem } from "../../types/membre";
import * as useMembresHooks from "../../hooks/useMembres";
import MembresListPage from "./MembresListPage";

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembresList: vi.fn(),
    useDeleteMembre: vi.fn(),
  };
});

vi.mock("../../api/membres", async () => {
  const actual = await vi.importActual<typeof membresApi>("../../api/membres");
  return {
    ...actual,
    exporterMembres: vi.fn(),
  };
});

const membre: MembreListItem = {
  id: "m1",
  numero_membre: "CA-2024-001",
  prenom: "Sami",
  nom: "Ben Salah",
  email: "sami@example.com",
  pays: "DE",
  ville_de: "Berlin",
  land_de: "BE",
  statut: "actif",
  date_adhesion: "2024-01-15",
  cin_masque: "12***78",
};

const page: CursorPage<MembreListItem> = { next: null, previous: null, results: [membre] };

function mockList(overrides: Partial<ReturnType<typeof useMembresHooks.useMembresList>> = {}) {
  vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
    data: page,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useMembresHooks.useMembresList>);
}

describe("MembresListPage", () => {
  beforeEach(() => {
    vi.mocked(useMembresHooks.useDeleteMembre).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useMembresHooks.useDeleteMembre>);
  });

  it("affiche les membres retournés par la liste", () => {
    useAuthStore.setState({
      user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    mockList();

    renderWithProviders(<MembresListPage />);

    expect(screen.getByText("Sami Ben Salah")).toBeInTheDocument();
    expect(screen.getByText("CA-2024-001")).toBeInTheDocument();
    // "Berlin" scopé à la cellule du tableau : le nouveau filtre Bundesland (2026-09-19)
    // ajoute aussi une <option>"Berlin"</option>, qui matcherait sinon un getByText global.
    expect(screen.getByRole("cell", { name: "Berlin" })).toBeInTheDocument();
  });

  it("masque les actions RH+/Bureau Admin mais garde 'modifier' pour un rôle membre (AHM-51)", () => {
    useAuthStore.setState({
      user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
    });
    mockList();

    renderWithProviders(<MembresListPage />);

    // Un Membre ne voit ici que sa propre fiche (scope backend) — "modifier"
    // pointe donc toujours vers la sienne, désormais autorisé (AHM-51).
    expect(screen.getByText("liste.modifier")).toBeInTheDocument();
    expect(screen.queryByText("liste.supprimer")).not.toBeInTheDocument();
    expect(screen.queryByText(/liste.ajouter/)).not.toBeInTheDocument();
  });

  it("ouvre la confirmation de suppression pour un rôle bureau_admin", () => {
    useAuthStore.setState({
      user: { id: "u3", email: "admin@example.com", role: "bureau_admin", langue_preferee: "fr" },
    });
    mockList();

    renderWithProviders(<MembresListPage />);

    fireEvent.click(screen.getByText("liste.supprimer"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("affiche un état de chargement", () => {
    useAuthStore.setState({
      user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
    });
    mockList({ data: undefined, isLoading: true } as never);

    renderWithProviders(<MembresListPage />);
    expect(screen.getByText("liste.chargement")).toBeInTheDocument();
  });

  describe("filtres Bundesland/Pays/date d'adhésion (demande utilisateur du 2026-09-19)", () => {
    it("affiche les nouveaux champs de filtre", () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();

      renderWithProviders(<MembresListPage />);

      expect(screen.getByLabelText("liste.filtre_land")).toBeInTheDocument();
      expect(screen.getByLabelText("liste.filtre_pays")).toBeInTheDocument();
      expect(screen.getByLabelText("liste.filtre_adhesion_apres")).toBeInTheDocument();
      expect(screen.getByLabelText("liste.filtre_adhesion_avant")).toBeInTheDocument();
    });

    it("transmet land/pays/dates à useMembresList et à l'export", async () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();
      vi.mocked(membresApi.exporterMembres).mockResolvedValue({
        blob: new Blob(["contenu"]),
        nomFichier: "export_membres_20260919.xlsx",
      });
      window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      window.URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      renderWithProviders(<MembresListPage />);

      fireEvent.change(screen.getByLabelText("liste.filtre_land"), { target: { value: "BE" } });
      fireEvent.change(screen.getByLabelText("liste.filtre_pays"), { target: { value: "FR" } });
      fireEvent.change(screen.getByLabelText("liste.filtre_adhesion_apres"), {
        target: { value: "2026-01-01" },
      });
      fireEvent.change(screen.getByLabelText("liste.filtre_adhesion_avant"), {
        target: { value: "2026-12-31" },
      });

      expect(vi.mocked(useMembresHooks.useMembresList)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          land: "BE",
          pays: "FR",
          date_adhesion_apres: "2026-01-01",
          date_adhesion_avant: "2026-12-31",
        }),
        null,
      );

      fireEvent.click(screen.getByText("liste.exporter"));
      fireEvent.click(screen.getByText("liste.export_champs_confirmer"));

      await waitFor(() => expect(membresApi.exporterMembres).toHaveBeenCalledTimes(1));
      expect(membresApi.exporterMembres).toHaveBeenCalledWith(
        expect.objectContaining({
          land: "BE",
          pays: "FR",
          date_adhesion_apres: "2026-01-01",
          date_adhesion_avant: "2026-12-31",
        }),
      );
    });

    it("réinitialise land/pays/dates avec les autres filtres", () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();

      renderWithProviders(<MembresListPage />);

      fireEvent.change(screen.getByLabelText("liste.filtre_land"), { target: { value: "BY" } });
      fireEvent.click(screen.getByText("liste.reinitialiser"));

      expect(screen.getByLabelText("liste.filtre_land")).toHaveValue("");
    });
  });

  describe("export Excel (demande utilisateur du 2026-09-16)", () => {
    beforeEach(() => {
      window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
      window.URL.revokeObjectURL = vi.fn();
      // jsdom tente une vraie navigation sur le clic d'un <a href="blob:...">
      // (non pertinent ici, on ne teste que le déclenchement du téléchargement).
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      // Historique d'appels/implémentation remis à zéro entre chaque test de ce bloc — sans ça,
      // toHaveBeenCalledTimes(1) et mock.calls[0] retombent sur un appel d'un test précédent.
      vi.mocked(membresApi.exporterMembres).mockReset();
    });

    it("n'affiche pas le bouton d'export pour un rôle membre", () => {
      useAuthStore.setState({
        user: { id: "u2", email: "membre@example.com", role: "membre", langue_preferee: "fr" },
      });
      mockList();

      renderWithProviders(<MembresListPage />);

      expect(screen.queryByText("liste.exporter")).not.toBeInTheDocument();
    });

    it("ouvre la sélection des colonnes au clic, toutes cochées par défaut", () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();

      renderWithProviders(<MembresListPage />);
      fireEvent.click(screen.getByText("liste.exporter"));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      const cases = screen.getAllByRole("checkbox") as HTMLInputElement[];
      expect(cases.length).toBeGreaterThan(0);
      expect(cases.every((c) => c.checked)).toBe(true);
    });

    it("applique le tri choisi au tableau (requête de liste) et repart de la première page", async () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList({ data: { ...page, next: "http://api/membres/?cursor=abc" } });

      renderWithProviders(<MembresListPage />);
      // Page 2 ouverte, puis changement de tri -> retour page 1 avec le nouvel ordre.
      fireEvent.click(screen.getByText("liste.suivant"));
      fireEvent.change(screen.getByLabelText("liste.trier_par"), {
        target: { value: "-date_adhesion" },
      });

      await waitFor(() => {
        const appels = vi.mocked(useMembresHooks.useMembresList).mock.calls;
        const dernier = appels[appels.length - 1];
        expect(dernier[0]).toEqual(expect.objectContaining({ ordering: "-date_adhesion" }));
        expect(dernier[1]).toBeNull();
      });
    });

    it("exporte avec les filtres, le tri et toutes les colonnes après confirmation, pour un rôle RH+", async () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();
      vi.mocked(membresApi.exporterMembres).mockResolvedValue({
        blob: new Blob(["contenu"]),
        nomFichier: "export_membres_20260916.xlsx",
      });

      renderWithProviders(<MembresListPage />);

      fireEvent.change(screen.getByLabelText("liste.filtre_ville"), {
        target: { value: "Berlin" },
      });
      fireEvent.change(screen.getByLabelText("liste.trier_par"), {
        target: { value: "-date_adhesion" },
      });
      fireEvent.click(screen.getByText("liste.exporter"));
      fireEvent.click(screen.getByText("liste.export_champs_confirmer"));

      await waitFor(() => expect(membresApi.exporterMembres).toHaveBeenCalledTimes(1));
      expect(membresApi.exporterMembres).toHaveBeenCalledWith(
        expect.objectContaining({
          ville: "Berlin",
          ordering: "-date_adhesion",
          champs: expect.arrayContaining(["prenom", "nom", "cin"]),
        }),
      );
    });

    it("n'exporte que les colonnes cochées après décoche d'un champ", async () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();
      vi.mocked(membresApi.exporterMembres).mockResolvedValue({
        blob: new Blob(["contenu"]),
        nomFichier: "export_membres_20260916.xlsx",
      });

      renderWithProviders(<MembresListPage />);
      fireEvent.click(screen.getByText("liste.exporter"));
      // champ.cin est le libellé traduit (mock i18n renvoie la clé) affiché à côté de la case.
      fireEvent.click(screen.getByLabelText("champ.cin"));
      fireEvent.click(screen.getByText("liste.export_champs_confirmer"));

      await waitFor(() => expect(membresApi.exporterMembres).toHaveBeenCalledTimes(1));
      const appel = vi.mocked(membresApi.exporterMembres).mock.calls[0][0];
      expect(appel?.champs).not.toContain("cin");
    });

    it("désactive la confirmation si aucune colonne n'est sélectionnée", () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();

      renderWithProviders(<MembresListPage />);
      fireEvent.click(screen.getByText("liste.exporter"));
      fireEvent.click(screen.getByText("liste.export_champs_tout_deselectionner"));

      expect(screen.getByText("liste.export_champs_confirmer")).toBeDisabled();
      expect(screen.getByText("liste.export_champs_aucune_selection")).toBeInTheDocument();
    });

    it("affiche un message d'erreur si l'export échoue", async () => {
      useAuthStore.setState({
        user: { id: "u1", email: "rh@example.com", role: "rh", langue_preferee: "fr" },
      });
      mockList();
      vi.mocked(membresApi.exporterMembres).mockRejectedValue(new Error("boom"));

      renderWithProviders(<MembresListPage />);
      fireEvent.click(screen.getByText("liste.exporter"));
      fireEvent.click(screen.getByText("liste.export_champs_confirmer"));

      expect(await screen.findByText("liste.export_erreur")).toBeInTheDocument();
    });
  });
});
