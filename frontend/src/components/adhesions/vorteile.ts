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

const PFADE: Record<VorteilSymbolName, string> = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  card: "M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 10h18",
  vote: "M6 4h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2zM8 12l3 3 5-6",
  bag: "M5 8h14l-1 12H6zM9 8a3 3 0 016 0",
  ticket: "M4 7h16v3a2 2 0 000 4v3H4v-3a2 2 0 000-4zM14 7v10",
  car: "M5 17v2m14-2v2M3 13l2-6h14l2 6v4H3zM7.5 14h.01M16.5 14h.01",
  gift: "M3 8h18v4H3zM12 8v13M5 12v9h14v-9M7.5 8a2.5 2.5 0 010-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 010 5",
  star: "M12 3l2.8 6 6.2.8-4.5 4.4 1.2 6.8-5.7-3.2-5.7 3.2 1.2-6.8L3 9.8 9.2 9z",
  users:
    "M9 5a3 3 0 100 6 3 3 0 000-6zM3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M17 6.5a2.3 2.3 0 110 4.6M17 14c2.5 0 4 2 4 5",
  calendar:
    "M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2zM4 10h16M9 3v4M15 3v4",
  heart: "M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z",
  camera:
    "M4 8h3l2-3h6l2 3h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 10a3.5 3.5 0 100 7 3.5 3.5 0 000-7z",
  chat: "M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1h-9l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z",
  trophy: "M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a3 3 0 003 3M16 6h4v1a3 3 0 01-3 3M12 13v4M8 21h8M9 17h6",
};

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

/** SVG-Pfad (Viewbox 24 × 24) des Symbols ; unbekannte oder leere Schlüssel ergeben das Häkchen. */
export function symbolPfad(name: string | null | undefined): string {
  return PFADE[istSymbol(name) ? name : "check"];
}
