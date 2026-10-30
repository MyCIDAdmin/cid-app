import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import frDashboard from "../../../public/locales/fr/dashboard.json";
import i18n from "../../i18n";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import type { HeroTipp } from "../../hooks/useHeroTipp";
import { renderWithProviders } from "../../test/renderWithProviders";
import HeroTippPanel from "./HeroTipp";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useCreerTippspielTip: vi.fn(), useModifierTippspielTip: vi.fn() };
});

const spiel = {
  id: "m1",
  competition: "Ligue 1",
  equipe_domicile: "Club Africain",
  equipe_exterieur: "ES Tunis",
  date_heure: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  statut: "SCHEDULED",
  est_a_venir: true,
} as never;

beforeAll(() => {
  i18n.addResourceBundle("fr", "dashboard", frDashboard, true, true);
});

const creer = vi.fn();
const modifier = vi.fn();

beforeEach(() => {
  creer.mockReset();
  modifier.mockReset();
  vi.mocked(useCommunauteHooks.useCreerTippspielTip).mockReturnValue({
    mutate: creer,
    isPending: false,
  } as never);
  vi.mocked(useCommunauteHooks.useModifierTippspielTip).mockReturnValue({
    mutate: modifier,
    isPending: false,
  } as never);
});

function tipp(over: Partial<HeroTipp>): HeroTipp {
  return { status: "tippen", spiel, tippspielId: "t1", ...over };
}

describe("HeroTippPanel", () => {
  it("zeigt nichts, wenn es keinen tippbaren Tipp gibt", () => {
    renderWithProviders(<HeroTippPanel tipp={{ status: "keins" }} />);
    expect(screen.queryByTestId("hero-tipp")).not.toBeInTheDocument();
  });

  it("legt einen neuen Tipp an", () => {
    renderWithProviders(<HeroTippPanel tipp={tipp({})} />);
    const panel = screen.getByTestId("hero-tipp");
    expect(panel).toHaveTextContent("Club Africain – ES Tunis");
    fireEvent.click(screen.getByRole("button", { name: /Club Africain.*\+/ }));
    fireEvent.click(screen.getByRole("button", { name: /Club Africain.*\+/ }));
    fireEvent.click(screen.getByRole("button", { name: /ES Tunis.*\+/ }));
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
    expect(creer).toHaveBeenCalledWith(
      { tippspiel: "t1", rencontre: "m1", score_domicile: 2, score_exterieur: 1 },
      expect.any(Object),
    );
  });

  it("ändert einen vorhandenen Tipp erst nach einer Änderung", () => {
    const tip = { id: "tip1", rencontre: "m1", score_domicile: 1, score_exterieur: 2 } as never;
    renderWithProviders(<HeroTippPanel tipp={tipp({ tip })} />);
    const knopf = screen.getByRole("button", { name: /Modifier/ });
    expect(knopf).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /ES Tunis.*−/ }));
    expect(knopf).toBeEnabled();
    fireEvent.click(knopf);
    expect(modifier).toHaveBeenCalledWith(
      { id: "tip1", payload: { score_domicile: 1, score_exterieur: 1 } },
      expect.any(Object),
    );
  });

  it("verweist bei offener Zahlung auf das Tippspiel", async () => {
    renderWithProviders(<HeroTippPanel tipp={tipp({ status: "zum_tippspiel" })} />);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /pronostics/i })).toHaveAttribute("href", "/live"),
    );
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).not.toBeInTheDocument();
  });
});
