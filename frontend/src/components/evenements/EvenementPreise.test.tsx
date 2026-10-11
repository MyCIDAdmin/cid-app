import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";

import i18n from "../../i18n";
import deEvenements from "../../../public/locales/de/evenements.json";
import frCommon from "../../../public/locales/fr/common.json";
import frEvenements from "../../../public/locales/fr/evenements.json";
import EvenementPreise from "./EvenementPreise";

function renderMitRouter(element: React.ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

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
  i18n.addResourceBundle("fr", "common", frCommon, true, true);
});

describe("EvenementPreise (prix sur la kachel)", () => {
  it("affiche « Gratuit » pour un événement gratuit, sans autre prix", () => {
    renderMitRouter(<EvenementPreise evenement={preise({ gratuit: true, cout: "0.00" })} />);
    expect(screen.getByText("Gratuit")).toBeInTheDocument();
    expect(screen.queryByText(/Membres/)).not.toBeInTheDocument();
  });

  it("affiche un seul prix quand le prix non-membre est vide", () => {
    renderMitRouter(<EvenementPreise evenement={preise()} />);
    expect(screen.getByText("35,00 € / pers.")).toBeInTheDocument();
    expect(screen.queryByText(/Non-membres/)).not.toBeInTheDocument();
  });

  it("affiche un seul prix quand le prix non-membre est identique au prix membre", () => {
    renderMitRouter(<EvenementPreise evenement={preise({ cout_non_membre: "35.00" })} />);
    expect(screen.getByText("35,00 € / pers.")).toBeInTheDocument();
    expect(screen.queryByText(/Non-membres/)).not.toBeInTheDocument();
  });

  it("sépare prix membre et prix non-membre quand ils diffèrent", () => {
    renderMitRouter(<EvenementPreise evenement={preise({ cout_non_membre: "50.00" })} />);
    expect(screen.getByText("Membres : 35,00 € / pers.")).toBeInTheDocument();
    expect(screen.getByText("Non-membres : 50,00 € / pers.")).toBeInTheDocument();
  });

  it("affiche les prix accompagnants avec la limite d'âge enfant quand ils sont payants", () => {
    renderMitRouter(
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
    renderMitRouter(
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
    renderMitRouter(<EvenementPreise evenement={preise({ prix_accompagnant_adulte: "10.00" })} />);
    expect(screen.queryByText(/Accompagnants/)).not.toBeInTheDocument();
  });

  it("les trois nouvelles clés existent en allemand et en français", () => {
    for (const cle of ["preis_mitglieder", "preis_nichtmitglieder", "preis_begleitpersonen"]) {
      expect(deEvenements).toHaveProperty(cle);
      expect(frEvenements).toHaveProperty(cle);
    }
  });
  it("zeigt einem Nicht-Mitglied den eigenen Preis und den Mitgliederpreis als Hinweis", () => {
    renderMitRouter(
      <EvenementPreise
        evenement={preise({ cout: "35.00", cout_non_membre: "50.00", cout_applicable: "50.00" })}
      />,
    );
    expect(screen.getByText("50,00 € / pers.")).toBeInTheDocument();
    expect(screen.getByTestId("mitglieder-preis-hinweis")).toHaveTextContent(
      "Les membres paient seulement 35,00 € — vous économisez 15,00 €",
    );
    expect(screen.queryByText(/Non-membres/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Devenir membre" })).toHaveAttribute(
      "href",
      "/mon-adhesion",
    );
  });

  it("zeigt einem Mitglied keinen Werbehinweis, sondern weiter beide Preise", () => {
    renderMitRouter(
      <EvenementPreise
        evenement={preise({ cout: "35.00", cout_non_membre: "50.00", cout_applicable: "35.00" })}
      />,
    );
    expect(screen.queryByTestId("mitglieder-preis-hinweis")).not.toBeInTheDocument();
    expect(screen.getByText("Membres : 35,00 € / pers.")).toBeInTheDocument();
    expect(screen.getByText("Non-membres : 50,00 € / pers.")).toBeInTheDocument();
  });

  it("zeigt keinen Hinweis, wenn der Nicht-Mitglieder-Preis niedriger ist als der Mitgliederpreis", () => {
    renderMitRouter(
      <EvenementPreise
        evenement={preise({ cout: "35.00", cout_non_membre: "20.00", cout_applicable: "20.00" })}
      />,
    );
    expect(screen.queryByTestId("mitglieder-preis-hinweis")).not.toBeInTheDocument();
  });

  it("zeigt keinen Hinweis bei kostenlosen Veranstaltungen", () => {
    renderMitRouter(
      <EvenementPreise
        evenement={preise({ gratuit: true, cout: "0.00", cout_non_membre: "10.00" })}
      />,
    );
    expect(screen.queryByTestId("mitglieder-preis-hinweis")).not.toBeInTheDocument();
  });
});
