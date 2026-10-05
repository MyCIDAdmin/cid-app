import { afterEach, describe, expect, it, vi } from "vitest";

import { initGlassPointer } from "./glassPointer";

function stubMatchMedia(reducedMotion: boolean, coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion") ? reducedMotion : query.includes("coarse") ? coarse : false,
  }));
}

describe("initGlassPointer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("ne fait rien sans matchMedia", () => {
    const nettoyer = initGlassPointer();
    expect(typeof nettoyer).toBe("function");
    nettoyer();
  });

  it("n'écoute pas la souris quand le mouvement réduit est demandé", () => {
    stubMatchMedia(true, false);
    const spy = vi.spyOn(document, "addEventListener");
    initGlassPointer()();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("écrit --mx/--my sur la carte survolée", () => {
    stubMatchMedia(false, false);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    document.body.innerHTML = '<div class="rounded-cid-lg bg-bg-primary shadow-sm" id="carte"><span id="enfant">x</span></div>';
    const carte = document.getElementById("carte") as HTMLElement;
    vi.spyOn(carte, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20 } as DOMRect);

    const nettoyer = initGlassPointer();
    document.getElementById("enfant")!.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 50, clientY: 70 }),
    );

    expect(carte.style.getPropertyValue("--mx")).toBe("40px");
    expect(carte.style.getPropertyValue("--my")).toBe("50px");
    nettoyer();
  });
});
