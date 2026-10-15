/** Gemeinsame Bausteine des Supports (Release 33). */
export const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";
export const KNOPF =
  "rounded-cid bg-ca px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
export const KNOPF_LEISE =
  "rounded-cid border border-text-tertiary/30 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-bg-secondary disabled:opacity-50";

export function datumZeit(iso: string, sprache: string): string {
  return new Date(iso).toLocaleString(sprache, { dateStyle: "short", timeStyle: "short" });
}

export function istFranzoesisch(sprache: string): boolean {
  return sprache.startsWith("fr");
}
