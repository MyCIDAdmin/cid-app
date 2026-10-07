import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Angebot } from "../../types/partner";
import AngebotsvergleichPage from "./AngebotsvergleichPage";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return {
    ...actual,
    useZiele: vi.fn(),
    useAngebote: vi.fn(),
    useAngebotAktion: vi.fn(),
    useLoescheAngebot: vi.fn(),
    useCreerAngebot: vi.fn(),
    usePartnerListe: vi.fn(),
    usePartner: vi.fn(),
  };
});

function angebot(extra: Partial<Angebot>): Angebot {
  return {
    id: "a1",
    projet: "pr1",
    partner: "p1",
    partner_name: "Druckerei Meier",
    partner_note: 4,
    betrag: "480.00",
    gueltig_bis: null,
    beschreibung: "",
    dokument: null,
    dokument_url: null,
    status: "offen",
    created_at: "2026-10-01T10:00:00Z",
    ...extra,
  };
}

function mutation() {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null };
}

function setzeRolle(role: "rh" | "bureau_admin") {
  useAuthStore.setState({
    accessToken: "a",
    refreshToken: "r",
    isAuthenticated: true,
    user: { id: "u", email: "u@example.com", role, langue_preferee: "de" },
  });
}

describe("AngebotsvergleichPage", () => {
  const aktion = mutation();
  const anlegen = mutation();

  beforeEach(() => {
    aktion.mutate.mockClear();
    anlegen.mutate.mockClear();
    vi.mocked(usePartnerHooks.useZiele).mockReturnValue({
      data: [{ id: "pr1", label: "Festschrift" }],
    } as unknown as ReturnType<typeof usePartnerHooks.useZiele>);
    vi.mocked(usePartnerHooks.useAngebote).mockReturnValue({
      data: [
        angebot({}),
        angebot({ id: "a2", partner: "p2", partner_name: "Copy Shop", betrag: "610.00" }),
      ],
    } as unknown as ReturnType<typeof usePartnerHooks.useAngebote>);
    vi.mocked(usePartnerHooks.useAngebotAktion).mockReturnValue(
      aktion as unknown as ReturnType<typeof usePartnerHooks.useAngebotAktion>,
    );
    vi.mocked(usePartnerHooks.useLoescheAngebot).mockReturnValue(
      mutation() as unknown as ReturnType<typeof usePartnerHooks.useLoescheAngebot>,
    );
    vi.mocked(usePartnerHooks.useCreerAngebot).mockReturnValue(
      anlegen as unknown as ReturnType<typeof usePartnerHooks.useCreerAngebot>,
    );
    vi.mocked(usePartnerHooks.usePartnerListe).mockReturnValue({
      data: [{ id: "p1", nom: "Druckerei Meier" }],
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerListe>);
    vi.mocked(usePartnerHooks.usePartner).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof usePartnerHooks.usePartner>);
    setzeRolle("bureau_admin");
  });

  function waehleProjekt() {
    renderWithProviders(<AngebotsvergleichPage />);
    fireEvent.change(screen.getByLabelText("ziel_projet"), { target: { value: "pr1" } });
  }

  it("zeigt Angebote mit Differenz zum günstigsten", () => {
    waehleProjekt();
    expect(screen.getByRole("link", { name: "Druckerei Meier" })).toHaveAttribute(
      "href",
      "/admin/partner/p1",
    );
    expect(screen.getByText("angebot_guenstigster")).toBeInTheDocument();
    expect(screen.getByText(/\+.*130/)).toBeInTheDocument();
  });

  it("erteilt den Zuschlag", () => {
    waehleProjekt();
    fireEvent.click(screen.getAllByRole("button", { name: "angebot_zuschlag_fuer" })[0]);
    expect(aktion.mutate).toHaveBeenCalledWith({ id: "a1", aktion: "zuschlag" });
  });

  it("legt ein Angebot an", () => {
    waehleProjekt();
    fireEvent.change(screen.getByLabelText("angebot_partner"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("angebot_betrag"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "angebot_speichern" }));
    expect(anlegen.mutate).toHaveBeenCalledWith(
      {
        projet: "pr1",
        partner: "p1",
        betrag: "500",
        gueltig_bis: null,
        beschreibung: "",
        dokument: null,
      },
      expect.anything(),
    );
  });

  it("ist für RH nur lesbar", () => {
    setzeRolle("rh");
    waehleProjekt();
    expect(screen.queryByRole("button", { name: "angebot_zuschlag_fuer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "angebot_speichern" })).not.toBeInTheDocument();
  });
});
