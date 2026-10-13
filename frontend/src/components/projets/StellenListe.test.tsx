import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useProjets";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { ProjetStelle } from "../../types/projets";
import StellenListe from "./StellenListe";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useProjets");
  return {
    ...actual,
    useStellen: vi.fn(),
    useStelleBewerben: vi.fn(),
    useStelleZurueckziehen: vi.fn(),
  };
});

const bewerben = vi.fn();
const zurueckziehen = vi.fn();

function stelle(overrides: Partial<ProjetStelle> = {}): ProjetStelle {
  return {
    id: "s1",
    projet: "p1",
    titel: "Web-Designer",
    beschreibung: "",
    faehigkeit: null,
    faehigkeit_name: null,
    anzahl: 1,
    status: "offen",
    angenommen: 0,
    freie_plaetze: 1,
    meine_bewerbung: null,
    created_at: "2026-10-01T10:00:00Z",
    ...overrides,
  } as ProjetStelle;
}

function setze(stellen: ProjetStelle[]) {
  vi.mocked(hooks.useStellen).mockReturnValue({
    data: stellen,
  } as unknown as ReturnType<typeof hooks.useStellen>);
}

describe("StellenListe", () => {
  beforeEach(() => {
    bewerben.mockReset();
    zurueckziehen.mockReset();
    vi.mocked(hooks.useStelleBewerben).mockReturnValue({
      mutate: bewerben,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useStelleBewerben>);
    vi.mocked(hooks.useStelleZurueckziehen).mockReturnValue({
      mutate: zurueckziehen,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useStelleZurueckziehen>);
    useAuthStore.setState({ isAuthenticated: true });
  });

  it("zeigt nichts, wenn keine offene Stelle existiert", () => {
    setze([stelle({ status: "geschlossen" })]);
    renderWithProviders(<StellenListe projetId="p1" />);
    expect(screen.queryByTestId("projekt-stellen")).not.toBeInTheDocument();
  });

  it("sendet die Meldung mit Nachricht", () => {
    setze([stelle()]);
    renderWithProviders(<StellenListe projetId="p1" />);
    expect(screen.getByText("Web-Designer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stellen\.helfen/ }));
    fireEvent.change(screen.getByLabelText("stellen.nachricht_label"), {
      target: { value: "Ich kann das" },
    });
    fireEvent.click(screen.getByRole("button", { name: "stellen.senden" }));
    expect(bewerben).toHaveBeenCalledWith(
      { id: "s1", nachricht: "Ich kann das" },
      expect.any(Object),
    );
  });

  it("erlaubt das Zurückziehen einer offenen Meldung", () => {
    setze([stelle({ meine_bewerbung: "offen" })]);
    renderWithProviders(<StellenListe projetId="p1" />);
    expect(screen.queryByRole("button", { name: /stellen\.helfen/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "stellen.zurueckziehen" }));
    expect(zurueckziehen).toHaveBeenCalledWith("s1");
  });

  it("leitet anonyme Besucher zur Anmeldung", () => {
    useAuthStore.setState({ isAuthenticated: false });
    setze([stelle()]);
    renderWithProviders(<StellenListe projetId="p1" />);
    expect(screen.getByRole("link", { name: "stellen.login" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: /stellen\.helfen/ })).not.toBeInTheDocument();
  });
});
