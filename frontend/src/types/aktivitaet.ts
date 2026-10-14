/** Types — Aktivität (Release 20), Spiegel von backend/apps/aktivitaet. */

export type Gewicht = "info" | "warnung" | "wichtig";
export type Sprachtext = { de: string; fr: string };

export interface Kacheln {
  logins: number;
  fehlversuche: number;
  sperren: number;
  registrierungen: number;
  freigaben: number;
  rollenaenderungen: number;
  geraete_limit: number;
  server_fehler: number;
  auffaelligkeiten_offen: number;
  passwort: number;
  aktive_nutzer: number;
  aktiv_24h: number;
  aktiv_7d: number;
  aktiv_30d: number;
}

export interface PrivilegiertesKonto {
  id: string;
  name: string;
  email: string;
  rolle: string;
  letzte_anmeldung: string | null;
  totp: boolean;
}

export interface Uebersicht {
  tage: number;
  kacheln: Kacheln;
  verlauf: { tag: string; logins: number; fehlversuche: number }[];
  heatmap: number[][];
  top_ips: { ip: string; anzahl: number; zuletzt: string }[];
  privilegiert: PrivilegiertesKonto[];
  konten: { aktiv: number; inaktiv_90d: number; nie_angemeldet: number };
}

export interface JournalEintrag {
  id: string;
  zeit: string;
  aktion: string;
  label: Sprachtext;
  kategorie: string;
  gewicht: Gewicht;
  user: { id: string; name: string; email: string } | null;
  ip: string | null;
  geraet: string;
  details: Record<string, unknown>;
}

export interface Journal {
  anzahl: number;
  seite: number;
  seiten: number;
  ergebnisse: JournalEintrag[];
}

export interface JournalFilter {
  von?: string;
  bis?: string;
  kategorie?: string;
  aktion?: string;
  gewicht?: string;
  q?: string;
  ip?: string;
  seite?: number;
}

export interface AktionenListe {
  kategorien: { key: string; label: Sprachtext; aufbewahrung_tage: number }[];
  aktionen: { aktion: string; label: Sprachtext; kategorie: string; gewicht: Gewicht }[];
}

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface Auffaelligkeit {
  id: string;
  regel: string;
  gewicht: Gewicht;
  erkannt_am: string;
  status: "offen" | "erledigt";
  text: Sprachtext;
  user: Person | null;
  ip: string | null;
  erledigt_von: Person | null;
  erledigt_am: string | null;
}

export interface AuffaelligkeitenListe {
  offen: number;
  ergebnisse: Auffaelligkeit[];
}

export type AuffaelligkeitStatus = "offen" | "erledigt";

export interface NutzungModul {
  modul: string;
  label: Sprachtext;
  nutzer: number;
  fenster: number;
}

export interface Nutzung {
  tage: number;
  aktiv: { d1: number; d7: number; d30: number; konten: number };
  verlauf: { tag: string; nutzer: number; fenster: number }[];
  module: NutzungModul[];
  ungenutzt: string[];
}
