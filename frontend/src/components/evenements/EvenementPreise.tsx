/**
 * Preise auf der Kachel einer Veranstaltung (Fehlermeldung vom 2026-10-08 : "Wenn ich Preise
 * für Nicht-Mitglieder und für Begleitpersonen definiere, wird der Preis ... und die
 * Altersgrenze Kind in der Kachel nicht angezeigt").
 *
 * Gemeinsam genutzt von EvenementsPage (Mitglieder-Bereich) und PublicEvenementsTab
 * (Startseite) — beide Kacheln zeigen dadurch dieselben Angaben :
 *   - kostenlos, ODER ein Preis pro Person ; weicht `cout_non_membre` vom Mitgliedspreis ab,
 *     werden beide Preise getrennt ausgewiesen (leer = gleicher Preis, siehe Evenement.cout_pour) ;
 *   - ist `accompagnants_payants` aktiv, die Preise für erwachsene und kindliche Begleitpersonen
 *     samt Altersgrenze (nur zur Orientierung, siehe Evenement.age_limite_accompagnant_enfant).
 * Der tatsächlich berechnete Betrag kommt weiterhin ausschließlich vom Server (CLAUDE.md §8).
 */
import { useTranslation } from "react-i18next";

import type { Evenement } from "../../types/evenements";
import { mitgliederPreisIstGuenstiger } from "../../utils/mitgliederPreis";
import MitgliederPreisHinweis from "../MitgliederPreisHinweis";
import { formatMontant } from "./ModaleInscription";

type PreisFelder = Pick<
  Evenement,
  | "gratuit"
  | "cout"
  | "cout_non_membre"
  | "cout_applicable"
  | "accompagnants_payants"
  | "prix_accompagnant_adulte"
  | "prix_accompagnant_enfant"
  | "age_limite_accompagnant_enfant"
>;

export default function EvenementPreise({ evenement }: { evenement: PreisFelder }) {
  const { t } = useTranslation("evenements");

  const preisUnterschied =
    !evenement.gratuit &&
    evenement.cout_non_membre !== null &&
    evenement.cout_non_membre !== undefined &&
    Number(evenement.cout_non_membre) !== Number(evenement.cout);

  // Nicht-Mitglied (der Server hat `cout_applicable` auf den Nicht-Mitglieder-Preis gesetzt) UND
  // der Mitgliederpreis ist günstiger : statt beider Preise den eigenen Preis zeigen und den
  // Mitgliederpreis als Hinweis hervorheben (Anfrage vom 2026-10-11).
  const mitgliederHinweis =
    preisUnterschied &&
    Number(evenement.cout_applicable) === Number(evenement.cout_non_membre) &&
    mitgliederPreisIstGuenstiger(evenement.cout, evenement.cout_applicable);

  const montantOderKostenlos = (montant: string) =>
    Number(montant) === 0 ? t("gratuit") : formatMontant(montant);

  return (
    <>
      {evenement.gratuit && <span>{t("gratuit")}</span>}
      {!evenement.gratuit && (!preisUnterschied || mitgliederHinweis) && (
        <span>{t("cout_par_personne", { cout: formatMontant(evenement.cout_applicable) })}</span>
      )}
      {mitgliederHinweis && (
        <MitgliederPreisHinweis
          mitgliederPreis={evenement.cout}
          aktuellerPreis={evenement.cout_applicable}
        />
      )}
      {preisUnterschied && !mitgliederHinweis && (
        <>
          <span>{t("preis_mitglieder", { cout: montantOderKostenlos(evenement.cout) })}</span>
          <span>
            {t("preis_nichtmitglieder", {
              cout: montantOderKostenlos(evenement.cout_non_membre as string),
            })}
          </span>
        </>
      )}
      {evenement.accompagnants_payants && (
        <span>
          {t("preis_begleitpersonen", {
            adulte: montantOderKostenlos(evenement.prix_accompagnant_adulte),
            enfant: montantOderKostenlos(evenement.prix_accompagnant_enfant),
            age: evenement.age_limite_accompagnant_enfant,
          })}
        </span>
      )}
    </>
  );
}
