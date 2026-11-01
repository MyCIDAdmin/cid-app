/**
 * Zustand der Erste-Schritte-Tour (nur Sitzung, nie persistiert) : läuft gerade ein Rundgang,
 * bei welchem Schritt, und wurde das Willkommensfenster in dieser Sitzung schon geschlossen.
 * Was am Konto gemerkt wird (abgeschlossen, später, Hinweise), steht in hooks/useTour.ts.
 */
import { create } from "zustand";

import type { RundgangArt } from "../utils/tour";

interface TourState {
  lauf: { art: RundgangArt; schritt: number } | null;
  /** Willkommensfenster in dieser Sitzung weggeklickt (verhindert Flackern bis das Speichern ankommt). */
  willkommenVerborgen: boolean;
  starten: (art: RundgangArt) => void;
  gehezu: (schritt: number) => void;
  beenden: () => void;
  verbergeWillkommen: () => void;
  zeigeWillkommen: () => void;
}

export const useTourStore = create<TourState>((set) => ({
  lauf: null,
  willkommenVerborgen: false,
  starten: (art) => set({ lauf: { art, schritt: 0 }, willkommenVerborgen: true }),
  gehezu: (schritt) => set((s) => (s.lauf ? { lauf: { ...s.lauf, schritt } } : s)),
  beenden: () => set({ lauf: null }),
  verbergeWillkommen: () => set({ willkommenVerborgen: true }),
  zeigeWillkommen: () => set({ willkommenVerborgen: false }),
}));
