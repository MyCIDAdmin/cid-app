/**
 * Erste Schritte (Konzept_Erste_Schritte_Tour.md, Variante „Leise Begleitung“) : reine Logik für
 * Willkommensfenster, Rundgänge und einmalige Seitenhinweise. Nichts hier greift auf React oder
 * den Browser zu ; Zustand liegt in store/tourStore.ts, der Merker am Konto in
 * `User.ui_praeferenzen.tour` (siehe hooks/useTour.ts).
 */
import type { SidebarGroupKey, SidebarSubgroupKey } from "../store/uiStore";

export const TOUR_VERSION = 1;

export type TourStatus = "offen" | "abgeschlossen" | "uebersprungen" | "nie_mehr";
export type TourArt = "app" | "verwaltung";

/** Technischer Merker am Konto (Backend : apps.accounts.serializers._tour_gueltig). */
export interface TourPraeferenz {
  status?: TourStatus;
  verwaltung_status?: TourStatus;
  /** ISO-Datum (JJJJ-MM-TT) : das Willkommensfenster erscheint erst wieder an diesem Tag. */
  spaeter_bis?: string;
  /** Schlüssel der Seitenhinweise, die bereits mit „Verstanden“ bestätigt wurden. */
  hinweise?: string[];
  hinweise_aus?: boolean;
  version?: number;
}

export interface TourStation {
  /** Schlüssel unter `stationen.<id>` in tour.json. */
  id: string;
  /** Wert von `data-tour` am hervorgehobenen Element (Menüpunkt `to`, `gruppe-…` oder `hilfe`). */
  ziel: string;
  gruppe?: SidebarGroupKey;
  subgruppe?: SidebarSubgroupKey;
}

const HILFE_STATION: TourStation = { id: "hilfe", ziel: "hilfe" };

interface StationSpec {
  id: string;
  /** Erster sichtbarer Menüpunkt aus dieser Liste wird hervorgehoben ; keiner sichtbar → Station entfällt. */
  ziele: string[];
}

const APP_MITGLIED: StationSpec[] = [
  { id: "start", ziele: ["/"] },
  { id: "dashboard", ziele: ["/dashboard"] },
  { id: "mitgliedschaft", ziele: ["/mon-adhesion"] },
  { id: "veranstaltungen", ziele: ["/evenements", "/reisen"] },
  { id: "community", ziele: ["/fil", "/chats", "/forum"] },
];

const APP_FAN: StationSpec[] = [
  { id: "fan_start", ziele: ["/"] },
  { id: "fan_regionen", ziele: ["/regionen"] },
  { id: "fan_alben", ziele: ["/albums"] },
  { id: "fan_mitglied", ziele: ["/mon-adhesion"] },
];

/** Rundgang durch die App : nur Stationen, deren Menüpunkt das Konto wirklich sieht. */
export function appStationen(istFan: boolean, sichtbar: ReadonlySet<string>): TourStation[] {
  const specs = istFan ? APP_FAN : APP_MITGLIED;
  const stationen = specs.flatMap((s) => {
    const ziel = s.ziele.find((z) => sichtbar.has(z));
    return ziel ? [{ id: s.id, ziel } as TourStation] : [];
  });
  return [...stationen, HILFE_STATION];
}

export interface VerwaltungUntergruppe {
  key: SidebarSubgroupKey;
  /** Sichtbare Menüpunkte (`to`) der Untergruppe in Anzeige-Reihenfolge. */
  tos: string[];
}

/** Bevorzugter Menüpunkt je Untergruppe (sonst der erste sichtbare). */
const VERWALTUNG_BEVORZUGT: Record<SidebarSubgroupKey, string> = {
  mitglieder: "/inscriptions",
  finanzen: "/cotisations/en-attente",
  aktivitaeten: "/admin/events",
  community: "/admin/albums",
  system: "/admin/roles",
};

/** Verwaltungs-Rundgang : entsteht aus den Einträgen, die die Rolle in der Seitenleiste sieht. */
export function verwaltungStationen(untergruppen: VerwaltungUntergruppe[]): TourStation[] {
  const mitEintraegen = untergruppen.filter((u) => u.tos.length > 0);
  if (mitEintraegen.length === 0) return [];
  return [
    { id: "v_bereich", ziel: "gruppe-administration", gruppe: "administration" },
    ...mitEintraegen.map<TourStation>((u) => ({
      id: `v_${u.key}`,
      ziel: u.tos.includes(VERWALTUNG_BEVORZUGT[u.key]) ? VERWALTUNG_BEVORZUGT[u.key] : u.tos[0],
      gruppe: "administration",
      subgruppe: u.key,
    })),
    { id: "v_hilfe", ziel: "hilfe" },
  ];
}

// --- Merker -------------------------------------------------------------------------------

export function statusVon(tour: TourPraeferenz | undefined, art: TourArt): TourStatus {
  const wert = art === "app" ? tour?.status : tour?.verwaltung_status;
  return wert ?? "offen";
}

/** Lokales Datum als JJJJ-MM-TT (nicht UTC : „morgen“ soll für die Person morgen sein). */
export function datumIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const t = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${t}`;
}

export function morgenIso(heute: Date): string {
  const morgen = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + 1);
  return datumIso(morgen);
}

/** Rundgänge, die das Willkommensfenster anbieten soll (leer = Fenster bleibt zu). */
export function willkommenArten(
  tour: TourPraeferenz | undefined,
  verfuegbar: TourArt[],
  heute: Date,
): TourArt[] {
  if (tour?.spaeter_bis && datumIso(heute) < tour.spaeter_bis) return [];
  return verfuegbar.filter((art) => statusVon(tour, art) === "offen");
}

/** „Überspringen“ : alle noch offenen Rundgänge gelten als übersprungen, Bestätigtes bleibt. */
export function nachUeberspringen(
  tour: TourPraeferenz | undefined,
  verfuegbar: TourArt[],
): Partial<TourPraeferenz> {
  const neu: Partial<TourPraeferenz> = {};
  if (tour?.spaeter_bis) neu.spaeter_bis = undefined;
  for (const art of verfuegbar) {
    if (statusVon(tour, art) !== "offen") continue;
    if (art === "app") neu.status = "uebersprungen";
    else neu.verwaltung_status = "uebersprungen";
  }
  return neu;
}

export function nachAbschluss(art: TourArt): Partial<TourPraeferenz> {
  return art === "app" ? { status: "abgeschlossen" } : { verwaltung_status: "abgeschlossen" };
}

/** „Nicht mehr anzeigen“ : beide Rundgänge dauerhaft aus (Wiederholen unter Hilfe bleibt möglich). */
export function nachNieMehr(): Partial<TourPraeferenz> {
  return { status: "nie_mehr", verwaltung_status: "nie_mehr", spaeter_bis: undefined };
}

// --- Seitenhinweise -----------------------------------------------------------------------

/** Seitenhinweise : Schlüssel unter `hinweise.<key>` in tour.json ; längere Pfade zuerst. */
export const HINWEISE: ReadonlyArray<readonly [string, string]> = [
  ["/cotisations/en-attente", "zahlungen"],
  ["/admin/events", "veranstaltungsverwaltung"],
  ["/admin/roles", "rollen"],
  ["/inscriptions", "registrierungen"],
  ["/mon-adhesion", "mitgliedschaft"],
  ["/regionen", "regionen"],
  ["/albums", "albums"],
  ["/reisen", "reisen"],
];

export function hinweisFuerPfad(pathname: string): string | null {
  const treffer = HINWEISE.find(([pfad]) => pathname === pfad || pathname.startsWith(`${pfad}/`));
  return treffer ? treffer[1] : null;
}

export function hinweisSichtbar(tour: TourPraeferenz | undefined, key: string): boolean {
  if (tour?.hinweise_aus) return false;
  return !(tour?.hinweise ?? []).includes(key);
}
