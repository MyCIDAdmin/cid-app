/**
 * Cartes d'offres d'adhésion façon https://www.mycid.org/membership (demande utilisateur du
 * 2026-09-26, plan "Öffentliche mycid.org-Startseite" section C.2) — affichées à un visiteur/
 * membre non-actif tant qu'il n'a pas d'adhésion payée pour la campagne active (voir
 * MembershipSection.tsx, qui bascule vers le récapitulatif "déjà membre" sinon).
 *
 * Reprend les mêmes données que MonAdhesionPage.tsx (mêmes hooks, mêmes champs OffreAdhesion)
 * mais dans un layout de cartes tarifaires côte à côte plutôt qu'une liste dépliable — le
 * choix effectif d'une offre (rabais, souscription) reste réservé à /mon-adhesion, jamais
 * dupliqué ici (chaque carte ne fait que renvoyer vers cette page, décision utilisateur :
 * "Button 'Mitglieder Werden' ... Mit Absprung auf 'Meine Mitgliedshaft'").
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { CampagneAdhesion, OffreAdhesion } from "../../types/adhesion";
import { uebersetzt } from "../../utils/uebersetzung";

const ACCENTS = ["border-t-cat-1", "border-t-cat-2", "border-t-cat-3"] as const;
const ACCENT_NEUTRE = "border-t-text-tertiary/30";

function accentOffre(index: number): string {
  return ACCENTS[index] ?? ACCENT_NEUTRE;
}

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

interface MembershipOffersPublicProps {
  campagne: CampagneAdhesion;
}

export default function MembershipOffersPublic({ campagne }: MembershipOffersPublicProps) {
  const { t } = useTranslation("public");
  const offres: OffreAdhesion[] = campagne.offres
    .filter((o) => o.visible)
    .slice()
    .sort((a, b) => a.ordre - b.ordre);

  if (offres.length === 0) return null;

  // Repère cosmétique "Beliebt" (mycid.org/membership) — l'offre du milieu quand il y en a au
  // moins 3, jamais un champ backend dédié (aucun n'existe, voir OffreAdhesion.models) : purement
  // décoratif, ne change ni le prix ni le contenu de l'offre.
  const indexPopulaire = offres.length >= 3 ? Math.floor(offres.length / 2) : -1;

  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-text-primary">
        {t("membership.titre", { annee: campagne.annee })}
      </h2>
      <p className="mt-1 text-sm text-text-secondary">{t("membership.sous_titre")}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offres.map((offre, index) => {
          const avantages = offre.avantages.slice().sort((a, b) => a.ordre - b.ordre);
          const populaire = index === indexPopulaire;

          return (
            <div
              key={offre.id}
              className={`relative flex flex-col rounded-cid-lg border-t-4 bg-bg-primary p-5 shadow-sm ${accentOffre(
                index,
              )} ${populaire ? "ring-2 ring-ca" : ""}`}
            >
              {populaire && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ca px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  {t("membership.badge_populaire")}
                </span>
              )}
              <div className="text-center text-sm font-semibold uppercase tracking-wide text-text-tertiary">
                {uebersetzt(offre, "nom")}
              </div>
              <div className="mt-2 text-center font-display text-3xl font-bold text-text-primary">
                {formatMontant(offre.prix_plein)}
              </div>
              {offre.description && (
                <p className="mt-2 text-center text-sm text-text-secondary">
                  {uebersetzt(offre, "description")}
                </p>
              )}

              {avantages.length > 0 && (
                <ul className="mt-4 flex-1 space-y-1.5">
                  {avantages.map((av) => (
                    <li
                      key={av.ordre}
                      className="flex items-start gap-1.5 text-sm text-text-secondary"
                    >
                      <span className="shrink-0 font-bold text-ca" aria-hidden="true">
                        ✓
                      </span>
                      {av.texte_fr}
                    </li>
                  ))}
                </ul>
              )}

              <Link
                to="/mon-adhesion"
                className="mt-5 rounded-cid bg-ca px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-cad"
              >
                {t("membership.choisir")}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
