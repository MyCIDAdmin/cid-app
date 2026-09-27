import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import AccueilTab from "./AccueilTab";

// Chaque section a ses propres tests dédiés (MembershipSection/KennzahlenBar/FanClubPreview) —
// ici on vérifie uniquement qu'AccueilTab les assemble toutes, dans l'ordre demandé par
// l'utilisateur (hero -> adhésion -> kennzahlen -> Fan-Club), sans "Aktives Projekt" (exclu,
// voir docstring du composant).
vi.mock("./MembershipSection", () => ({
  default: () => <div data-testid="membership-stub" />,
}));
vi.mock("./KennzahlenBar", () => ({ default: () => <div data-testid="kennzahlen-stub" /> }));
vi.mock("./FanClubPreview", () => ({ default: () => <div data-testid="fanclub-stub" /> }));

// useConfigurationSitePublic (Phase 5, "Startseite Hero-Video", ajouté le 2026-09-27) — mocké au
// niveau du hook plutôt qu'en stubant HeroVideo.tsx (celui-ci est purement présentationnel, voir
// sa docstring) : par défaut aucune vidéo configurée (comportement historique du hero, voir test
// dédié ci-dessous pour le cas "vidéo configurée").
vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useConfigurationSitePublic: vi.fn() };
});

function mockConfiguration(videoHero: string | null) {
  vi.mocked(useCommunauteHooks.useConfigurationSitePublic).mockReturnValue({
    data: { video_hero: videoHero, modifie_par: null, updated_at: "2026-01-01T00:00:00Z" },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useConfigurationSitePublic>);
}

describe("AccueilTab", () => {
  it("affiche le hero et assemble les sections dans l'ordre attendu", () => {
    mockConfiguration(null);
    renderWithProviders(<AccueilTab />);

    expect(screen.getByText("hero.titre")).toBeInTheDocument();
    expect(screen.getByText("hero.cta_mitglied_werden").closest("a")).toHaveAttribute(
      "href",
      "/mon-adhesion",
    );

    const ids = Array.from(document.querySelectorAll("[data-testid]")).map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids).toEqual(["membership-stub", "kennzahlen-stub", "fanclub-stub"]);
  });

  it("ne reprend pas la section \"Aktives Projekt\" (exclue par décision utilisateur)", () => {
    mockConfiguration(null);
    renderWithProviders(<AccueilTab />);
    expect(screen.queryByText(/aktives projekt/i)).not.toBeInTheDocument();
  });

  it("n'affiche pas de fond vidéo tant qu'aucune vidéo n'est configurée", () => {
    mockConfiguration(null);
    renderWithProviders(<AccueilTab />);
    expect(document.querySelector("video")).not.toBeInTheDocument();
  });

  it("affiche le fond vidéo du hero une fois une vidéo configurée (Phase 5)", () => {
    mockConfiguration("https://cid-media.example/configuration-site/hero/video.mp4");
    renderWithProviders(<AccueilTab />);

    const video = document.querySelector("video");
    expect(video).toHaveAttribute(
      "src",
      "https://cid-media.example/configuration-site/hero/video.mp4",
    );
    expect(video).toHaveAttribute("loop");
    expect((video as HTMLVideoElement).muted).toBe(true);
  });
});
