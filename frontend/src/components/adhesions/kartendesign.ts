/**
 * Gestaltung der Mitgliedskarte (Farben je Stil). Eine Quelle für die Anzeige im Browser
 * (`MitgliedsKarte.tsx`, CSS-Verlauf) und für das gespeicherte Kartenbild (`karteBild.ts`, Canvas).
 */
import type { KartenStil } from "../../types/adhesion";

export interface StilDefinition {
  fond: string;
  text: string;
  gedaempft: string;
  rahmen: string;
  /** Zusätzlicher bewegter Glanz (Metall/Hologramm) */
  glanz: boolean;
}

export const STILE: Record<KartenStil, StilDefinition> = {
  weiss: {
    fond: "linear-gradient(135deg,#ffffff 0%,#f2f4f8 50%,#e3e7ee 100%)",
    text: "#1b2230",
    gedaempft: "#5b6575",
    rahmen: "#d3d9e3",
    glanz: false,
  },
  silber: {
    fond: "linear-gradient(135deg,#f5f7f9 0%,#c5ccd5 38%,#eef1f4 55%,#98a1ad 100%)",
    text: "#1c2430",
    gedaempft: "#4a5562",
    rahmen: "#aab2bd",
    glanz: true,
  },
  gold: {
    fond: "linear-gradient(135deg,#fbeaa8 0%,#d8a62e 38%,#f7de8c 55%,#a67713 100%)",
    text: "#3a2904",
    gedaempft: "#6b4d0c",
    rahmen: "#c19523",
    glanz: true,
  },
  diamant: {
    fond: "linear-gradient(135deg,#eaf7ff 0%,#b7dbf4 28%,#f6fcff 48%,#a2c9ee 68%,#d9ccff 100%)",
    text: "#0d2840",
    gedaempft: "#37566f",
    rahmen: "#9fc6e6",
    glanz: true,
  },
  bronze: {
    fond: "linear-gradient(135deg,#f1cba3 0%,#b8733a 44%,#e5a56e 60%,#87491f 100%)",
    text: "#2a1507",
    gedaempft: "#5e3414",
    rahmen: "#a2602b",
    glanz: true,
  },
  onyx: {
    fond: "linear-gradient(135deg,#2c313b 0%,#0d0f13 60%,#1c2028 100%)",
    text: "#f6f7f9",
    gedaempft: "#aeb4bf",
    rahmen: "#4b5260",
    glanz: true,
  },
  rubin: {
    fond: "linear-gradient(135deg,#e5192d 0%,#a50011 55%,#6c000c 100%)",
    text: "#ffffff",
    gedaempft: "rgba(255,255,255,0.78)",
    rahmen: "#7d000d",
    glanz: true,
  },
};

export interface VerlaufStopp {
  /** Position im Verlauf, 0 bis 1. */
  position: number;
  farbe: string;
}

/** Liest die Farbstopps aus einem CSS-Verlauf der Form „linear-gradient(135deg,#aaa 0%,#bbb 50%)“. */
export function verlaufStopps(fond: string): VerlaufStopp[] {
  return Array.from(fond.matchAll(/(#[0-9a-f]{6})\s+(\d+(?:\.\d+)?)%/gi)).map((m) => ({
    farbe: m[1],
    position: Number(m[2]) / 100,
  }));
}

/**
 * Start- und Endpunkt eines CSS-Verlaufs mit Winkel (in Grad, 0 = nach oben, 90 = nach rechts)
 * auf einer Fläche `breite` × `hoehe`. Gleiche Geometrie wie `linear-gradient(<winkel>deg, …)`.
 */
export function verlaufLinie(breite: number, hoehe: number, winkel = 135) {
  const rad = (winkel * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const laenge = Math.abs(breite * dx) + Math.abs(hoehe * dy);
  const mx = breite / 2;
  const my = hoehe / 2;
  return {
    x0: mx - (dx * laenge) / 2,
    y0: my - (dy * laenge) / 2,
    x1: mx + (dx * laenge) / 2,
    y1: my + (dy * laenge) / 2,
  };
}
