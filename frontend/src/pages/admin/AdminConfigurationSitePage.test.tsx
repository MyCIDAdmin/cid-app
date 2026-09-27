import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { ConfigurationSitePublic } from "../../types/communaute";
import AdminConfigurationSitePage from "./AdminConfigurationSitePage";

// Pas de RBAC ici (page hors matrice apps.rbac, gate = RequireRole minRoleLevel au niveau de la
// route App.tsx — voir docstring du composant) : on mocke uniquement les hooks de données.
vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return {
    ...actual,
    useConfigurationSitePublic: vi.fn(),
    useModifierConfigurationSitePublic: vi.fn(),
  };
});

function configuration(
  overrides: Partial<ConfigurationSitePublic> = {},
): ConfigurationSitePublic {
  return {
    video_hero: null,
    modifie_par: null,
    updated_at: "2026-09-27T10:00:00Z",
    ...overrides,
  };
}

describe("AdminConfigurationSitePage", () => {
  it("affiche un message de chargement", () => {
    vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
    vi.mocked(useCommunauteHooks.useModifierConfigurationSitePublic).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useModifierConfigurationSitePublic>);

    renderWithProviders(<AdminConfigurationSitePage />);

    expect(screen.getByText("admin_hero_video.chargement")).toBeInTheDocument();
  });

  it("affiche un message d'erreur de chargement", () => {
    vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
    vi.mocked(useCommunauteHooks.useModifierConfigurationSitePublic).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useModifierConfigurationSitePublic>);

    renderWithProviders(<AdminConfigurationSitePage />);

    expect(screen.getByText("admin_hero_video.erreur_chargement")).toBeInTheDocument();
  });

  it("affiche \"aucune vidéo\" quand la configuration n'a pas encore de vidéo", () => {
    vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
      data: configuration(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
    vi.mocked(useCommunauteHooks.useModifierConfigurationSitePublic).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useModifierConfigurationSitePublic>);

    renderWithProviders(<AdminConfigurationSitePage />);

    expect(screen.getByText("admin_hero_video.aucune_video")).toBeInTheDocument();
    expect(document.querySelector("video")).not.toBeInTheDocument();
  });

  it("affiche un aperçu de la vidéo déjà configurée", () => {
    vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
      data: configuration({ video_hero: "https://cid-media.example/hero/video.mp4" }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
    vi.mocked(useCommunauteHooks.useModifierConfigurationSitePublic).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useModifierConfigurationSitePublic>);

    renderWithProviders(<AdminConfigurationSitePage />);

    const video = document.querySelector("video");
    expect(video).toHaveAttribute("src", "https://cid-media.example/hero/video.mp4");
  });

  it("déclenche la mutation quand un fichier est choisi via l'input caché", () => {
    const mutate = vi.fn();
    vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
      data: configuration(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
    vi.mocked(useCommunauteHooks.useModifierConfigurationSitePublic).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useModifierConfigurationSitePublic>);

    renderWithProviders(<AdminConfigurationSitePage />);

    const fichier = new File(["contenu"], "hero.mp4", { type: "video/mp4" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fichier] } });

    expect(mutate).toHaveBeenCalledWith(fichier, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it("affiche \"en cours\" et désactive le bouton pendant l'envoi", () => {
    vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
      data: configuration(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
    vi.mocked(useCommunauteHooks.useModifierConfigurationSitePublic).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof useCommunauteHooks.useModifierConfigurationSitePublic>);

    renderWithProviders(<AdminConfigurationSitePage />);

    expect(screen.getByText("admin_hero_video.televersement_en_cours")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("affiche le message d'erreur renvoyé par la mutation en cas d'échec", async () => {
    const mutate = vi.fn((_fichier: File, options?: { onError?: (err: unknown) => void }) => {
      options?.onError?.(new Error("échec"));
    });
    vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
      data: configuration(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
    vi.mocked(useCommunauteHooks.useModifierConfigurationSitePublic).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCommunauteHooks.useModifierConfigurationSitePublic>);

    renderWithProviders(<AdminConfigurationSitePage />);

    const fichier = new File(["contenu"], "hero.mp4", { type: "video/mp4" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fichier] } });

    await waitFor(() => {
      expect(screen.getByText("admin_hero_video.erreur")).toBeInTheDocument();
    });
  });
});
