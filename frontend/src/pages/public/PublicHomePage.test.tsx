import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import * as useProjetsHooks from "../../hooks/useProjets";
import PublicHomePage from "./PublicHomePage";

// L'onglet "accueil" embarque MembershipSection/KennzahlenBar/FanClubPreview (voir AccueilTab),
// chacun avec ses propres tests dédiés (MembershipSection.test.tsx, KennzahlenBar.test.tsx,
// FanClubPreview.test.tsx) — ici, seuls des retours vides/neutres pour ne jamais dépendre d'un
// vrai appel réseau dans ces tests de navigation/onglets.
vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return { ...actual, useCampagneActive: vi.fn(), useMesSouscriptions: vi.fn() };
});
vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return { ...actual, useKennzahlenProjets: vi.fn() };
});
vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useClassementLigue: vi.fn(), useCalendrierRencontres: vi.fn() };
});

// Les 5 autres onglets (Phase D) ont chacun leurs propres tests dédiés (PublicEvenementsTab.test.tsx,
// UeberUnsTab.test.tsx, ProjetsPage.test.tsx, CataloguePage.test.tsx, AlbumsPage.test.tsx) — ici on
// ne vérifie que le SWITCHING entre onglets (nav/footer toujours présents), jamais leur contenu
// interne, donc chacun est remplacé par un stub reconnaissable.
vi.mock("../../components/public/PublicEvenementsTab", () => ({
  default: () => <div data-testid="evenements-stub" />,
}));
vi.mock("../../components/public/UeberUnsTab", () => ({
  default: () => <div data-testid="apropos-stub" />,
}));
vi.mock("../projets/ProjetsPage", () => ({ default: () => <div data-testid="projets-stub" /> }));
vi.mock("../boutique/CataloguePage", () => ({ default: () => <div data-testid="shop-stub" /> }));
vi.mock("../communaute/AlbumsPage", () => ({ default: () => <div data-testid="galerie-stub" /> }));

function videQuery() {
  return { data: undefined, isLoading: false, isError: true } as never;
}

describe("PublicHomePage", () => {
  beforeEach(() => {
    vi.mocked(useAdhesionsHooks.useCampagneActive).mockReturnValue(videQuery());
    vi.mocked(useAdhesionsHooks.useMesSouscriptions).mockReturnValue(videQuery());
    vi.mocked(useProjetsHooks.useKennzahlenProjets).mockReturnValue(videQuery());
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue(videQuery());
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue(videQuery());
  });


  it("affiche l'onglet 'accueil' par défaut avec le CTA d'adhésion", () => {
    renderWithProviders(<PublicHomePage />);
    expect(screen.getByText("hero.titre")).toBeInTheDocument();
    expect(screen.getByText("hero.cta_mitglied_werden").closest("a")).toHaveAttribute(
      "href",
      "/mon-adhesion",
    );
  });

  it("affiche toujours la nav et le footer, quel que soit l'onglet", () => {
    renderWithProviders(<PublicHomePage />);
    expect(screen.getByText("action.connexion")).toBeInTheDocument();
    expect(screen.getByText("footer.rechtliches_titre")).toBeInTheDocument();
  });

  it("bascule vers un autre onglet sans faire disparaître nav/footer", () => {
    renderWithProviders(<PublicHomePage />);
    fireEvent.click(screen.getByRole("button", { name: "nav.evenements" }));

    expect(screen.getByTestId("evenements-stub")).toBeInTheDocument();
    expect(screen.queryByText("hero.titre")).not.toBeInTheDocument();
    expect(screen.getByText("action.connexion")).toBeInTheDocument();
    expect(screen.getByText("footer.rechtliches_titre")).toBeInTheDocument();
  });

  it("revient à l'accueil au clic sur le logo", () => {
    renderWithProviders(<PublicHomePage />, { route: "/?onglet=projets" });
    expect(screen.getByTestId("projets-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Clubistes in Deutschland"));
    expect(screen.getByText("hero.titre")).toBeInTheDocument();
  });

  it("affiche chacun des 5 onglets Phase D à son tour", () => {
    renderWithProviders(<PublicHomePage />);

    fireEvent.click(screen.getByRole("button", { name: "nav.projets" }));
    expect(screen.getByTestId("projets-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "nav.shop" }));
    expect(screen.getByTestId("shop-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "nav.galerie" }));
    expect(screen.getByTestId("galerie-stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "nav.apropos" }));
    expect(screen.getByTestId("apropos-stub")).toBeInTheDocument();
  });
});
