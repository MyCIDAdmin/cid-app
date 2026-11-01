import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useAdhesionsHooks from "../../hooks/useAdhesions";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { CampagneAdhesion, OffreAdhesion, RabaisOffre } from "../../types/adhesion";
import AngebotsAuswahl from "./AngebotsAuswahl";
import { LEERE_FAMILIE, type FamilienEingabe } from "./familienpreis";

vi.mock("../../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../../hooks/useAdhesions");
  return { ...actual, useVorjahrFamilie: vi.fn() };
});

function rabais(teil: Partial<RabaisOffre> = {}): RabaisOffre {
  return {
    id: "r-etu",
    offre: "o1",
    type_rabais: "etudiant",
    label_fr: "Étudiants",
    label_de: "Studierende",
    label_ar: "",
    montant_reduction: null,
    pct_reduction: "20.00",
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

const BASIC = offre({
  id: "o1",
  nom: "Basic",
  rabais: [
    rabais({ id: "r-etu-1" }),
    rabais({ id: "r-fam", type_rabais: "famille", label_de: "Familie", label_fr: "Famille" }),
  ],
  avantages: [
    { ordre: 1, texte_fr: "Mitgliedskarte", icone: "card" },
    { ordre: 2, texte_fr: "Shop-Rabatt", icone: "bag" },
    { ordre: 3, texte_fr: "Reisen", icone: "car" },
    { ordre: 4, texte_fr: "Abstimmungen", icone: "vote" },
    { ordre: 5, texte_fr: "Alben", icone: "camera" },
  ],
});
const PLUS = offre({
  id: "o2",
  nom: "Plus",
  prix_plein: "180.00",
  populaire: true,
  rabais: [
    rabais({ id: "r-etu-2", offre: "o2", pct_reduction: "25.00" }),
    rabais({
      id: "r-sen",
      offre: "o2",
      type_rabais: "senior",
      label_fr: "Seniors",
      pct_reduction: null,
      montant_reduction: "10.00",
    }),
  ],
  avantages: [{ ordre: 1, texte_fr: "Mitgliedskarte", icone: "card" }],
});
const JUNIOR = offre({ id: "o3", nom: "Junior", prix_plein: "24.00", condition_age_max: 17 });
const FAMILIE = offre({
  id: "o4",
  nom: "Familie",
  prix_plein: "100.00",
  ist_familienpaket: true,
  familie_rabatt_pct: "10.00",
  familie_angebot_hauptperson: "o2",
  familie_angebot_erwachsene: "o2",
  familie_angebot_kinder: "o3",
  max_erwachsene: 2,
  max_kinder: 3,
});

function kampagne(offres: OffreAdhesion[]): CampagneAdhesion {
  return {
    id: "c1",
    nom: "Kampagne",
    annee: 2026,
    date_debut: "2026-01-01",
    date_fin: "2099-12-31",
    description: "",
    statut: "publiee",
    date_limite_renouvellement: null,
    bascule_non_renouveles_le: null,
    familie_max_alter_kind: 17,
    created_by: "x",
    created_at: "2026-01-01T00:00:00Z",
    offres,
  };
}

const aufrufe = { waehlen: vi.fn(), absenden: vi.fn() };

function Harness({ offres }: { offres: OffreAdhesion[] }) {
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [rabaisId, setRabaisId] = useState<string | null>(null);
  const [familie, setFamilie] = useState<FamilienEingabe>(LEERE_FAMILIE);
  return (
    <AngebotsAuswahl
      campagne={kampagne(offres)}
      angebote={offres}
      populaerExplizit={offres.some((o) => o.populaire)}
      name="Ahmed Test"
      auswahlId={auswahl}
      rabaisId={rabaisId}
      familie={familie}
      hatAnmeldung={false}
      wirdGesendet={false}
      fehler={null}
      onWaehlen={(id, r = null) => {
        aufrufe.waehlen(id, r);
        setAuswahl(id);
        setRabaisId(id ? r : null);
      }}
      onRabais={setRabaisId}
      onFamilie={setFamilie}
      onAbsenden={aufrufe.absenden}
    />
  );
}

function kachel(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-angebot="${id}"]`);
  if (!el) throw new Error(`Keine Kachel ${id}`);
  return el;
}
const radioVon = (id: string) => kachel(id).querySelector("input") as HTMLInputElement;

describe("AngebotsAuswahl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdhesionsHooks.useVorjahrFamilie).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useAdhesionsHooks.useVorjahrFamilie>);
  });

  it("wählt vorab nichts, zeigt aber Rabatte schon auf jeder Kachel", () => {
    renderWithProviders(<Harness offres={[BASIC, PLUS, JUNIOR]} />);

    expect(aufrufe.waehlen).not.toHaveBeenCalled();
    expect(screen.queryByTestId("beitrittsleiste")).toBeNull();
    // Grünes Band auf der Kartenvorschau und Chips mit Wert unter dem Preis.
    expect(within(kachel("o1")).getByText("angebote.bis_rabatt")).toBeInTheDocument();
    expect(within(kachel("o1")).getByText(/Étudiants −20 %/)).toBeInTheDocument();
    expect(within(kachel("o2")).getByText(/Seniors −10 €/)).toBeInTheDocument();
    // Der Familienrabatt steckt schon im Preis und trägt keinen Wert.
    expect(within(kachel("o1")).getByText(/angebote\.eingerechnet/)).toBeInTheDocument();
    expect(within(kachel("o3")).queryByText("angebote.bis_rabatt")).toBeNull();
    // Monatspreis.
    expect(within(kachel("o1")).getByText("angebote.pro_jahr")).toBeInTheDocument();
  });

  it("zeigt die ersten drei Vorteile und den Rest als „weitere“", () => {
    renderWithProviders(<Harness offres={[BASIC, PLUS]} />);
    const k = kachel("o1");
    expect(within(k).getByText("Mitgliedskarte")).toBeInTheDocument();
    expect(within(k).getByText("Reisen")).toBeInTheDocument();
    expect(within(k).queryByText("Abstimmungen")).toBeNull();
    expect(within(k).getByText("angebote.weitere_vorteile")).toBeInTheDocument();
    // Die gewählte Kachel zeigt alle.
    fireEvent.click(radioVon("o1"));
    expect(within(kachel("o1")).getByText("Abstimmungen")).toBeInTheDocument();
    expect(within(kachel("o1")).queryByText("angebote.weitere_vorteile")).toBeNull();
  });

  it("„Für wen?“ wählt das passende Angebot vor und markiert es", () => {
    renderWithProviders(<Harness offres={[BASIC, PLUS, JUNIOR, FAMILIE]} />);

    fireEvent.click(screen.getByRole("radio", { name: "angebote.gruppe.kind" }));
    expect(radioVon("o3")).toBeChecked();
    expect(within(kachel("o3")).getByText("angebote.passt_zu_dir")).toBeInTheDocument();
    expect(within(kachel("o1")).queryByText("angebote.passt_zu_dir")).toBeNull();
    expect(kachel("o1")).toHaveClass("opacity-60");

    // Das beliebte Angebot wird für „ich“ bevorzugt.
    fireEvent.click(screen.getByRole("radio", { name: "angebote.gruppe.ich" }));
    expect(radioVon("o2")).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "angebote.gruppe.familie" }));
    expect(radioVon("o4")).toBeChecked();
  });

  it("zeigt keinen Schalter, wenn es nur eine Gruppe gibt", () => {
    renderWithProviders(<Harness offres={[BASIC, PLUS]} />);
    expect(screen.queryByText("angebote.fuer_wen")).toBeNull();
  });

  it("Rabatt-Chip zeigt auf jeder Kachel den Preis nach Rabatt und gibt ihn mit der Wahl weiter", () => {
    renderWithProviders(<Harness offres={[BASIC, PLUS, JUNIOR]} />);

    fireEvent.click(screen.getByRole("button", { name: "angebote.rabatt_typ.etudiant" }));
    // 120 − 20 % = 96 ; 180 − 25 % = 135 ; Junior hat keinen Rabatt.
    expect(within(kachel("o1")).getByText("96,00 €")).toBeInTheDocument();
    expect(within(kachel("o1")).getByText("120,00 €")).toHaveClass("line-through");
    expect(within(kachel("o2")).getByText("135,00 €")).toBeInTheDocument();
    expect(within(kachel("o3")).getByText("24,00 €")).toBeInTheDocument();

    fireEvent.click(radioVon("o2"));
    expect(aufrufe.waehlen).toHaveBeenLastCalledWith("o2", "r-etu-2");
    const leiste = screen.getByTestId("beitrittsleiste");
    expect(within(leiste).getByText("135,00 €")).toBeInTheDocument();
    expect(within(leiste).getByText("180,00 €")).toHaveClass("line-through");

    // Chip erneut antippen hebt den Rabatt wieder auf.
    fireEvent.click(screen.getByRole("button", { name: "angebote.rabatt_typ.etudiant" }));
    expect(within(screen.getByTestId("beitrittsleiste")).queryByText("135,00 €")).toBeNull();
  });

  it("Rabatt-Auswahl in „Deine Auswahl“ passt die Leiste an, Beitritt über die Leiste", () => {
    renderWithProviders(<Harness offres={[BASIC, PLUS]} />);
    fireEvent.click(radioVon("o1"));
    const leiste = screen.getByTestId("beitrittsleiste");
    expect(within(leiste).getByText("120,00 €")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("offres.rabais_label"), {
      target: { value: "r-etu-1" },
    });
    expect(within(screen.getByTestId("beitrittsleiste")).getByText("96,00 €")).toBeInTheDocument();
    expect(screen.getByText("angebote.nachweis_hinweis")).toBeInTheDocument();
    // Der Typ-Chip folgt der Auswahl.
    expect(screen.getByRole("button", { name: "angebote.rabatt_typ.etudiant" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(within(screen.getByTestId("beitrittsleiste")).getByText("offres.souscrire"));
    expect(aufrufe.absenden).toHaveBeenCalledTimes(1);

    // „Abbrechen“ hebt die Auswahl auf und blendet die Leiste aus.
    fireEvent.click(
      within(screen.getByTestId("beitrittsleiste")).getByText("offres.annuler_selection"),
    );
    expect(screen.queryByTestId("beitrittsleiste")).toBeNull();
  });

  it("Familienpaket: Zähler passen die Personen und den Live-Preis an", () => {
    renderWithProviders(<Harness offres={[PLUS, JUNIOR, FAMILIE]} />);
    fireEvent.click(radioVon("o4"));

    const weiter = screen.getByText("familie.weiter_zur_zahlung");
    expect(weiter).toBeDisabled();
    // Nur Hauptperson : 180 − 10 % = 162.
    expect(within(screen.getByTestId("beitrittsleiste")).getByText("162,00 €")).toBeInTheDocument();

    // Erste Zähler-Zeile = Erwachsene, zweite = Kinder.
    const mehr = () => screen.getAllByRole("button", { name: "angebote.zaehler_mehr" });
    fireEvent.click(mehr()[0]);
    // Haupt- und weitere Person : 2 × 180 − 10 % = 324.
    expect(within(screen.getByTestId("beitrittsleiste")).getByText("324,00 €")).toBeInTheDocument();
    fireEvent.click(mehr()[1]);
    // Plus ein Kind für 24 : (360 + 24) − 10 % = 345,60.
    expect(within(screen.getByTestId("beitrittsleiste")).getByText("345,60 €")).toBeInTheDocument();
    // Die Zeilen im Formular sind angelegt, ausgefüllt sind sie noch nicht.
    expect(screen.getAllByLabelText("familie.vorname")).toHaveLength(2);
    expect(weiter).toBeDisabled();

    fireEvent.click(screen.getAllByRole("button", { name: "angebote.zaehler_weniger" })[0]);
    // Ohne weitere Person bleibt Hauptperson plus Kind : (180 + 24) − 10 % = 183,60.
    expect(within(screen.getByTestId("beitrittsleiste")).getByText("183,60 €")).toBeInTheDocument();
  });

  it("Vergleichstabelle: eine Zeile je Vorteil mit Häkchen je Angebot", () => {
    renderWithProviders(<Harness offres={[BASIC, PLUS]} />);
    const tabelle = screen.getByRole("table");
    // Mitgliedskarte steckt in beiden Angeboten, die übrigen nur in Basic.
    const zeile = (text: string) => within(tabelle).getByText(text).closest("tr") as HTMLElement;
    expect(
      within(zeile("Mitgliedskarte")).getAllByRole("img", { name: "angebote.enthalten" }),
    ).toHaveLength(2);
    expect(
      within(zeile("Reisen")).getAllByRole("img", { name: "angebote.enthalten" }),
    ).toHaveLength(1);
    expect(within(zeile("Reisen")).getByLabelText("angebote.nicht_enthalten")).toBeInTheDocument();
  });

  it("Kinderangebot mit Altersgrenze zeigt den Hinweis, „alle Alter“ nicht", () => {
    const alle = offre({ id: "o9", nom: "Alle", condition_age_min: 0, condition_age_max: 92 });
    renderWithProviders(<Harness offres={[JUNIOR, alle]} />);
    expect(within(kachel("o3")).getByText("offres.condition_age_max")).toBeInTheDocument();
    expect(within(kachel("o9")).queryByText("offres.condition_age_min_max")).toBeNull();
  });
});
