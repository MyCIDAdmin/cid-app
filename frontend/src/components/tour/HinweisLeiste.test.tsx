import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore, type CidUser } from "../../store/authStore";
import { useTourStore } from "../../store/tourStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { TourPraeferenz } from "../../utils/tour";
import HinweisLeiste from "./HinweisLeiste";

const hoch = vi.hoisted(() => ({ speichern: vi.fn() }));

vi.mock("../../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/auth")>()),
  speicherePraeferenzen: hoch.speichern,
}));
vi.mock("../../hooks/useTourStationen", () => ({
  useTourStationen: () => ({
    app: [],
    verwaltung: [],
    gruppen: {},
    verfuegbar: ["app"],
    bereit: true,
  }),
}));

function melde(tour?: TourPraeferenz) {
  const user: CidUser = {
    id: "u1",
    email: "anna@example.org",
    role: "membre",
    langue_preferee: "de",
    // Standard : Rundgang bereits beantwortet, damit kein Willkommensfenster dazwischenfunkt.
    ui_praeferenzen: { tour: { status: "abgeschlossen", ...tour } },
  };
  useAuthStore.setState({ user, isAuthenticated: true });
}

function rendern(route: string) {
  renderWithProviders(<HinweisLeiste />, { route, path: route });
}

describe("HinweisLeiste", () => {
  beforeEach(() => {
    hoch.speichern.mockReset();
    hoch.speichern.mockImplementation(async (p) => ({ ...useAuthStore.getState().user, ...p }));
    useTourStore.setState({ lauf: null, willkommenVerborgen: false });
  });

  it("zeigt den Hinweis beim ersten Besuch der Seite", () => {
    melde();
    rendern("/reisen");
    expect(screen.getByRole("complementary", { name: "hinweis.label" })).toBeInTheDocument();
    expect(screen.getByText("hinweise.reisen.titel")).toBeInTheDocument();
  });

  it("bleibt auf Seiten ohne Hinweis weg", () => {
    melde();
    rendern("/boutique/panier");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("zeigt auch auf Übersicht, Boutique und Verwaltungsseiten einen Tipp", () => {
    melde();
    rendern("/boutique");
    expect(screen.getByText("hinweise.boutique.titel")).toBeInTheDocument();
  });

  it("Chats haben keine Leiste (Seite mit fester Höhe)", () => {
    melde();
    rendern("/chats");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("„Verstanden“ blendet genau diesen Hinweis dauerhaft aus", async () => {
    melde({ hinweise: ["albums"] });
    rendern("/reisen");
    fireEvent.click(screen.getByText("hinweis.verstanden"));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(hoch.speichern.mock.calls[0][0].ui_praeferenzen.tour.hinweise).toEqual([
      "albums",
      "reisen",
    ]);
  });

  it("„Alle Tipps ausblenden“ schaltet alle Hinweise ab", async () => {
    melde();
    rendern("/reisen");
    fireEvent.click(screen.getByText("hinweis.alle_aus"));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(hoch.speichern.mock.calls[0][0].ui_praeferenzen.tour.hinweise_aus).toBe(true);
  });

  it("zeigt bereits bestätigte oder abgeschaltete Hinweise nicht", () => {
    melde({ hinweise: ["reisen"] });
    rendern("/reisen");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("wartet, solange das Willkommensfenster offen ist oder ein Rundgang läuft", () => {
    melde({ status: "offen" });
    rendern("/reisen");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("erscheint nach „Später“ wieder, auch wenn der Rundgang noch offen ist", () => {
    melde({ status: "offen", spaeter_bis: "2999-01-01" });
    rendern("/reisen");
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("verschwindet während eines Rundgangs", () => {
    melde();
    useTourStore.setState({ lauf: { art: "app", schritt: 0 } });
    rendern("/reisen");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
