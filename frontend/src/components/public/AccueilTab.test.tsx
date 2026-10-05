import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import AccueilTab from "./AccueilTab";

// Chaque section a ses propres tests dédiés (KennzahlenBar/FanClubPreview/NextMatchTile) — ici
// on vérifie uniquement qu'AccueilTab les assemble toutes, dans l'ordre demandé par l'utilisateur
// (hero -> Kachel "Nächstes Spiel" -> kennzahlen -> Fan-Club, retour utilisateur du 2026-09-28),
// sans "Aktives Projekt" (exclu, voir docstring du composant) et sans section adhésion (retour
// utilisateur du 2026-09-27 : "Mitgliedschaft Kampagne soll ausgeblendet sein" — voir docstring
// d'AccueilTab.tsx, l'offre ne vit plus que sur /mon-adhesion).
vi.mock("./NextMatchTile", () => ({ default: () => <div data-testid="next-match-stub" /> }));
vi.mock("./KennzahlenBar", () => ({ default: () => <div data-testid="kennzahlen-stub" /> }));
vi.mock("./FanClubPreview", () => ({ default: () => <div data-testid="fanclub-stub" /> }));
vi.mock("./MitgliedWerdenVorschau", () => ({
  default: () => <div data-testid="vorschau-stub" />,
}));

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
    // Point 10 (2026-10-06) : un visiteur ouvre d'abord l'aperçu de la campagne (bouton),
    // plus un lien direct vers /mon-adhesion.
    expect(screen.getByRole("button", { name: "hero.cta_mitglied_werden" })).toBeInTheDocument();

    const ids = Array.from(document.querySelectorAll("[data-testid]")).map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids).toEqual(["next-match-stub", "kennzahlen-stub", "fanclub-stub"]);
  });

  it("ne montre pas la section adhésion sur la Startseite (retour utilisateur du 2026-09-27)", () => {
    mockConfiguration(null);
    renderWithProviders(<AccueilTab />);
    expect(screen.queryByTestId("membership-stub")).not.toBeInTheDocument();
  });

  it('ne reprend pas la section "Aktives Projekt" (exclue par décision utilisateur)', () => {
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

  it("ouvre l'aperçu de la campagne au clic sur 'Mitglied werden' (visiteur, point 10)", () => {
    mockConfiguration(null);
    renderWithProviders(<AccueilTab />);
    expect(screen.queryByTestId("vorschau-stub")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "hero.cta_mitglied_werden" }));
    expect(screen.getByTestId("vorschau-stub")).toBeInTheDocument();
  });
  it("pose le texte directement sur la vidéo, sans boîte (retour du 2026-10-06)", () => {
    mockConfiguration("https://cid-media.example/configuration-site/hero/video.mp4");
    renderWithProviders(<AccueilTab />);
    const titre = screen.getByRole("heading", { level: 1, name: "hero.titre" });
    const bloc = titre.parentElement as HTMLElement;
    expect(bloc).toHaveClass("hero-anim", "hero-text-sur-video");
    expect(bloc.className).not.toMatch(/glass-panel|bg-/);
  });

  it("découpe le titre en mots animés tout en gardant un nom accessible complet", () => {
    mockConfiguration(null);
    renderWithProviders(<AccueilTab />);
    const titre = screen.getByRole("heading", { level: 1 });
    expect(titre).toHaveAccessibleName("hero.titre");
    expect(titre.querySelectorAll(".hero-mot")).toHaveLength(1);
    expect(titre.querySelector(".hero-mot")).toHaveStyle({ "--mot": "0" });
  });
});
