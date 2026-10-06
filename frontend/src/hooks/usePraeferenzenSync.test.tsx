import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../api/auth";
import i18n from "../i18n";
import { useAuthStore, type CidUser } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import usePraeferenzenSync from "./usePraeferenzenSync";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof import("../api/auth")>("../api/auth");
  return { ...actual, speicherePraeferenzen: vi.fn() };
});

const basis: CidUser = {
  id: "u1",
  email: "a@example.de",
  role: "membre",
  langue_preferee: "fr",
};

describe("usePraeferenzenSync", () => {
  const changeLanguageOriginal = i18n.changeLanguage.bind(i18n);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    i18n.language = "fr";
    i18n.changeLanguage = vi.fn((lng: string) => {
      i18n.language = lng;
      i18n.emit("languageChanged", lng);
      return Promise.resolve(i18n.t.bind(i18n));
    }) as typeof i18n.changeLanguage;
    useUiStore.setState({ theme: "light", sidebarCollapsed: true });
    document.documentElement.classList.remove("dark");
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
    vi.mocked(authApi.speicherePraeferenzen).mockImplementation(async (payload) => ({
      ...basis,
      ...payload,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    i18n.changeLanguage = changeLanguageOriginal;
    i18n.language = "fr";
  });

  it("wendet gespeicherte Präferenzen bei der Anmeldung an", () => {
    renderHook(() => usePraeferenzenSync());

    act(() => {
      useAuthStore.setState({
        user: {
          ...basis,
          langue_preferee: "de",
          ui_praeferenzen: { theme: "dark", sidebar_collapsed: false },
        },
      });
    });

    expect(i18n.language).toBe("de");
    expect(useUiStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(authApi.speicherePraeferenzen).not.toHaveBeenCalled();
  });

  it("speichert die lokalen Werte einmalig, wenn das Konto noch keine Präferenzen hat", async () => {
    i18n.language = "de";
    renderHook(() => usePraeferenzenSync());

    await act(async () => {
      useAuthStore.setState({ user: { ...basis, ui_praeferenzen: {} } });
    });

    expect(authApi.speicherePraeferenzen).toHaveBeenCalledWith({
      langue_preferee: "de",
      ui_praeferenzen: { theme: "light", sidebar_collapsed: true },
    });
  });

  it("speichert Änderungen entprellt am Konto", async () => {
    useAuthStore.setState({
      user: {
        ...basis,
        ui_praeferenzen: { theme: "light", sidebar_collapsed: true },
      },
    });
    renderHook(() => usePraeferenzenSync());
    expect(authApi.speicherePraeferenzen).not.toHaveBeenCalled();

    act(() => {
      useUiStore.getState().setTheme("dark");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(authApi.speicherePraeferenzen).toHaveBeenCalledTimes(1);
    expect(authApi.speicherePraeferenzen).toHaveBeenCalledWith({
      langue_preferee: "fr",
      ui_praeferenzen: { theme: "dark", sidebar_collapsed: true },
    });
    expect(useAuthStore.getState().user?.ui_praeferenzen?.theme).toBe("dark");
  });

  it("speichert nichts ohne angemeldeten Benutzer", async () => {
    renderHook(() => usePraeferenzenSync());

    act(() => {
      useUiStore.getState().setTheme("dark");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(authApi.speicherePraeferenzen).not.toHaveBeenCalled();
  });
});
