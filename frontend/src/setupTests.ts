import "@testing-library/jest-dom/vitest";
import "./i18n";

// jsdom n'implémente pas ResizeObserver — nécessaire pour que recharts
// (ResponsiveContainer, utilisé par les 3 onglets de Statistiques & KPIs) puisse monter
// dans les tests sans lancer d'erreur non gérée.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom n'implémente pas non plus IntersectionObserver — nécessaire depuis le merge de design
// MyCID (2026-09-25, components/ui/AnimatedProgress.tsx) pour que les barres de progression
// animées (ProjetCard, EvenementCarte) puissent monter dans les tests sans lancer d'erreur non
// gérée. Le stub invoque son callback de façon synchrone avec `isIntersecting: true` dès
// `observe()` — jsdom n'a pas de notion réelle de viewport, donc un élément monté y est
// toujours considéré visible, comme dans un navigateur où la kachel serait déjà à l'écran ;
// ça permet à l'animation de démarrer immédiatement sans que chaque test consommateur
// d'AnimatedProgress ait à déclencher l'intersection lui-même. Le cast est nécessaire car ce
// stub n'implémente que ce dont AnimatedProgress se sert, pas l'interface DOM complète
// (root/rootMargin/thresholds).
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    #callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.#callback = callback;
    }
    observe(target: Element) {
      this.#callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}
