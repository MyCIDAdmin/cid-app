/**
 * Merkt sich, bei welchem Schritt eines Ablaufs man in diesem Browser stehengeblieben ist
 * (localStorage, rein als Komfort : fehlt der Speicher, beginnt man einfach bei Schritt 1).
 */
const SCHLUESSEL = "cid-hilfe-fortschritt-v1";

type Karte = Record<string, number>;

function lesen(): Karte {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    const wert: unknown = roh ? JSON.parse(roh) : {};
    return wert && typeof wert === "object" ? (wert as Karte) : {};
  } catch {
    return {};
  }
}

function schreiben(karte: Karte): void {
  try {
    window.localStorage.setItem(SCHLUESSEL, JSON.stringify(karte));
  } catch {
    // Speicher gesperrt oder voll : der Fortschritt gilt dann nur für diese Sitzung.
  }
}

export function ablaufSchluessel(cle: string, titel: string): string {
  return `${cle}/${titel}`;
}

/** Index des nächsten offenen Schritts (0 = noch nicht begonnen). */
export function fortschrittLesen(schluessel: string): number {
  const n = lesen()[schluessel];
  return typeof n === "number" && n >= 0 ? n : 0;
}

export function fortschrittSchreiben(schluessel: string, schritt: number): void {
  const karte = lesen();
  if (schritt <= 0) delete karte[schluessel];
  else karte[schluessel] = schritt;
  schreiben(karte);
}
