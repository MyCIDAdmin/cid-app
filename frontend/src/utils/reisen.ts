/** Hilfen für das Reisemodul : Datums-/Zeitformate, Restzeit, Beträge. */

export function datumKurz(iso: string | null | undefined, sprache = "de"): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(sprache.startsWith("fr") ? "fr-FR" : "de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function zeitKurz(iso: string | null | undefined, sprache = "de"): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(sprache.startsWith("fr") ? "fr-FR" : "de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function zeitraum(start: string | null, ende: string | null, sprache = "de"): string {
  if (!start) return "";
  return ende && ende !== start
    ? `${datumKurz(start, sprache)} – ${datumKurz(ende, sprache)}`
    : datumKurz(start, sprache);
}

/** Wert eines `<input type="datetime-local">` → ISO-String (oder null). */
export function lokalZuIso(wert: string): string | null {
  if (!wert) return null;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface Restzeit {
  abgelaufen: boolean;
  tage: number;
  stunden: number;
  minuten: number;
  /** Letzte 24 Stunden : hervorheben. */
  dringend: boolean;
}

export function restzeit(frist: string | null, jetzt: number = Date.now()): Restzeit | null {
  if (!frist) return null;
  const ms = new Date(frist).getTime() - jetzt;
  if (ms <= 0) return { abgelaufen: true, tage: 0, stunden: 0, minuten: 0, dringend: false };
  const minutenGesamt = Math.floor(ms / 60000);
  return {
    abgelaufen: false,
    tage: Math.floor(minutenGesamt / 1440),
    stunden: Math.floor((minutenGesamt % 1440) / 60),
    minuten: minutenGesamt % 60,
    dringend: ms <= 24 * 3600 * 1000,
  };
}

export function centsZuEuro(cents: number, sprache = "de"): string {
  return new Intl.NumberFormat(sprache.startsWith("fr") ? "fr-FR" : "de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Preis mit Einheit, z. B. „55,00 € / Nacht“ (`einheitLabel` kommt aus den Übersetzungen). */
export function preisText(preis: string | null, einheitLabel: string, sprache = "de"): string {
  if (preis === null) return "";
  const betrag = new Intl.NumberFormat(sprache.startsWith("fr") ? "fr-FR" : "de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(preis));
  return einheitLabel ? `${betrag} ${einheitLabel}` : betrag;
}
