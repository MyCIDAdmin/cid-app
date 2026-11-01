import i18n from "../i18n";

/** Lokales Datum von heute als "YYYY-MM-DD" (nicht UTC — sonst falscher Tag kurz nach Mitternacht). */
export function heuteIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}

/**
 * Locale für Datums- und Zeitanzeigen. Ohne Angabe nimmt der Browser die Geräte-Sprache (auf einem
 * deutschen Konto mit englischem Telefon sah man dann 10/18/2026) ; hier gilt die gewählte
 * App-Sprache. Arabisch fällt auf Französisch zurück (kein arabisches Zahlenformat gewünscht).
 */
export function lokaleSprache(): string {
  const sprache = (i18n.language || "de").slice(0, 2);
  return sprache === "de" ? "de-DE" : "fr-FR";
}

/** „vor 12 Min.“ / „gestern“ – kurze relative Zeit in der App-Sprache ; ab einer Woche das
 * Datum. `jetzt` nur für Tests. */
export function vorZeit(iso: string, jetzt: number = Date.now()): string {
  const sekunden = Math.round((new Date(iso).getTime() - jetzt) / 1000);
  const formatierer = new Intl.RelativeTimeFormat(lokaleSprache(), { numeric: "auto" });
  const betrag = Math.abs(sekunden);
  if (betrag < 60) return formatierer.format(Math.min(sekunden, 0), "second");
  if (betrag < 3600) return formatierer.format(Math.round(sekunden / 60), "minute");
  if (betrag < 86400) return formatierer.format(Math.round(sekunden / 3600), "hour");
  if (betrag < 7 * 86400) return formatierer.format(Math.round(sekunden / 86400), "day");
  return new Date(iso).toLocaleDateString(lokaleSprache(), { day: "2-digit", month: "short" });
}
