/** Preis-Vorschau für ein Familienpaket (R35): Summe der zugewiesenen Angebote minus
 * Familienrabatt in %. Nur eine Anzeige – der gespeicherte Preis wird immer vom Server berechnet. */
import type { Beziehung, OffreAdhesion } from "../../types/adhesion";

export type PaketRolle = "haupt" | "erwachsener" | "kind";

export interface PaketPosition {
  rolle: PaketRolle;
  angebot: OffreAdhesion;
  liste: number;
  anteil: number;
}

export interface PaketPreis {
  positionen: PaketPosition[];
  liste: number;
  gesamt: number;
  rabattPct: number;
}

const runden = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** `null`, wenn dem Paket (noch) keine Angebote zugewiesen sind. */
export function berechnePaket(
  offre: OffreAdhesion,
  angebote: OffreAdhesion[],
  erwachsene: number,
  kinder: number,
): PaketPreis | null {
  const finde = (id: string | null) => (id ? angebote.find((a) => a.id === id) : undefined);
  const erw = finde(offre.familie_angebot_erwachsene);
  const haupt = finde(offre.familie_angebot_hauptperson) ?? erw;
  const kind = finde(offre.familie_angebot_kinder);
  if (!haupt || (erwachsene > 0 && !erw) || (kinder > 0 && !kind)) return null;
  const rabattPct = Number(offre.familie_rabatt_pct);
  const faktor = 1 - rabattPct / 100;
  const reihe: [PaketRolle, OffreAdhesion][] = [["haupt", haupt]];
  for (let i = 0; i < erwachsene; i++) reihe.push(["erwachsener", erw as OffreAdhesion]);
  for (let i = 0; i < kinder; i++) reihe.push(["kind", kind as OffreAdhesion]);
  const positionen = reihe.map(([rolle, angebot]) => ({
    rolle,
    angebot,
    liste: Number(angebot.prix_plein),
    anteil: runden(Number(angebot.prix_plein) * faktor),
  }));
  return {
    positionen,
    liste: runden(positionen.reduce((s, p) => s + p.liste, 0)),
    gesamt: runden(positionen.reduce((s, p) => s + p.anteil, 0)),
    rabattPct,
  };
}

export function formatEuro(betrag: string | number): string {
  return `${Number(betrag).toFixed(2).replace(".", ",")} €`;
}

export interface ErwachsenerEingabe {
  vorname: string;
  nachname: string;
  email: string;
  beziehung: Beziehung | "";
}

export interface KindEingabe {
  vorname: string;
  nachname: string;
  geburtsjahr: string;
  beziehung: Beziehung;
}

export interface FamilienEingabe {
  erwachsene: ErwachsenerEingabe[];
  kinder: KindEingabe[];
  einwilligung: boolean;
}

export const LEERE_FAMILIE: FamilienEingabe = { erwachsene: [], kinder: [], einwilligung: false };

export function familieVollstaendig(f: FamilienEingabe): boolean {
  const gefuellt = (s: string) => s.trim().length > 0;
  const erwOk = f.erwachsene.every(
    (e) =>
      gefuellt(e.vorname) &&
      gefuellt(e.nachname) &&
      /^\S+@\S+\.\S+$/.test(e.email.trim()) &&
      e.beziehung,
  );
  const kinderOk = f.kinder.every(
    (k) => gefuellt(k.vorname) && gefuellt(k.nachname) && /^\d{4}$/.test(k.geburtsjahr.trim()),
  );
  const mindestensEine = f.erwachsene.length + f.kinder.length > 0;
  return mindestensEine && erwOk && kinderOk && (f.kinder.length === 0 || f.einwilligung);
}
