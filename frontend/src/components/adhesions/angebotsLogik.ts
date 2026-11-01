/**
 * Reine Hilfsfunktionen für die Angebotsauswahl (Release 2026.11, Vorschlag A) : „Für wen?“,
 * Rabatt-Vorschau, Monatspreis, Dauer und Vergleichstabelle.
 *
 * Alle Preise hier sind nur Anzeige. Der gespeicherte Preis wird beim Beitritt immer vom Server
 * berechnet (CLAUDE.md §8, SouscriptionViewSet.souscrire).
 */
import { uebersetzt } from "../../utils/uebersetzung";
import type { AvantageOffre, OffreAdhesion, RabaisOffre, TypeRabais } from "../../types/adhesion";

export type ZielGruppe = "ich" | "familie" | "kind";

/** Ab dieser Obergrenze gilt ein Angebot nicht mehr als Kinderangebot. */
const KIND_MAX_ALTER = 18;

const runden = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Kinderangebot = kein Familienpaket und Altersobergrenze höchstens 18. */
export function istKinderAngebot(offre: OffreAdhesion): boolean {
  return (
    !offre.ist_familienpaket &&
    offre.condition_age_max != null &&
    offre.condition_age_max <= KIND_MAX_ALTER
  );
}

export function passtZu(offre: OffreAdhesion, gruppe: ZielGruppe): boolean {
  if (gruppe === "familie") return offre.ist_familienpaket;
  if (gruppe === "kind") return istKinderAngebot(offre);
  return !offre.ist_familienpaket && !istKinderAngebot(offre);
}

/** Das Angebot, das bei einer Gruppe vorgewählt wird : bevorzugt das „beliebte“, sonst das erste. */
export function empfohlenesAngebot(
  angebote: OffreAdhesion[],
  gruppe: ZielGruppe,
): OffreAdhesion | null {
  const passend = angebote.filter((o) => passtZu(o, gruppe));
  return passend.find((o) => o.populaire) ?? passend[0] ?? null;
}

/** Gibt es zu dieser Gruppe überhaupt ein Angebot (sonst wird der Schalter ausgeblendet). */
export function gruppenMitAngebot(angebote: OffreAdhesion[]): ZielGruppe[] {
  return (["ich", "familie", "kind"] as ZielGruppe[]).filter((g) =>
    angebote.some((o) => passtZu(o, g)),
  );
}

/** Preis nach Rabatt (Vorschau) ; nie unter 0. */
export function preisNachRabatt(preis: number, rabais: RabaisOffre): number {
  if (rabais.pct_reduction != null && rabais.pct_reduction !== "") {
    return Math.max(0, runden(preis * (1 - Number(rabais.pct_reduction) / 100)));
  }
  if (rabais.montant_reduction != null && rabais.montant_reduction !== "") {
    return Math.max(0, runden(preis - Number(rabais.montant_reduction)));
  }
  return preis;
}

/** Ersparnis in Euro für diesen Preis. */
export function ersparnis(preis: number, rabais: RabaisOffre): number {
  return runden(preis - preisNachRabatt(preis, rabais));
}

/** „−25 %“ / „−10 €“ ; leer bei Rabatten ohne Betrag (z. B. Typ „autre“ mit Einzelprüfung). */
export function rabattWert(rabais: RabaisOffre): string {
  if (rabais.pct_reduction != null && rabais.pct_reduction !== "") {
    const p = Number(rabais.pct_reduction);
    return `−${Number.isInteger(p) ? p : String(p).replace(".", ",")} %`;
  }
  if (rabais.montant_reduction != null && rabais.montant_reduction !== "") {
    const m = Number(rabais.montant_reduction);
    return `−${Number.isInteger(m) ? m : m.toFixed(2).replace(".", ",")} €`;
  }
  return "";
}

/** Rabatte, die auf der Kachel als Chip mit Wert erscheinen (ohne Familienrabatt). */
export function wahlRabatte(offre: OffreAdhesion): RabaisOffre[] {
  return offre.rabais.filter((r) => r.type_rabais !== "famille");
}

/** Rabatte, die schon im Preis stecken (Typ „famille“). */
export function eingerechneteRabatte(offre: OffreAdhesion): RabaisOffre[] {
  return offre.rabais.filter((r) => r.type_rabais === "famille");
}

/** Der größte Vorteil für das grüne Band „bis −25 %“ ; `null` ohne Rabatt mit Betrag. */
export function besterRabatt(offre: OffreAdhesion): RabaisOffre | null {
  const preis = Number(offre.prix_plein);
  let bester: RabaisOffre | null = null;
  let beste = 0;
  for (const r of wahlRabatte(offre)) {
    const e = ersparnis(preis, r);
    if (e > beste) {
      beste = e;
      bester = r;
    }
  }
  return bester;
}

/** Typen für die Chips „Hast du Anspruch auf einen Rabatt?“ : alle in den Angeboten vorkommenden,
 * außer „famille“ (schon eingerechnet) und „autre“ (nur Bezeichnung, kein allgemeiner Anspruch). */
export function rabattTypen(angebote: OffreAdhesion[]): TypeRabais[] {
  const reihenfolge: TypeRabais[] = [];
  for (const o of angebote) {
    for (const r of o.rabais) {
      if (r.type_rabais === "famille" || r.type_rabais === "autre") continue;
      if (!reihenfolge.includes(r.type_rabais)) reihenfolge.push(r.type_rabais);
    }
  }
  return reihenfolge;
}

export function rabaisVomTyp(offre: OffreAdhesion, typ: TypeRabais | null): RabaisOffre | null {
  if (!typ) return null;
  return offre.rabais.find((r) => r.type_rabais === typ) ?? null;
}

/** Bezeichnung des Rabatts in der App-Sprache : gespeicherte Übersetzung (DeepL oder manuell
 * korrigiert), sonst das alte Sprachfeld (label_de, label_ar), sonst der Originaltext. */
export function rabaisBezeichnung(r: RabaisOffre, sprache: string): string {
  const kurz = sprache.slice(0, 2);
  const uebersetzung = uebersetzt(r, "label_fr", kurz);
  if (uebersetzung !== r.label_fr) return uebersetzung;
  if (kurz === "de" && r.label_de) return r.label_de;
  if (kurz === "ar" && r.label_ar) return r.label_ar;
  return r.label_fr;
}

export function monatspreis(preis: number): number {
  return runden(preis / 12);
}

/** Volle Monate von `heute` bis zum Ende des letzten Kampagnentages (0, wenn sie vorbei ist). */
export function monateBis(isoEnde: string, heute: Date = new Date()): number {
  const letzter = new Date(`${isoEnde}T00:00:00`);
  if (Number.isNaN(letzter.getTime())) return 0;
  // Der letzte Tag zählt mit : gerechnet wird bis zum Beginn des Folgetags.
  const ende = new Date(letzter.getFullYear(), letzter.getMonth(), letzter.getDate() + 1);
  if (ende.getTime() <= heute.getTime()) return 0;
  let monate =
    (ende.getFullYear() - heute.getFullYear()) * 12 + (ende.getMonth() - heute.getMonth());
  if (ende.getDate() < heute.getDate()) monate -= 1;
  return Math.max(1, monate);
}

export interface VergleichsZeile {
  schluessel: string;
  icone: string;
  text: string;
  /** Angebot-ID → enthalten. */
  enthalten: Record<string, boolean>;
}

/** Schlüssel eines Vorteils für den Abgleich : das Symbol, außer es ist leer oder nur das Häkchen
 * (dann steht dasselbe Symbol für viele verschiedene Vorteile) — dann der kleingeschriebene Text. */
function vorteilSchluessel(v: AvantageOffre): string {
  const icone = (v.icone ?? "").trim();
  return icone && icone !== "check" ? `i:${icone}` : `t:${v.texte_fr.trim().toLowerCase()}`;
}

/** Zeilen der Vergleichstabelle in der Reihenfolge ihres ersten Auftretens. */
export function vergleichsZeilen(angebote: OffreAdhesion[]): VergleichsZeile[] {
  const zeilen = new Map<string, VergleichsZeile>();
  for (const o of angebote) {
    const sortiert = o.avantages.slice().sort((a, b) => a.ordre - b.ordre);
    for (const v of sortiert) {
      const k = vorteilSchluessel(v);
      let z = zeilen.get(k);
      if (!z) {
        z = { schluessel: k, icone: v.icone ?? "", text: v.texte_fr, enthalten: {} };
        zeilen.set(k, z);
      }
      z.enthalten[o.id] = true;
    }
  }
  return [...zeilen.values()].map((z) => ({
    ...z,
    enthalten: Object.fromEntries(angebote.map((o) => [o.id, !!z.enthalten[o.id]])),
  }));
}
