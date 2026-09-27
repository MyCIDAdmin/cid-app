import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
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

describe("AccueilTab", () => {
  it("affiche le hero et assemble les sections dans l'ordre attendu", () => {
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
    renderWithProviders(<AccueilTab />);
    expect(screen.queryByText(/aktives projekt/i)).not.toBeInTheDocument();
  });
});
