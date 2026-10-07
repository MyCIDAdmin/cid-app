/**
 * URL-Prüfungen für vom Server/Admin gelieferte Links (Sicherheitsprüfung 2026-10-07):
 * verhindern `javascript:`-/`data:`-Ziele, protokollrelative Weiterleitungen (`//evil.com`) und
 * Weiterleitungen auf fremde Zahlungsziele.
 */

/** Gibt die URL nur zurück, wenn sie ein absoluter http(s)-Link ist, sonst `null`. */
export function sicherUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? url.trim() : null;
  } catch {
    return null;
  }
}

/** Interner App-Pfad: beginnt mit genau einem `/` (nicht `//` oder `/\`). */
export function istInternerPfad(pfad: string | null | undefined): pfad is string {
  return !!pfad && /^\/(?![/\\])/.test(pfad) && !/\s/.test(pfad);
}

/** Leitet nur auf https-Ziele weiter (Stripe-Checkout u. ä.); gibt zurück, ob weitergeleitet wurde. */
export function leiteZuZahlungWeiter(redirectUrl: string | null | undefined): boolean {
  const ziel = sicherUrl(redirectUrl);
  if (!ziel || !/^https:/i.test(ziel)) return false;
  window.location.href = ziel;
  return true;
}
