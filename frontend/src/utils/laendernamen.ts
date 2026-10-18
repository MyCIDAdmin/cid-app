/** Landesname in der Sprache der Oberfläche (z. B. „Dänemark“ / „Danemark“) ; fällt auf den vom
 * Server gelieferten Namen oder den Code zurück, wenn der Browser das Land nicht kennt. */
export function laenderName(code: string, sprache: string, fallback?: string): string {
  try {
    const name = new Intl.DisplayNames([sprache], { type: "region" }).of(code);
    if (name && name !== code) return name;
  } catch {
    // ältere Browser oder ungültiger Code : Rückfall unten
  }
  return fallback || code;
}
