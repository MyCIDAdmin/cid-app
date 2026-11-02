import frFinances from "../../../public/locales/fr/finances.json";
import i18n from "../../i18n";
import type { Abschluss, Cockpit, Probelauf, PruefPunkt } from "../../types/finances";

/** Erfundene Beispieldaten für die Tests der Finanzseiten. */
export function punkt(teil: Partial<PruefPunkt> & Pick<PruefPunkt, "id">): PruefPunkt {
  return {
    stufe: "empfohlen",
    anzahl: 0,
    betrag: "0.00",
    ok: true,
    ziel: "depenses",
    ...teil,
  };
}

export function probelauf(teil: Partial<Probelauf> = {}): Probelauf {
  return {
    annee: 2025,
    abgeschlossen: false,
    schwelle_attention: 80,
    annahmen: { offene_ausgaben: false, offene_beitraege: false },
    pruefliste: [
      punkt({ id: "freigaben", stufe: "pflicht" }),
      punkt({ id: "belege" }),
      punkt({ id: "beitraege", ziel: "zahlungen" }),
      punkt({ id: "projekte", ziel: "projekte" }),
      punkt({ id: "budget_gesetzt", ziel: "budget" }),
      punkt({ id: "budget_passt", ziel: "budget" }),
    ],
    einnahmen: {
      total: "20000.00",
      total_vorjahr: "18000.00",
      lignes: [{ cle: "cotisations", montant: "20000.00", montant_precedent: "18000.00" }],
    },
    ausgaben: { total: "15000.00", total_vorjahr: "14000.00", budget_total: "16000.00" },
    ergebnis: "5000.00",
    ergebnis_vorjahr: "4000.00",
    kostenarten: [],
    bewertung: {
      ampel: "gruen",
      bereit_prozent: 100,
      hinweise: [
        { code: "ergebnis", stufe: "gut", params: { betrag: "5000.00", vorjahr: "4000.00" } },
      ],
    },
    ...teil,
  };
}

export function abschluss(teil: Partial<Abschluss> = {}): Abschluss {
  return { annee: 2025, abgeschlossen: false, ...teil };
}

export function cockpit(teil: Partial<Cockpit> = {}): Cockpit {
  return {
    annee: 2026,
    stand: "2026-11-02",
    freigaben: { anzahl: 2, betrag: "300.00" },
    belege: { anzahl: 0, betrag: "0.00" },
    beitraege: { anzahl: 3, betrag: "90.00" },
    budget: { gesamt: "10000.00", verbraucht: "5000.00", prozent: 50, jahr_prozent: 84 },
    vorjahr: { annee: 2025, abgeschlossen: false },
    prognose: {
      bisher: "5000.00",
      kumuliert: [
        "500.00",
        "1000.00",
        "1500.00",
        "2000.00",
        "2500.00",
        "3000.00",
        "3500.00",
        "4000.00",
        "4500.00",
        "5000.00",
      ],
      monatsschnitt: "500.00",
      jahresende: "6000.00",
      budget: "10000.00",
    },
    aufgaben: [
      {
        code: "freigaben",
        rollen: ["fin"],
        params: { anzahl: 2, betrag: "300.00" },
        faellig: "2026-11-05",
        ziel: "depenses",
      },
      {
        code: "beitraege",
        rollen: ["buero"],
        params: { anzahl: 3, betrag: "90.00" },
        faellig: "2026-11-30",
        ziel: "zahlungen",
      },
    ],
    ...teil,
  };
}

/**
 * i18next-http-backend lädt im Test (jsdom) nichts: die echten Texte werden eingespielt, damit
 * die angezeigten Sätze samt Platzhaltern geprüft werden. Wirksame Sprache ist die Rückfall-
 * sprache `fr` (siehe `i18n.ts`); `changeLanguage` würde das fehlende HTTP-Backend ansprechen.
 */
export function ladeFinanzTexte(): void {
  i18n.addResourceBundle("fr", "finances", frFinances, true, true);
}
