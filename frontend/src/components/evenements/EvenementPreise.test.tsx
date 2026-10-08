import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import i18n from "../../i18n";
import deEvenements from "../../../public/locales/de/evenements.json";
import frEvenements from "../../../public/locales/fr/evenements.json";
import EvenementPreise from "./EvenementPreise";

type Props = Parameters<typeof EvenementPreise>[0]["evenement"];

function preise(overrides: Partial<Props> = {}): Props {
  return {
    gratuit: false,
    cout: "35.00",
    cout_non_membre: null,
    cout_applicable: "35.00",
    accompagnants_payants: false,
    prix_accompagnant_adulte: "0.00",
    prix_accompagnant_enfant: "0.00",
    age_limite_accompagnant_enfant: 12,
    ...overrides,
  };
}

// i18next-http-backend ne charge rien en test (jsdom) : on injecte les vraies traductions pour
// vérifier le texte effectivement affiché, y compris l'interpolation des montants. On reste sur
// `fallbackLng: "fr"` (i18n.ts) — `changeLanguage` déclencherait un rechargement via le backend
// HTTP absent et bloquerait le test (voir DashboardPage.test.tsx). Le bundle `de` est chargé
// uniquement pour vérifier que les trois nouvelles clés existent dans les deux langues.
beforeAll(() => {
  i18n.addResourceBundle("fr", "evenements", frEvenements, true, true);
});

describe("EvenementPreise (prix sur la kachel)", () => {
  it("affiche « Gratuit » pour un événement gratuit, sans autre prix", () => {
    render(<EvenementPreise evenement={preise({ gratuit: true, cout: "0.00" })} />);
    expect(screen.getByText("Gratuit")).toBeInTheDocument();
    expect(screen.queryByText(/Membres/)).not.toBeInTheDocument();
  });

  it("affiche un seul prix quand le prix non-membre est vide", () => {
    render(<EvenementPreise evenement={preise()} />);
    expect(screen.getByText("35,00 € / pers.")).toBeInTheDocument();
    expect(screen.queryByText(/Non-membres/)).not.toBeInTheDocument();
  });

  it("affiche un seul prix quand le prix non-membre est identique au prix membre", () => {
    render(<EvenementPreise evenement={preise({ cout_non_membre: "35.00" })} />);
    expect(screen.getByText("35,00 € / pers.")).toBeInTheDocument();
    expect(screen.queryByText(/Non-membres/)).not.toBeInTheDocument();
  });

  it("sépare prix membre et prix non-membre quand ils diffèrent", () => {
    render(<EvenementPreise evenement={preise({ cout_non_membre: "50.00" })} />);
    expect(screen.getByText("Membres : 35,00 € / pers.")).toBeInTheDocument();
    expect(screen.getByText("Non-membres : 50,00 € / pers.")).toBeInTheDocument();
  });

  it("affiche les prix accompagnants avec la limite d'âge enfant quand ils sont payants", () => {
    render(
      <EvenementPreise
        evenement={preise({
          accompagnants_payants: true,
          prix_accompagnant_adulte: "10.00",
          prix_accompagnant_enfant: "5.00",
          age_limite_accompagnant_enfant: 14,
        })}
      />,
    );
    expect(
      screen.getByText("Accompagnants : adultes 10,00 € · enfants (moins de 14 ans) 5,00 €"),
    ).toBeInTheDocument();
  });

  it("affiche un prix accompagnant de 0 comme « Gratuit »", () => {
    render(
      <EvenementPreise
        evenement={preise({
          accompagnants_payants: true,
          prix_accompagnant_adulte: "10.00",
          prix_accompagnant_enfant: "0.00",
        })}
      />,
    );
    expect(
      screen.getByText("Accompagnants : adultes 10,00 € · enfants (moins de 12 ans) Gratuit"),
    ).toBeInTheDocument();
  });

  it("n'affiche pas de ligne accompagnants quand ils ne sont pas payants", () => {
    render(<EvenementPreise evenement={preise({ prix_accompagnant_adulte: "10.00" })} />);
    expect(screen.queryByText(/Accompagnants/)).not.toBeInTheDocument();
  });

  it("les trois nouvelles clés existent en allemand et en français", () => {
    for (const cle of ["preis_mitglieder", "preis_nichtmitglieder", "preis_begleitpersonen"]) {
      expect(deEvenements).toHaveProperty(cle);
      expect(frEvenements).toHaveProperty(cle);
    }
  });
});
