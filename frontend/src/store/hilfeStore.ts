/**
 * Zustand des Hilfe-Begleiters (Seitenpanel, das neben der App offen bleibt). Bewusst nicht
 * persistiert : Das Panel startet nach einem Neuladen geschlossen ; nur der Fortschritt in einem
 * Ablauf wird gemerkt (siehe hilfeFortschritt.ts).
 */
import { create } from "zustand";

interface HilfeState {
  offen: boolean;
  /** Schlüssel in help.json, zu dem das Panel gerade gehört (kann von der aktuellen Seite abweichen). */
  cle: string | null;
  minimiert: boolean;
  oeffnen: (cle: string) => void;
  schliessen: () => void;
  umschalten: (cle: string) => void;
  minimierenUmschalten: () => void;
}

export const useHilfeStore = create<HilfeState>((set, get) => ({
  offen: false,
  cle: null,
  minimiert: false,
  oeffnen: (cle) => set({ offen: true, cle, minimiert: false }),
  schliessen: () => set({ offen: false, minimiert: false }),
  umschalten: (cle) => {
    const { offen, cle: aktuell } = get();
    if (offen && aktuell === cle) set({ offen: false, minimiert: false });
    else set({ offen: true, cle, minimiert: false });
  },
  minimierenUmschalten: () => set((s) => ({ minimiert: !s.minimiert })),
}));
