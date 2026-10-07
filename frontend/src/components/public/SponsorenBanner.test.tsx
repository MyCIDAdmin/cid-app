import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { BannerPartner } from "../../types/partner";
import SponsorenBanner from "./SponsorenBanner";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return { ...actual, usePartnerBanner: vi.fn() };
});

function mockBanner(data: BannerPartner[], isLoading = false) {
  vi.mocked(usePartnerHooks.usePartnerBanner).mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof usePartnerHooks.usePartnerBanner>);
}

function setzeRolle(role: "membre" | "rh" | null) {
  useAuthStore.setState(
    role
      ? {
          accessToken: "a",
          refreshToken: "r",
          isAuthenticated: true,
          user: { id: "u", email: "u@example.com", role, langue_preferee: "de" },
        }
      : { accessToken: null, refreshToken: null, isAuthenticated: false, user: null },
  );
}

const sponsor: BannerPartner = {
  id: "p1",
  nom: "Sponsor AG",
  logo_url: "https://cdn.example/sponsor.png",
  website: "https://sponsor.example",
};

describe("SponsorenBanner", () => {
  beforeEach(() => setzeRolle(null));

  it("zeigt Titel und Logos zentriert", () => {
    mockBanner([sponsor, { ...sponsor, id: "p2", nom: "Druck GmbH", website: "" }]);
    renderWithProviders(<SponsorenBanner />);
    expect(screen.getByRole("heading", { name: "sponsoren.titel" })).toBeInTheDocument();
    expect(screen.getByAltText("Sponsor AG")).toHaveAttribute("src", sponsor.logo_url);
    expect(screen.getByAltText("Druck GmbH")).toBeInTheDocument();
    expect(screen.getByRole("list").className).toContain("justify-center");
  });

  it("verlinkt das Logo nur, wenn eine Website gepflegt ist", () => {
    mockBanner([sponsor, { ...sponsor, id: "p2", nom: "Druck GmbH", website: "" }]);
    renderWithProviders(<SponsorenBanner />);
    const link = screen.getByRole("link", { name: "Sponsor AG" });
    expect(link).toHaveAttribute("href", "https://sponsor.example");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "Druck GmbH" })).not.toBeInTheDocument();
  });

  it("verlinkt keine unsicheren Adressen", () => {
    mockBanner([{ ...sponsor, website: "javascript:alert(1)" }]);
    renderWithProviders(<SponsorenBanner />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByAltText("Sponsor AG")).toBeInTheDocument();
  });

  it("bleibt für Besucher ohne Logos unsichtbar", () => {
    mockBanner([]);
    const { container } = renderWithProviders(<SponsorenBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt der Verwaltung einen Platzhalter mit Link zur Partnerverwaltung", () => {
    setzeRolle("rh");
    mockBanner([]);
    renderWithProviders(<SponsorenBanner />);
    expect(screen.getByText("sponsoren.platzhalter")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sponsoren.zur_verwaltung" })).toHaveAttribute(
      "href",
      "/admin/partner",
    );
  });

  it("zeigt Mitgliedern ohne Verwaltungsrolle keinen Platzhalter", () => {
    setzeRolle("membre");
    mockBanner([]);
    const { container } = renderWithProviders(<SponsorenBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("rendert während des Ladens nichts", () => {
    mockBanner([], true);
    const { container } = renderWithProviders(<SponsorenBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
