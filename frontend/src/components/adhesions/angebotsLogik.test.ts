import { describe, expect, it } from "vitest";

import type { OffreAdhesion, RabaisOffre } from "../../types/adhesion";
import {
  besterRabatt,
  empfohlenesAngebot,
  ersparnis,
  gruppenMitAngebot,
  monateBis,
  monatspreis,
  passtZu,
  preisNachRabatt,
  rabaisBezeichnung,
  rabaisVomTyp,
  rabattTypen,
  rabattWert,
  vergleichsZeilen,
} from "./angebotsLogik";

function rabais(teil: Partial<RabaisOffre> = {}): RabaisOffre {
  return {
    id: "r1",
    offre: "o1",
    type_rabais: "etudiant",
    label_fr: "Étudiants",
    label_de: "Studierende",
    label_ar: "",
    montant_reduction: null,
    pct_reduction: "25.00",
    justificatif_requis: true,
    instructions_fr: "",
    instructions_de: "",
    instructions_ar: "",
    ...teil,
  };
}

function offre(teil: Partial<OffreAdhesion> = {}): OffreAdhesion {
  return {
    id: "o1",
    campagne: "c1",
    nom: "Basic",
    prix_plein: "120.00",
    description: "",
    avantages: [],
    condition_age_min: null,
    condition_age_max: null,
    visible: true,
    ordre: 1,
    icone: null,
    couleur: "",
    populaire: false,
    ist_familienpaket: false,
    familie_rabatt_pct: "0.00",
    familie_angebot_hauptperson: null,
    familie_angebot_erwachsene: null,
    familie_angebot_kinder: null,
    max_erwachsene: 0,
    max_kinder: 0,
    rabais: [],
    ...teil,
  };
}

const erwachsen = offre({ id: "e", nom: "Plus", condition_age_min: 18 });
const populaer = offre({ id: "p", nom: "Gold", populaire: true });
const kind = offre({ id: "k", nom: "Junior", condition_age_max: 17 });
const familie = offre({ id: "f", nom: "Familie", ist_familienpaket: true });
const alle = [erwachsen, populaer, kind, familie];

describe("Für wen?", () => {
  it("ordnet Angebote den Gruppen zu", () => {
    expect(passtZu(familie, "familie")).toBe(true);
    expect(passtZu(familie, "ich")).toBe(false);
    expect(passtZu(kind, "kind")).toBe(true);
    expect(passtZu(kind, "ich")).toBe(false);
    expect(passtZu(erwachsen, "ich")).toBe(true);
    expect(passtZu(erwachsen, "kind")).toBe(false);
  });

  it("wählt das beliebte Angebot vor, sonst das erste passende", () => {
    expect(empfohlenesAngebot(alle, "ich")?.id).toBe("p");
    expect(empfohlenesAngebot(alle, "kind")?.id).toBe("k");
    expect(empfohlenesAngebot([erwachsen], "familie")).toBeNull();
  });

  it("nennt nur Gruppen, zu denen es ein Angebot gibt", () => {
    expect(gruppenMitAngebot([erwachsen, populaer])).toEqual(["ich"]);
    expect(gruppenMitAngebot(alle)).toEqual(["ich", "familie", "kind"]);
  });
});

describe("Rabatte", () => {
  it("rechnet Prozent und Betrag, nie unter null", () => {
    expect(preisNachRabatt(120, rabais())).toBe(90);
    expect(preisNachRabatt(120, rabais({ pct_reduction: null, montant_reduction: "10.00" }))).toBe(
      110,
    );
    expect(preisNachRabatt(5, rabais({ pct_reduction: null, montant_reduction: "10.00" }))).toBe(0);
    expect(preisNachRabatt(120, rabais({ pct_reduction: null }))).toBe(120);
    expect(ersparnis(120, rabais())).toBe(30);
  });

  it("formatiert den Wert für das Etikett", () => {
    expect(rabattWert(rabais())).toBe("−25 %");
    expect(rabattWert(rabais({ pct_reduction: "12.50" }))).toBe("−12,5 %");
    expect(rabattWert(rabais({ pct_reduction: null, montant_reduction: "10.00" }))).toBe("−10 €");
    expect(rabattWert(rabais({ pct_reduction: null, montant_reduction: "7.50" }))).toBe("−7,50 €");
    expect(rabattWert(rabais({ pct_reduction: null }))).toBe("");
  });

  it("nimmt für das Band den größten Rabatt und überspringt den Familienrabatt", () => {
    const o = offre({
      rabais: [
        rabais({ id: "a", pct_reduction: "10.00" }),
        rabais({ id: "b", type_rabais: "senior", pct_reduction: null, montant_reduction: "40.00" }),
        rabais({ id: "c", type_rabais: "famille", pct_reduction: "90.00" }),
      ],
    });
    expect(besterRabatt(o)?.id).toBe("b");
    expect(besterRabatt(offre())).toBeNull();
    expect(besterRabatt(offre({ rabais: [rabais({ type_rabais: "famille" })] }))).toBeNull();
  });

  it("bildet die Chips aus den vorkommenden Typen, ohne famille und autre", () => {
    const o1 = offre({ rabais: [rabais(), rabais({ id: "x", type_rabais: "famille" })] });
    const o2 = offre({
      id: "o2",
      rabais: [
        rabais({ id: "s", type_rabais: "senior" }),
        rabais({ id: "y", type_rabais: "etudiant" }),
        rabais({ id: "z", type_rabais: "autre" }),
      ],
    });
    expect(rabattTypen([o1, o2])).toEqual(["etudiant", "senior"]);
    expect(rabaisVomTyp(o2, "senior")?.id).toBe("s");
    expect(rabaisVomTyp(o2, null)).toBeNull();
    expect(rabaisVomTyp(erwachsen, "senior")).toBeNull();
  });

  it("wählt die Bezeichnung nach Sprache, Rückfall Französisch", () => {
    expect(rabaisBezeichnung(rabais(), "de-DE")).toBe("Studierende");
    expect(rabaisBezeichnung(rabais(), "fr")).toBe("Étudiants");
    expect(rabaisBezeichnung(rabais({ label_de: "" }), "de")).toBe("Étudiants");
    // Gespeicherte Übersetzung (DeepL oder manuell) geht dem alten Sprachfeld vor.
    const uebersetzt = rabais({ uebersetzungen: { label_fr: { de: "Studenten", ar: "طلبة" } } });
    expect(rabaisBezeichnung(uebersetzt, "de-DE")).toBe("Studenten");
    expect(rabaisBezeichnung(uebersetzt, "ar")).toBe("طلبة");
    expect(rabaisBezeichnung(uebersetzt, "fr")).toBe("Étudiants");
  });
});

describe("Preis und Dauer", () => {
  it("zeigt den Monatspreis", () => {
    expect(monatspreis(120)).toBe(10);
    expect(monatspreis(90)).toBe(7.5);
  });

  it("zählt die vollen Monate bis zum Ende der Kampagne", () => {
    expect(monateBis("2027-12-31", new Date(2026, 10, 1))).toBe(14);
    expect(monateBis("2026-12-31", new Date(2026, 10, 15))).toBe(1);
    expect(monateBis("2026-11-30", new Date(2026, 10, 15))).toBe(1);
    expect(monateBis("2026-10-31", new Date(2026, 10, 1))).toBe(0);
    expect(monateBis("kaputt", new Date(2026, 10, 1))).toBe(0);
  });
});

describe("Vergleichstabelle", () => {
  it("gleicht Vorteile über das Symbol ab und fällt bei Häkchen auf den Text zurück", () => {
    const a = offre({
      id: "a",
      avantages: [
        { ordre: 2, texte_fr: "Shop −5 %", icone: "bag" },
        { ordre: 1, texte_fr: "Mitgliedskarte", icone: "card" },
        { ordre: 3, texte_fr: "Newsletter", icone: "check" },
      ],
    });
    const b = offre({
      id: "b",
      avantages: [
        { ordre: 1, texte_fr: "Mitgliedskarte", icone: "card" },
        { ordre: 2, texte_fr: "Shop −10 %", icone: "bag" },
        { ordre: 3, texte_fr: "Reisen", icone: "" },
      ],
    });
    const zeilen = vergleichsZeilen([a, b]);
    expect(zeilen.map((z) => z.text)).toEqual([
      "Mitgliedskarte",
      "Shop −5 %",
      "Newsletter",
      "Reisen",
    ]);
    expect(zeilen[1].enthalten).toEqual({ a: true, b: true });
    expect(zeilen[2].enthalten).toEqual({ a: true, b: false });
    expect(zeilen[3].enthalten).toEqual({ a: false, b: true });
  });
});
