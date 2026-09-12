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
