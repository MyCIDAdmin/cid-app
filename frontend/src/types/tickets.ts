/** Eintrittstickets (Backend: apps.eintritt). Der Rohcode verlässt den Server nie, nur das QR-Bild. */
export interface Ticket {
  id: string;
  art: "evenement" | "treffen";
  titel: string;
  datum: string;
  uhrzeit: string | null;
  ort: string;
  erwachsene: number;
  kinder: number;
  name: string;
  /** PNG als data:-URL, also auch ohne Netz darstellbar, sobald die Seite geladen ist. */
  qr: string;
  versendet_am: string | null;
}

export interface MeineTicketsAntwort {
  tickets: Ticket[];
  telegram_verbunden: boolean;
}
