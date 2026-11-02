import i18n from "../i18n";
import type { Amt, Wahl } from "../types/wahlen";

export function datum(wert: string | null | undefined, mitUhrzeit = false): string {
  if (!wert) return "";
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return wert;
  const sprache = i18n.language?.startsWith("fr") ? "fr-FR" : "de-DE";
  return mitUhrzeit
    ? d.toLocaleString(sprache, { dateStyle: "medium", timeStyle: "short" })
    : d.toLocaleDateString(sprache, { dateStyle: "medium" });
}

/** Ämter einer Liste in der Reihenfolge der Anzeige (Präsident*in zuerst). */
export const LISTEN_AEMTER: Amt[] = ["pres", "vp", "fin", "more"];

/** Der Beitritt zum Ausschuss ist nur vor dem Öffnen der Wahl sinnvoll. */
export function wahlOffen(wahl: Wahl): boolean {
  return wahl.vote_session !== null;
}

export function istListe(wahl: Wahl): boolean {
  return wahl.form === "liste";
}

export function istAntrag(wahl: Wahl): boolean {
  return wahl.form === "ja_nein" || wahl.form === "rang";
}

/** `<input type="date">`-Wert (JJJJ-MM-TT) aus einem Datum in `tage` Tagen. */
export function inTagen(tage: number, stunde?: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  if (stunde !== undefined) d.setHours(stunde, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const tag = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return stunde === undefined ? tag : `${tag}T${pad(d.getHours())}:00`;
}
