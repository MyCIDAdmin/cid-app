/** Lokales Datum von heute als "YYYY-MM-DD" (nicht UTC — sonst falscher Tag kurz nach Mitternacht). */
export function heuteIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${j}`;
}
