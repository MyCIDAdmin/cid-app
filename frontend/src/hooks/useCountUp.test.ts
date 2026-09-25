import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountUp } from "./useCountUp";

describe("useCountUp", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("affiche la valeur cible immédiatement au premier rendu, sans animation", () => {
    const { result } = renderHook(() => useCountUp(312));
    expect(result.current).toBe(312);
  });

  it("laisse passer telle quelle une valeur non numérique (ex. chargement en cours)", () => {
    const { result, rerender } = renderHook(({ v }: { v: number | string }) => useCountUp(v as never), {
      initialProps: { v: "—" },
    });
    expect(result.current).toBe("—");
    rerender({ v: "—" });
    expect(result.current).toBe("—");
  });

  it("anime progressivement d'une ancienne valeur numérique vers la nouvelle", () => {
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), { initialProps: { v: 10 } });
    expect(result.current).toBe(10);

    act(() => {
      rerender({ v: 50 });
    });
    // La transition démarre : la valeur affichée n'a pas encore atteint la cible au frame suivant.
    expect(result.current).not.toBe(50);
    expect(result.current).toBeGreaterThanOrEqual(10);
  });

  it("affiche la cible sans animation quand prefers-reduced-motion est actif", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn() }),
    );
    const { result, rerender } = renderHook(({ v }) => useCountUp(v), { initialProps: { v: 10 } });
    rerender({ v: 50 });
    expect(result.current).toBe(50);
  });
});
