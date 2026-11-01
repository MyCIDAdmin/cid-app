import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore, type CidUser } from "../../store/authStore";
import { useTourStore } from "../../store/tourStore";
import { useUiStore } from "../../store/uiStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import { morgenIso, type TourPraeferenz, type TourStation } from "../../utils/tour";
import TourHost from "./TourHost";

const hoch = vi.hoisted(() => ({
  speichern: vi.fn(),
  stationen: {
    app: [] as TourStation[],
    verwaltung: [] as TourStation[],
    verfuegbar: ["app"] as ("app" | "verwaltung")[],
    bereit: true,
  },
}));

vi.mock("../../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/auth")>()),
  speicherePraeferenzen: hoch.speichern,
}));
vi.mock("../../hooks/useTourStationen", () => ({ useTourStationen: () => hoch.stationen }));

const APP: TourStation[] = [
  { id: "start", ziel: "/" },
  { id: "dashboard", ziel: "/dashboard" },
  { id: "hilfe", ziel: "hilfe" },
];
const VERWALTUNG: TourStation[] = [
  { id: "v_bereich", ziel: "gruppe-administration", gruppe: "administration" },
  { id: "v_mitglieder", ziel: "/inscriptions", gruppe: "administration", subgruppe: "mitglieder" },
  { id: "v_hilfe", ziel: "hilfe" },
];

function melde(tour?: TourPraeferenz, extra: Partial<CidUser> = {}) {
  const user: CidUser = {
    id: "u1",
    email: "anna@example.org",
    role: "membre",
    langue_preferee: "de",
    prenom: "Anna",
    ui_praeferenzen: tour ? { tour } : {},
    ...extra,
  };
  useAuthStore.setState({ user, isAuthenticated: true });
}

function gespeichert(): TourPraeferenz {
  const aufrufe = hoch.speichern.mock.calls;
  return aufrufe[aufrufe.length - 1][0].ui_praeferenzen.tour;
}

function rendern(onTiroir = vi.fn()) {
  renderWithProviders(<TourHost onTiroir={onTiroir} />);
  return onTiroir;
}

describe("TourHost", () => {
  beforeEach(() => {
    hoch.speichern.mockReset();
    hoch.speichern.mockImplementation(async (p) => ({ ...useAuthStore.getState().user, ...p }));
    hoch.stationen.app = APP;
    hoch.stationen.verwaltung = [];
    hoch.stationen.verfuegbar = ["app"];
    hoch.stationen.bereit = true;
    useTourStore.setState({ lauf: null, willkommenVerborgen: false });
    useUiStore.setState({
      sidebarCollapsed: false,
      collapsedGroups: { general: false, communaute: false, contenu: false, administration: true },
    });
    document.body.innerHTML = "";
  });

  it("zeigt Mitgliedern beim ersten Login das Willkommensfenster, nichts startet von selbst", () => {
    melde();
    rendern();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("willkommen.titel_name")).toBeInTheDocument();
    expect(screen.getByText("willkommen.start_kurz")).toBeInTheDocument();
    expect(useTourStore.getState().lauf).toBeNull();
  });

  it("Fans bekommen den Fan-Text", () => {
    melde(undefined, { ist_fan: true });
    rendern();
    expect(screen.getByText("willkommen.titel_fan")).toBeInTheDocument();
  });

  it("zeigt nichts, wenn der Rundgang schon abgeschlossen oder „Später“ noch aktiv ist", () => {
    melde({ status: "abgeschlossen" });
    const { unmount } = renderWithProviders(<TourHost onTiroir={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();
    melde({ spaeter_bis: "2999-01-01" });
    renderWithProviders(<TourHost onTiroir={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("wartet, bis die Zugriffsrechte der Verwaltung geladen sind", () => {
    melde();
    hoch.stationen.bereit = false;
    rendern();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("„Später erinnern“ schließt das Fenster und merkt sich den nächsten Tag", async () => {
    melde();
    rendern();
    fireEvent.click(screen.getByText("willkommen.spaeter"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(gespeichert()).toMatchObject({ spaeter_bis: morgenIso(new Date()), version: 1 });
  });

  it("„Nicht mehr anzeigen“ merkt beide Rundgänge als nie_mehr", async () => {
    melde();
    rendern();
    fireEvent.click(screen.getByText("willkommen.nie"));
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(gespeichert()).toMatchObject({ status: "nie_mehr", verwaltung_status: "nie_mehr" });
  });

  it("Escape im Willkommensfenster bedeutet „Später“", async () => {
    melde();
    rendern();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(gespeichert().spaeter_bis).toBe(morgenIso(new Date()));
  });

  it("führt durch alle Stationen und merkt den Abschluss", async () => {
    melde();
    rendern();
    fireEvent.click(screen.getByText("willkommen.start_kurz"));
    expect(screen.getByRole("dialog", { name: "karte.dialog" })).toBeInTheDocument();
    expect(screen.getByText("stationen.start.titel")).toBeInTheDocument();
    expect(screen.queryByText("karte.zurueck")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("karte.weiter"));
    expect(screen.getByText("stationen.dashboard.titel")).toBeInTheDocument();
    fireEvent.click(screen.getByText("karte.zurueck"));
    expect(screen.getByText("stationen.start.titel")).toBeInTheDocument();
    fireEvent.click(screen.getByText("karte.weiter"));
    fireEvent.click(screen.getByText("karte.weiter"));
    expect(screen.getByText("stationen.hilfe.titel")).toBeInTheDocument();

    fireEvent.click(screen.getByText("karte.fertig"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(gespeichert().status).toBe("abgeschlossen");
  });

  it("Pfeiltasten wechseln die Station", () => {
    melde();
    rendern();
    fireEvent.click(screen.getByText("willkommen.start_kurz"));
    const karte = screen.getByRole("dialog", { name: "karte.dialog" });
    fireEvent.keyDown(karte, { key: "ArrowRight" });
    expect(screen.getByText("stationen.dashboard.titel")).toBeInTheDocument();
    fireEvent.keyDown(karte, { key: "ArrowLeft" });
    expect(screen.getByText("stationen.start.titel")).toBeInTheDocument();
  });

  it("lässt sich jederzeit überspringen : Link, Kreuz und Escape", async () => {
    for (const aktion of ["link", "kreuz", "escape"] as const) {
      hoch.speichern.mockClear();
      melde();
      useTourStore.setState({ lauf: null, willkommenVerborgen: false });
      const { unmount } = renderWithProviders(<TourHost onTiroir={vi.fn()} />);
      fireEvent.click(screen.getByText("willkommen.start_kurz"));
      fireEvent.click(screen.getByText("karte.weiter"));
      if (aktion === "link") fireEvent.click(screen.getByText("karte.ueberspringen"));
      if (aktion === "kreuz") fireEvent.click(screen.getByLabelText("karte.schliessen"));
      if (aktion === "escape") fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
      expect(gespeichert().status).toBe("uebersprungen");
      expect(useTourStore.getState().lauf).toBeNull();
      unmount();
    }
  });

  it("hebt das Ziel mit einem Ring hervor, ohne etwas abzudunkeln", () => {
    melde();
    const ziel = document.createElement("a");
    ziel.setAttribute("data-tour", "/");
    ziel.getClientRects = () => [{}] as unknown as DOMRectList;
    ziel.getBoundingClientRect = () => ({ x: 10, y: 20, width: 100, height: 30 }) as DOMRect;
    document.body.appendChild(ziel);
    rendern();
    fireEvent.click(screen.getByText("willkommen.start_kurz"));
    const ring = screen.getByTestId("tour-ring");
    expect(ring).toHaveStyle({ left: "6px", top: "16px", width: "108px", height: "38px" });
    expect(ring).toHaveAttribute("aria-hidden", "true");
    // Station „hilfe“ ohne sichtbares Ziel : Karte bleibt, Ring entfällt.
    fireEvent.click(screen.getByText("karte.weiter"));
    fireEvent.click(screen.getByText("karte.weiter"));
    expect(screen.getByText("stationen.hilfe.titel")).toBeInTheDocument();
    expect(screen.queryByTestId("tour-ring")).not.toBeInTheDocument();
  });

  it("Handy : öffnet das Menü für Menüpunkte, schließt es bei Hilfe und am Ende", () => {
    melde();
    const alt = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: false, media: q })) as typeof window.matchMedia;
    try {
      const onTiroir = rendern();
      fireEvent.click(screen.getByText("willkommen.start_kurz"));
      expect(onTiroir).toHaveBeenLastCalledWith(true);
      fireEvent.click(screen.getByText("karte.weiter"));
      fireEvent.click(screen.getByText("karte.weiter"));
      expect(onTiroir).toHaveBeenLastCalledWith(false);
      fireEvent.click(screen.getByText("karte.fertig"));
      expect(onTiroir).toHaveBeenLastCalledWith(false);
    } finally {
      window.matchMedia = alt;
    }
  });

  it("Desktop : klappt die Verwaltung für die Tour auf und danach wieder zu", () => {
    melde({ status: "abgeschlossen" }, { role: "bureau_admin" });
    hoch.stationen.verwaltung = VERWALTUNG;
    hoch.stationen.verfuegbar = ["app", "verwaltung"];
    rendern();
    expect(screen.getByText("willkommen.start_verwaltung")).toBeInTheDocument();
    expect(useUiStore.getState().collapsedGroups.administration).toBe(true);

    fireEvent.click(screen.getByText("willkommen.start_verwaltung"));
    expect(useUiStore.getState().collapsedGroups.administration).toBe(false);
    fireEvent.click(screen.getByLabelText("karte.schliessen"));
    expect(useUiStore.getState().collapsedGroups.administration).toBe(true);
  });

  it("Verwaltungskonto : beide Wege, danach wird der zweite erneut angeboten", async () => {
    melde(undefined, { role: "bureau_admin" });
    hoch.stationen.verwaltung = VERWALTUNG;
    hoch.stationen.verfuegbar = ["app", "verwaltung"];
    rendern();
    expect(screen.getByText("willkommen.start_app")).toBeInTheDocument();
    expect(screen.getByText("willkommen.start_verwaltung")).toBeInTheDocument();

    fireEvent.click(screen.getByText("willkommen.start_app"));
    fireEvent.click(screen.getByText("karte.weiter"));
    fireEvent.click(screen.getByText("karte.weiter"));
    fireEvent.click(screen.getByText("karte.fertig"));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.queryByText("willkommen.start_app")).not.toBeInTheDocument();
    expect(screen.getByText("willkommen.start_verwaltung")).toBeInTheDocument();
    expect(gespeichert().status).toBe("abgeschlossen");
  });

  it("Überspringen beendet auch den noch offenen zweiten Rundgang", async () => {
    melde(undefined, { role: "bureau_admin" });
    hoch.stationen.verwaltung = VERWALTUNG;
    hoch.stationen.verfuegbar = ["app", "verwaltung"];
    rendern();
    fireEvent.click(screen.getByText("willkommen.start_app"));
    fireEvent.click(screen.getByText("karte.ueberspringen"));
    await waitFor(() => expect(hoch.speichern).toHaveBeenCalled());
    expect(gespeichert()).toMatchObject({
      status: "uebersprungen",
      verwaltung_status: "uebersprungen",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
