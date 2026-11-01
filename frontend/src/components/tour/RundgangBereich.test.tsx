import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHilfeStore } from "../../store/hilfeStore";
import { useAuthStore, type CidUser } from "../../store/authStore";
import { useTourStore } from "../../store/tourStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import RundgangBereich from "./RundgangBereich";

const hoch = vi.hoisted(() => ({
  speichern: vi.fn(),
  verfuegbar: ["app"] as ("app" | "verwaltung")[],
}));

vi.mock("../../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/auth")>()),
  speicherePraeferenzen: hoch.speichern,
}));
vi.mock("../../hooks/useTourStationen", () => ({
  useTourStationen: () => ({ app: [], verwaltung: [], verfuegbar: hoch.verfuegbar, bereit: true }),
}));

describe("RundgangBereich", () => {
  beforeEach(() => {
    hoch.speichern.mockReset();
    hoch.speichern.mockImplementation(async (p) => ({ ...useAuthStore.getState().user, ...p }));
    hoch.verfuegbar = ["app"];
    useTourStore.setState({ lauf: null, willkommenVerborgen: false });
    useHilfeStore.setState({ offen: true, cle: "rundgang", minimiert: false });
    const user: CidUser = {
      id: "u1",
      email: "anna@example.org",
      role: "membre",
      langue_preferee: "de",
      ui_praeferenzen: { tour: { status: "nie_mehr", hinweise: ["reisen"], hinweise_aus: true } },
    };
    useAuthStore.setState({ user, isAuthenticated: true });
  });

  it("startet den App-Rundgang erneut und schließt dabei die Hilfe", () => {
    renderWithProviders(<RundgangBereich />);
    expect(screen.queryByText("hilfe.verwaltung")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("hilfe.app"));
    expect(useTourStore.getState().lauf).toEqual({ art: "app", schritt: 0 });
    expect(useHilfeStore.getState().offen).toBe(false);
  });

  it("bietet den Verwaltungs-Rundgang nur Konten mit Verwaltungs-Einträgen an", () => {
    hoch.verfuegbar = ["app", "verwaltung"];
    renderWithProviders(<RundgangBereich />);
    fireEvent.click(screen.getByText("hilfe.verwaltung"));
    expect(useTourStore.getState().lauf).toEqual({ art: "verwaltung", schritt: 0 });
  });

  it("blendet die Seitenhinweise wieder ein", async () => {
    renderWithProviders(<RundgangBereich />);
    fireEvent.click(screen.getByText("hilfe.hinweise"));
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(hoch.speichern.mock.calls[0][0].ui_praeferenzen.tour).toMatchObject({
      hinweise: [],
      hinweise_aus: false,
      status: "nie_mehr",
    });
  });

  it("verweist auf die Aufgabenkarten", () => {
    renderWithProviders(<RundgangBereich />);
    expect(screen.getByText("hilfe.karten")).toHaveAttribute("href", "/hilfe/karten");
  });
});
