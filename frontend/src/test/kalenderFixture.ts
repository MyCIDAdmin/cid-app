import type { KalenderEintrag } from "../types/kalender";

export function eintrag(overrides: Partial<KalenderEintrag> = {}): KalenderEintrag {
  const jetzt = new Date();
  jetzt.setDate(10);
  jetzt.setHours(18, 0, 0, 0);
  return {
    id: "termin:t1:x",
    quelle: "termin",
    termin_id: "t1",
    titel: "Vorstandssitzung",
    beschreibung: "",
    ort: "Köln",
    link: "",
    kategorie: "sitzung",
    beginn: jetzt.toISOString(),
    ende: null,
    ganztaegig: false,
    sichtbarkeit: "mitglieder",
    kreis: "",
    wichtig: false,
    wiederholung: "keine",
    status: "freigegeben",
    meine_antwort: null,
    editierbar: false,
    uebersetzungen: {},
    ...overrides,
  };
}
