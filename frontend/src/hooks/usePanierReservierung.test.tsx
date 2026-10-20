import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as boutiqueApi from "../api/boutique";
import { useAuthStore } from "../store/authStore";
import { usePanierStore } from "../store/panierStore";
import { usePanierReservierung } from "./usePanierReservierung";

vi.mock("../api/boutique", () => ({
  getPanierReservierung: vi.fn(),
  reservierePanier: vi.fn(),
  gibPanierFrei: vi.fn(),
}));

const antwort = (restzeit: number) => ({
  expire_le: restzeit > 0 ? "x" : null,
  restzeit_sekunden: restzeit,
  dauer_minuten: 20,
  zeilen: [{ variante: "v1", reserviert: 1, verfuegbar: 4 }],
});

function artikel() {
  usePanierStore.getState().ajouter({
    varianteId: "v1",
    produitId: "p1",
    nom: "Maillot",
    taille: "M",
    couleur: "",
    prixUnitaire: "45.00",
    stockDisponible: 5,
  });
}

describe("usePanierReservierung", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    usePanierStore.setState({
      articles: [],
      reservierungEndeMs: null,
      erneuerungen: 0,
      maxErneuerungen: 2,
      geleertWegenAblauf: false,
    });
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: "u1" } as never,
    });
    vi.mocked(boutiqueApi.getPanierReservierung).mockResolvedValue(antwort(0) as never);
    vi.mocked(boutiqueApi.reservierePanier).mockResolvedValue(antwort(1200) as never);
    vi.mocked(boutiqueApi.gibPanierFrei).mockResolvedValue(undefined as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: false, user: null });
  });

  it("liest beim Start nur den Stand, ohne zu reservieren", async () => {
    vi.mocked(boutiqueApi.getPanierReservierung).mockResolvedValue(antwort(300) as never);
    renderHook(() => usePanierReservierung());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(boutiqueApi.reservierePanier).not.toHaveBeenCalled();
    const ende = usePanierStore.getState().reservierungEndeMs;
    expect(ende).not.toBeNull();
    expect(ende! - Date.now()).toBeGreaterThan(290_000);
  });

  it("reserviert nach einer Änderung (entprellt) und setzt den Countdown", async () => {
    renderHook(() => usePanierReservierung());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => artikel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(boutiqueApi.reservierePanier).toHaveBeenCalledTimes(1);
    expect(boutiqueApi.reservierePanier).toHaveBeenCalledWith([{ variante: "v1", quantite: 1 }]);
    const ende = usePanierStore.getState().reservierungEndeMs;
    expect(ende! - Date.now()).toBeGreaterThan(1_190_000);
  });

  it("gibt die Reservierung frei, wenn der Warenkorb leer wird", async () => {
    renderHook(() => usePanierReservierung());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => artikel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => usePanierStore.setState({ articles: [] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(boutiqueApi.gibPanierFrei).toHaveBeenCalledTimes(1);
    expect(usePanierStore.getState().reservierungEndeMs).toBeNull();
  });

  it("tut nichts, wenn nicht angemeldet", async () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    renderHook(() => usePanierReservierung());
    act(() => artikel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(boutiqueApi.getPanierReservierung).not.toHaveBeenCalled();
    expect(boutiqueApi.reservierePanier).not.toHaveBeenCalled();
  });

  it("leert den Warenkorb, wenn die Reservierung nach allen Erneuerungen noch einmal abläuft", async () => {
    renderHook(() => usePanierReservierung());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => artikel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => usePanierStore.setState({ erneuerungen: 2 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_201_000);
    });

    const s = usePanierStore.getState();
    expect(s.articles).toEqual([]);
    expect(s.geleertWegenAblauf).toBe(true);
    expect(s.erneuerungen).toBe(0);
  });

  it("lässt den Warenkorb stehen, solange noch Erneuerungen übrig sind", async () => {
    renderHook(() => usePanierReservierung());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => artikel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    act(() => usePanierStore.setState({ erneuerungen: 1 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_201_000);
    });

    expect(usePanierStore.getState().articles).toHaveLength(1);
    expect(usePanierStore.getState().geleertWegenAblauf).toBe(false);
  });

  it("zählt eine Änderung nach abgelaufener Reservierung als Erneuerung", async () => {
    renderHook(() => usePanierReservierung());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    act(() => artikel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(usePanierStore.getState().erneuerungen).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_201_000);
    });
    act(() => usePanierStore.getState().changerQuantite("v1", 2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(usePanierStore.getState().erneuerungen).toBe(1);
  });

  it("leert beim Start, wenn die Reservierung schon abgelaufen war und nichts mehr übrig ist", async () => {
    artikel();
    usePanierStore.setState({ reservierungEndeMs: Date.now() - 60_000, erneuerungen: 2 });
    vi.mocked(boutiqueApi.getPanierReservierung).mockResolvedValue({
      ...antwort(0),
      max_erneuerungen: 2,
    } as never);

    renderHook(() => usePanierReservierung());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(usePanierStore.getState().articles).toEqual([]);
    expect(usePanierStore.getState().geleertWegenAblauf).toBe(true);
  });
});
