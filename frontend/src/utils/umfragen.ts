/** Frist als lokales Datum mit Uhrzeit, z. B. „13.10.2026, 18:00“. */
export function formatiereFrist(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO-Zeitpunkt -> Wert für <input type="datetime-local"> (lokale Zeit). */
export function zuLokalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Wert aus <input type="datetime-local"> (lokale Zeit) -> ISO-Zeitpunkt. */
export function vonLokalInput(wert: string): string {
  return new Date(wert).toISOString();
}
