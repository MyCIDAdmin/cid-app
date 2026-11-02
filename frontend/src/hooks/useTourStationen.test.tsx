import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useNotificationsHooks from "./useNotifications";
import * as useRbacHooks from "./useRbac";
import { useAuthStore, type CidUser } from "../store/authStore";
import { GRUPPEN_RUNDGAENGE } from "../utils/tour";
import { useTourStationen } from "./useTourStationen";

vi.mock("./useNotifications", async () => {
  const actual = await vi.importActual<typeof useNotificationsHooks>("./useNotifications");
  return {
    ...actual,
    useNotificationsNonLues: () => ({ data: { results: [] } }),
    useMarquerLuesPrefixe: () => ({ mutate: vi.fn() }),
  };
});
vi.mock("./useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("./useRbac");
  return { ...actual, useMesAcces: vi.fn(), useVisibiliteEffective: vi.fn() };
});

function setze(role: CidUser["role"], extra: Partial<CidUser> = {}, ausgeblendet: string[] = []) {
  useAuthStore.setState({
    user: { id: "u1", email: "a@b.de", role, langue_preferee: "de", ...extra },
    isAuthenticated: true,
  });
  vi.mocked(useRbacHooks.useMesAcces).mockReturnValue({
    data: {},
    isLoading: false,
  } as unknown as ReturnType<typeof useRbacHooks.useMesAcces>);
  vi.mocked(useRbacHooks.useVisibiliteEffective).mockReturnValue({
    data: Object.fromEntries(ausgeblendet.map((m) => [m, false])),
    isLoading: false,
  } as unknown as ReturnType<typeof useRbacHooks.useVisibiliteEffective>);
}

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe("useTourStationen : Gruppen-Rundgänge", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it("App Admin : alle Gruppen und Verwaltungs-Untergruppen, Seiten in Menü-Reihenfolge", () => {
    setze("super_admin");
    const { result } = renderHook(() => useTourStationen(), { wrapper });
    expect(Object.keys(result.current.gruppen).sort()).toEqual([...GRUPPEN_RUNDGAENGE].sort());
    expect(result.current.gruppen.g_communaute?.map((s) => s.id)).toEqual([
      "fil",
      "forum",
      "chats",
      "live",
    ]);
    expect(result.current.gruppen.u_finanzen?.[0]).toMatchObject({
      id: "finanzen",
      gruppe: "administration",
      subgruppe: "finanzen",
    });
  });

  it("Mitglied : keine Verwaltungsgruppen, ausgeblendete Module fehlen", () => {
    setze("membre", {}, ["forum", "quiz"]);
    const { result } = renderHook(() => useTourStationen(), { wrapper });
    const g = result.current.gruppen;
    expect(g.g_communaute?.map((s) => s.id)).toEqual(["fil", "chats", "live"]);
    expect(g.g_contenu?.map((s) => s.id)).toEqual(["albums", "abstimmungen", "wahlen"]);
    expect(Object.keys(g).some((k) => k.startsWith("u_"))).toBe(false);
  });

  it("Gruppe ohne sichtbare Module entfällt", () => {
    setze("membre", {}, ["albums", "quiz", "vote"]);
    const { result } = renderHook(() => useTourStationen(), { wrapper });
    expect(result.current.gruppen.g_contenu).toBeUndefined();
  });
});
