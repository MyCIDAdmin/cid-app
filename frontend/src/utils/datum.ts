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
