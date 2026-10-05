import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AnimatedNumber from "./AnimatedNumber";

describe("AnimatedNumber", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("affiche directement la valeur finale sans matchMedia (jsdom)", () => {
    render(<AnimatedNumber value={1251} format={(n) => `${n} €`} />);
    expect(screen.getByText("1251 €")).toBeInTheDocument();
  });

  it("affiche directement la valeur finale quand le mouvement réduit est demandé", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<AnimatedNumber value={37} />);
    expect(screen.getByText("37")).toBeInTheDocument();
  });

  it("compte de 0 jusqu'à la valeur quand les animations sont autorisées", () => {
    const file: FrameRequestCallback[] = [];
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      file.push(cb);
      return file.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockReturnValue(0);

    render(<AnimatedNumber value={100} format={(n) => `n=${n}`} duration={1000} />);
    expect(screen.getByText("n=0")).toBeInTheDocument();

    act(() => {
      file.shift()?.(1000);
    });
    expect(screen.getByText("n=100")).toBeInTheDocument();
  });
});
