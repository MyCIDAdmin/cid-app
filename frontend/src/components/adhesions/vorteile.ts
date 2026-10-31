/**
 * Symbole und Ziele der Vorteile eines Angebots (Release 2026.11, Seite „Meine Mitgliedschaft“).
 *
 * Die Schlüssel sind dieselben wie im Backend (`apps/adhesions/vorteile.py`) : ein Vorteil trägt
 * nur einen Schlüssel, nie ein Bild oder eine Adresse. Hier steht, welches Symbol und welche Route
 * dazugehört. Alte Vorteile ohne Schlüssel bekommen ein Häkchen und keinen Link.
 */
import type { AvantageOffre } from "../../types/adhesion";

export const VORTEIL_SYMBOLE = [
  "check",
  "card",
  "vote",
  "bag",
  "ticket",
  "car",
  "gift",
  "star",
  "users",
  "calendar",
  "heart",
  "camera",
  "chat",
  "trophy",
] as const;
export type VorteilSymbolName = (typeof VORTEIL_SYMBOLE)[number];

/** Zielschlüssel → Route der App. */
export const VORTEIL_ZIELE = {
  shop: "/boutique",
  veranstaltungen: "/evenements",
  reisen: "/reisen",
  tickets: "/tickets",
  fanclub: "/live",
  votes: "/votes",
  alben: "/albums",
  kalender: "/kalender",
  chats: "/chats",
  projekte: "/projets",
} as const;
export type VorteilZielName = keyof typeof VORTEIL_ZIELE;

export function zielRoute(ziel: string | null | undefined): string | null {
  return ziel && Object.prototype.hasOwnProperty.call(VORTEIL_ZIELE, ziel)
    ? VORTEIL_ZIELE[ziel as VorteilZielName]
    : null;
}

export function istSymbol(name: string | null | undefined): name is VorteilSymbolName {
  return !!name && (VORTEIL_SYMBOLE as readonly string[]).includes(name);
}

/**
 * Die Vorteile einer bezahlten Mitgliedschaft stammen aus dem Schnappschuss
 * (`Souscription.snapshot_avantages`), damit sich Inhalt und Anspruch nie nachträglich ändern.
 * Symbol und Ziel sind reine Darstellung : fehlen sie im (älteren) Schnappschuss, werden sie vom
 * gleichen Vorteil des aktuellen Angebots übernommen (gleiche Position und gleicher Text).
 *
 * Ist der Schnappschuss leer (Mitgliedschaft entstand, bevor das Angebot Vorteile hatte, oder
 * stammt aus Import/Demo-Daten), zeigt die Seite ersatzweise die aktuellen Vorteile des Angebots.
 * Das betrifft nur die Anzeige ; gespeichert wird nichts.
 */
export function vorteileMitDarstellung(
  schnappschuss: AvantageOffre[] | null | undefined,
  aktuell: AvantageOffre[] | undefined,
): AvantageOffre[] {
  const nachOrdre = (liste: AvantageOffre[]) => liste.slice().sort((a, b) => a.ordre - b.ordre);
  if (!schnappschuss || schnappschuss.length === 0) return nachOrdre(aktuell ?? []);
  return nachOrdre(schnappschuss).map((v) => {
    if (v.icone || v.ziel) return v;
    const gleich = aktuell?.find((a) => a.ordre === v.ordre && a.texte_fr === v.texte_fr);
    return gleich ? { ...v, icone: gleich.icone, ziel: gleich.ziel } : v;
  });
}

/** Leere Zeilen entfernen, Texte kürzen, Reihenfolge neu durchnummerieren (vor dem Speichern). */
export function vorteileFuerSpeichern(werte: AvantageOffre[]): AvantageOffre[] {
  return werte
    .map((v) => ({ ...v, texte_fr: v.texte_fr.trim() }))
    .filter((v) => v.texte_fr !== "")
    .map((v, i) => ({ ...v, ordre: i + 1, icone: v.icone ?? "", ziel: v.ziel ?? "" }));
}
