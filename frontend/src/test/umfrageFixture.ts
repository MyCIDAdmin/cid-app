import type { Umfrage } from "../types/umfragen";

export function umfrage(overrides: Partial<Umfrage> = {}): Umfrage {
  return {
    id: "u1",
    titel: "Sommerfest",
    beschreibung: "Wann passt es?",
    bild: null,
    zielgruppe: "mitglieder",
    anonym: true,
    ergebnis_modus: "live",
    frist: "2099-01-01T10:00:00Z",
    veroeffentlicht: true,
    abgelaufen: false,
    fragen: [
      {
        id: "f1",
        text: "Welcher Tag?",
        typ: "einzel",
        pflicht: true,
        optionen: [
          { id: "o1", text: "Samstag" },
          { id: "o2", text: "Sonntag" },
        ],
      },
      { id: "f2", text: "Sonstiges", typ: "freitext", pflicht: false, optionen: [] },
    ],
    teilgenommen: false,
    kann_ergebnisse_sehen: false,
    anzahl_teilnahmen: null,
    angekuendigt: false,
    created_at: "2026-10-13T10:00:00Z",
    ...overrides,
  };
}
