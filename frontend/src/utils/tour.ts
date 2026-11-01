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

/**
 * Kurze Rundgänge je Menügruppe (nur im Hilfe-Panel, ohne Merker am Konto) : ein Schritt je Seite,
 * die das Konto in dieser Gruppe sieht. Die Texte sind die der Seitenhinweise.
 */
export const GRUPPEN_RUNDGAENGE = [
  "g_general",
  "g_communaute",
  "g_contenu",
  "u_mitglieder",
  "u_finanzen",
  "u_aktivitaeten",
  "u_community",
  "u_system",
] as const;
export type GruppenRundgang = (typeof GRUPPEN_RUNDGAENGE)[number];
export type RundgangArt = TourArt | GruppenRundgang;

export function istGruppenRundgang(art: RundgangArt): art is GruppenRundgang {
  return art !== "app" && art !== "verwaltung";
}

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
  /** Wurzel der Texte, wenn nicht `stationen.<id>` (Gruppen-Rundgänge nutzen `hinweise.<id>`). */
  textWurzel?: string;
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

/**
 * Jede Seite der Seitenleiste mit ihrem Text unter `hinweise.<key>` in tour.json : Pfad, Schlüssel,
 * ob auch Unterseiten (`/reisen/123`) denselben Tipp zeigen. Längere Pfade zuerst. Die Texte dienen
 * zugleich als Schritte der Gruppen-Rundgänge.
 */
export const SEITEN: ReadonlyArray<readonly [string, string, boolean]> = [
  ["/cotisations/en-attente", "zahlungen", true],
  ["/cotisations/relances", "erinnerungen", true],
  ["/admin/campagnes-adhesion", "kampagnen", true],
  ["/admin/configuration-site", "startseite_video", true],
  ["/admin/justificatifs", "nachweise", true],
  ["/admin/fan-club-logos", "vereinslogos", true],
  ["/admin/articles-cotisation", "artikel", true],
  ["/admin/notifications", "benachrichtigungen", true],
  ["/admin/einstellungen", "einstellungen", true],
  ["/admin/boutique", "a_boutique", true],
  ["/admin/regionen", "a_regionen", true],
  ["/admin/projets", "a_projekte", true],
  ["/admin/albums", "a_albums", true],
  ["/admin/events", "veranstaltungsverwaltung", true],
  ["/admin/partner", "partner", true],
  ["/admin/roles", "rollen", true],
  ["/admin/quiz", "a_quiz", true],
  ["/admin/finances", "finanzen", true],
  ["/inscriptions", "registrierungen", true],
  ["/mon-adhesion", "mitgliedschaft", true],
  ["/evenements", "veranstaltungen", false],
  ["/dashboard", "dashboard", false],
  ["/kalender", "kalender", false],
  ["/membres", "mitglieder", false],
  ["/boutique", "boutique", false],
  ["/projets", "projekte", false],
  ["/regionen", "regionen", true],
  ["/albums", "albums", true],
  ["/reisen", "reisen", true],
  ["/forum", "forum", false],
  ["/chats", "chats", false],
  ["/votes", "abstimmungen", false],
  ["/stats", "statistik", false],
  ["/live", "live", false],
  ["/quiz", "quiz", false],
  ["/fil", "fil", false],
  ["/", "start", false],
];

/** Seiten mit fester Höhe (Chats) : kein Tipp oben auf der Seite, aber ein Schritt im Rundgang. */
const OHNE_LEISTE = new Set(["chats"]);

export interface HinweisTreffer {
  key: string;
  /** Pfad des Menüeintrags (`NavItem.to`), zu dem die Seite gehört. */
  pfad: string;
}

export function hinweisTreffer(pathname: string): HinweisTreffer | null {
  const treffer = SEITEN.find(
    ([pfad, , unterseiten]) =>
      pathname === pfad || (unterseiten && pathname.startsWith(`${pfad}/`)),
  );
  if (!treffer || OHNE_LEISTE.has(treffer[1])) return null;
  return { key: treffer[1], pfad: treffer[0] };
}

export function hinweisFuerPfad(pathname: string): string | null {
  return hinweisTreffer(pathname)?.key ?? null;
}

/** Schlüssel aller Seitentipps (ohne Seiten, die keine Leiste zeigen). */
export const HINWEISE: ReadonlyArray<readonly [string, string]> = SEITEN.filter(
  ([, key]) => !OHNE_LEISTE.has(key),
).map(([pfad, key]) => [pfad, key] as const);

export function hinweisSichtbar(tour: TourPraeferenz | undefined, key: string): boolean {
  if (tour?.hinweise_aus) return false;
  return !(tour?.hinweise ?? []).includes(key);
}

/** Text-Schlüssel der Seite zu einem Menüeintrag (`NavItem.to`), sonst `null`. */
export function seitenSchluessel(to: string): string | null {
  return SEITEN.find(([pfad]) => pfad === to)?.[1] ?? null;
}

// --- Rundgänge je Menügruppe ----------------------------------------------------------------

export interface GruppenEintrag {
  to: string;
  group: SidebarGroupKey;
  /** Nur Verwaltung : Untergruppe des Eintrags. */
  subgruppe?: SidebarSubgroupKey;
}

const GRUPPE_VON_RUNDGANG: Record<
  GruppenRundgang,
  { gruppe: SidebarGroupKey; subgruppe?: SidebarSubgroupKey }
> = {
  g_general: { gruppe: "general" },
  g_communaute: { gruppe: "communaute" },
  g_contenu: { gruppe: "contenu" },
  u_mitglieder: { gruppe: "administration", subgruppe: "mitglieder" },
  u_finanzen: { gruppe: "administration", subgruppe: "finanzen" },
  u_aktivitaeten: { gruppe: "administration", subgruppe: "aktivitaeten" },
  u_community: { gruppe: "administration", subgruppe: "community" },
  u_system: { gruppe: "administration", subgruppe: "system" },
};

/**
 * Schritte der Gruppen-Rundgänge : je sichtbarem Menüeintrag der Gruppe ein Schritt in der
 * Reihenfolge der Seitenleiste. Gruppen ohne sichtbaren Eintrag fehlen im Ergebnis.
 */
export function gruppenStationen(
  eintraege: GruppenEintrag[],
): Partial<Record<GruppenRundgang, TourStation[]>> {
  const ergebnis: Partial<Record<GruppenRundgang, TourStation[]>> = {};
  for (const art of GRUPPEN_RUNDGAENGE) {
    const { gruppe, subgruppe } = GRUPPE_VON_RUNDGANG[art];
    const stationen = eintraege.flatMap<TourStation>((e) => {
      if (e.group !== gruppe || (subgruppe && e.subgruppe !== subgruppe)) return [];
      const key = seitenSchluessel(e.to);
      if (!key) return [];
      return [{ id: key, ziel: e.to, gruppe, subgruppe, textWurzel: "hinweise" }];
    });
    if (stationen.length > 0) ergebnis[art] = stationen;
  }
  return ergebnis;
}
