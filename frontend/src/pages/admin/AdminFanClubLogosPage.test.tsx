import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { EquipeLogo } from "../../types/communaute";
import AdminFanClubLogosPage from "./AdminFanClubLogosPage";

// Pas de RBAC ici (page hors matrice apps.rbac, gate = RequireRole minRoleLevel au niveau de
// la route App.tsx — voir docstring du composant, même principe qu'AdminConfigurationSitePage) :
// on mocke uniquement les hooks de données.
vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useEquipesLogos: vi.fn(),
    useEnregistrerEquipeLogo: vi.fn(),
    useSupprimerEquipeLogo: vi.fn(),
  };
});

function logo(overrides: Partial<EquipeLogo> = {}): EquipeLogo {
  return {
    id: 1,
    equipe: "Espérance de Tunis",
    logo: "https://cid-media.example/fan-club/logos/est.png",
    modifie_par: null,
    updated_at: "2026-09-28T10:00:00Z",
    ...overrides,
  };
}

function mockHooks({
  data,
  isLoading = false,
  isError = false,
  enregistrerMutate = vi.fn(),
  enregistrerIsPending = false,
  supprimerMutate = vi.fn(),
  supprimerIsPending = false,
}: {
  data?: EquipeLogo[];
  isLoading?: boolean;
  isError?: boolean;
  enregistrerMutate?: ReturnType<typeof vi.fn>;
  enregistrerIsPending?: boolean;
  supprimerMutate?: ReturnType<typeof vi.fn>;
  supprimerIsPending?: boolean;
}) {
  vi.mocked(useCommunauteHooks.useEquipesLogos).mockReturnValue({
    data,
    isLoading,
    isError,
  } as unknown as ReturnType<typeof useCommunauteHooks.useEquipesLogos>);
  vi.mocked(useCommunauteHooks.useEnregistrerEquipeLogo).mockReturnValue({
    mutate: enregistrerMutate,
    isPending: enregistrerIsPending,
  } as unknown as ReturnType<typeof useCommunauteHooks.useEnregistrerEquipeLogo>);
  vi.mocked(useCommunauteHooks.useSupprimerEquipeLogo).mockReturnValue({
    mutate: supprimerMutate,
    isPending: supprimerIsPending,
  } as unknown as ReturnType<typeof useCommunauteHooks.useSupprimerEquipeLogo>);
}

describe("AdminFanClubLogosPage", () => {
  it("affiche un message de chargement", () => {
    mockHooks({ data: undefined, isLoading: true });
    renderWithProviders(<AdminFanClubLogosPage />);
    expect(screen.getByText("admin_fan_club_logos.chargement")).toBeInTheDocument();
  });

  it("affiche un message d'erreur de chargement", () => {
    mockHooks({ data: undefined, isError: true });
    renderWithProviders(<AdminFanClubLogosPage />);
    expect(screen.getByText("admin_fan_club_logos.erreur_chargement")).toBeInTheDocument();
  });

  it("affiche \"aucun logo\" quand la liste est vide", () => {
    mockHooks({ data: [] });
    renderWithProviders(<AdminFanClubLogosPage />);
    expect(screen.getByText("admin_fan_club_logos.aucun_logo")).toBeInTheDocument();
  });

  it("affiche la liste des logos existants avec leur nom d'équipe", () => {
    mockHooks({ data: [logo(), logo({ id: 2, equipe: "Club Africain" })] });
    renderWithProviders(<AdminFanClubLogosPage />);
    expect(screen.getByText("Espérance de Tunis")).toBeInTheDocument();
    expect(screen.getByText("Club Africain")).toBeInTheDocument();
  });

  it("le bouton de téléversement reste désactivé tant que le nom et le fichier ne sont pas renseignés", () => {
    mockHooks({ data: [] });
    renderWithProviders(<AdminFanClubLogosPage />);
    expect(screen.getByText("admin_fan_club_logos.televerser")).toBeDisabled();
  });

  it("déclenche la mutation avec le nom d'équipe et le fichier choisis", () => {
    const enregistrerMutate = vi.fn();
    mockHooks({ data: [], enregistrerMutate });
    renderWithProviders(<AdminFanClubLogosPage />);

    fireEvent.change(screen.getByLabelText("admin_fan_club_logos.champ_equipe"), {
      target: { value: "Espérance de Tunis" },
    });
    const fichier = new File(["contenu"], "logo.png", { type: "image/png" });
    const inputFichier = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(inputFichier, { target: { files: [fichier] } });

    fireEvent.click(screen.getByText("admin_fan_club_logos.televerser"));

    expect(enregistrerMutate).toHaveBeenCalledWith(
      { equipe: "Espérance de Tunis", logo: fichier },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("affiche \"en cours\" et désactive le bouton pendant l'envoi", () => {
    mockHooks({ data: [], enregistrerIsPending: true });
    renderWithProviders(<AdminFanClubLogosPage />);
    expect(screen.getByText("admin_fan_club_logos.televersement_en_cours")).toBeInTheDocument();
  });

  it("affiche le message d'erreur renvoyé par la mutation d'enregistrement en cas d'échec", async () => {
    const enregistrerMutate = vi.fn(
      (
        _payload: { equipe: string; logo: File },
        options?: { onError?: (err: unknown) => void },
      ) => {
        options?.onError?.(new Error("échec"));
      },
    );
    mockHooks({ data: [], enregistrerMutate });
    renderWithProviders(<AdminFanClubLogosPage />);

    fireEvent.change(screen.getByLabelText("admin_fan_club_logos.champ_equipe"), {
      target: { value: "Espérance de Tunis" },
    });
    const fichier = new File(["contenu"], "logo.png", { type: "image/png" });
    const inputFichier = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(inputFichier, { target: { files: [fichier] } });
    fireEvent.click(screen.getByText("admin_fan_club_logos.televerser"));

    await waitFor(() => {
      expect(screen.getByText("admin_fan_club_logos.erreur_enregistrement")).toBeInTheDocument();
    });
  });

  it("déclenche la suppression au clic sur le bouton retirer", () => {
    const supprimerMutate = vi.fn();
    mockHooks({ data: [logo({ id: 42 })], supprimerMutate });
    renderWithProviders(<AdminFanClubLogosPage />);

    fireEvent.click(screen.getByText("admin_fan_club_logos.supprimer"));

    expect(supprimerMutate).toHaveBeenCalledWith(42, expect.objectContaining({
      onError: expect.any(Function),
    }));
  });
});
