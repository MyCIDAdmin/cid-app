import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useStartseite";
import { useAuthStore, type CidUser } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import WirSindClubistes from "./WirSindClubistes";

vi.mock("../../hooks/useStartseite", () => ({ useGemeinschaft: vi.fn() }));

const DATEN = {
  mitglieder: 225,
  bundeslaender: 14,
  staedte: 31,
  neu_im_monat: 12,
  monat: "2026-10",
  neu_dabei: [
    { id: "1", vorname: "Amine", initial: "K.", sektor: "München" },
    { id: "2", vorname: "Sonia", initial: "B.", sektor: "" },
  ],
};

function setze(daten: unknown, ist_fan = false) {
  vi.mocked(hooks.useGemeinschaft).mockReturnValue({ data: daten } as unknown as ReturnType<
    typeof hooks.useGemeinschaft
  >);
  useAuthStore.setState({ user: { id: "u", role: "membre", ist_fan } as unknown as CidUser });
}

describe("WirSindClubistes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt die Zahlen und die Freiwilligen unter „Neu dabei“", () => {
    setze(DATEN);
    renderWithProviders(<WirSindClubistes />);
    expect(screen.getByText("225")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText(/Amine K\./)).toBeInTheDocument();
    expect(screen.getByText("München")).toBeInTheDocument();
    expect(screen.getByText(/Sonia B\./)).toBeInTheDocument();
  });

  it("verweist auf die Einstellung, wenn sich niemand zeigt", () => {
    setze({ ...DATEN, neu_dabei: [] });
    renderWithProviders(<WirSindClubistes />);
    expect(screen.getByText("startseite.zahlen.niemand")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "startseite.zahlen.einstellung" })).toHaveAttribute(
      "href",
      "/mon-profil?onglet=einstellungen",
    );
  });

  it("zeigt Fan-Konten nur die Zahlen, ohne „Neu dabei“", () => {
    setze(DATEN, true);
    renderWithProviders(<WirSindClubistes />);
    expect(screen.getByText("225")).toBeInTheDocument();
    expect(screen.queryByText(/Amine/)).not.toBeInTheDocument();
    expect(screen.queryByText("startseite.zahlen.neu_dabei")).not.toBeInTheDocument();
  });

  it("zeigt nichts, solange die Daten fehlen", () => {
    setze(undefined);
    const { container } = renderWithProviders(<WirSindClubistes />);
    expect(container).toBeEmptyDOMElement();
  });
});
