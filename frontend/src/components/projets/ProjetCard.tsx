import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { useContributeursProjet } from "../../hooks/useProjets";
import type { Projet } from "../../types/projets";
import ImageCarousel from "./ImageCarousel";
import StatutProjetBadge from "./StatutProjetBadge";

interface ProjetCardProps {
  projet: Projet;
  /** Affiché uniquement si fourni — le bouton "Contribuer" appelle ce callback plutôt que de
   * gérer lui-même le paiement (voir hooks/useCotisations.useContribuerProjet, utilisé par le
   * modal parent, ex. ProjetsPage). */
  onContribuer?: (projet: Projet) => void;
  /** Petit bouton d'édition en coin (Bureau Admin+) — absent côté page membre. */
  onModifier?: (projet: Projet) => void;
  /** Ouvre le rapport d'avancement (demande utilisateur point 7) — bouton séparé du
   * retournement de la kachel (point 5) pour ne pas faire porter 2 interactions différentes au
   * même geste de clic. */
  onVoirRapport?: (projet: Projet) => void;
}

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/**
 * Kachel de projet/action — demande utilisateur point 5 : "Wenn man auf der Kachel klick, dreht
 * sie auf der Rückseite. Die Rückseite Zeigt Details zu den Mitgliedern die beigetragen haben."
 * Flip CSS 3D pur (perspective/backface-visibility), pas de bibliothèque tierce — la face
 * arrière ne charge les contributeurs qu'une fois retournée (voir `flipped` ci-dessous), pour ne
 * jamais interroger /contributeurs/ pour des kacheln jamais consultées en détail (liste
 * potentiellement longue de projets sur la page membre).
 */
export default function ProjetCard({
  projet,
  onContribuer,
  onModifier,
  onVoirRapport,
}: ProjetCardProps) {
  const { t } = useTranslation("projets");
  const [flipped, setFlipped] = useState(false);

  const { data: contributeurs, isPending: contributeursEnChargement } = useContributeursProjet(
    flipped ? projet.id : undefined,
  );

  const progression =
    projet.objectif_montant && Number(projet.objectif_montant) > 0
      ? Math.min(100, (Number(projet.montant_collecte) / Number(projet.objectif_montant)) * 100)
      : null;

  function basculer() {
    setFlipped((f) => !f);
  }

  function surTouche(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      basculer();
    }
  }

  return (
    <div className="[perspective:1200px]">
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={(flipped ? t("carte.retourner_devant") : t("carte.retourner")) ?? ""}
        onClick={basculer}
        onKeyDown={surTouche}
        className="relative h-[30rem] w-full cursor-pointer transition-transform duration-700 ease-in-out [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* Face avant */}
        <div className="absolute inset-0 flex flex-col overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-bg-primary shadow-sm [backface-visibility:hidden]">
          <ImageCarousel images={projet.images} titre={projet.titre} className="h-40 shrink-0" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="flex shrink-0 items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-snug text-text-primary">
                {projet.titre}
              </h3>
              {onModifier && (
                <button
                  type="button"
                  aria-label="Modifier"
                  onClick={(e) => {
                    e.stopPropagation();
                    onModifier(projet);
                  }}
                  className="shrink-0 rounded-cid p-1 text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
                >
                  ✎
                </button>
              )}
            </div>
            <StatutProjetBadge statut={projet.statut} />

            {projet.cagnote_active && (
              <div className="mt-1 shrink-0 space-y-1">
                {progression !== null ? (
                  <>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                      <div
                        className="h-full rounded-full bg-ca transition-all"
                        style={{ width: `${progression}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-secondary">
                      {t("cagnote.collecte", {
                        montant: formatMontant(projet.montant_collecte),
                        objectif: formatMontant(projet.objectif_montant as string),
                      })}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-text-secondary">
                    {t("cagnote.collecte_sans_objectif", {
                      montant: formatMontant(projet.montant_collecte),
                    })}
                  </p>
                )}
              </div>
            )}

            {projet.date_limite && (
              <p
                className={`shrink-0 text-xs ${
                  projet.echeance_depassee ? "text-status-dangerText" : "text-text-tertiary"
                }`}
              >
                {projet.echeance_depassee
                  ? t("echeance.depassee")
                  : t("echeance.limite", { date: formatDate(projet.date_limite) })}
              </p>
            )}

            {/* flex-1 + overflow-y-auto (plutôt qu'un ancien `mt-auto` sans limite de hauteur) :
                une description longue défile désormais À L'INTÉRIEUR de cette zone plutôt que de
                pousser la rangée de boutons ci-dessous hors des limites de la kachel — bug
                remonté le 2026-09-22 ("Der Button zum freien Beitrag ist unsichtbar"), la
                hauteur fixe de la kachel (overflow-hidden sur la face avant) rognait alors
                silencieusement le bouton "Contribuer" dès que le texte riche dépassait l'espace
                restant. */}
            <div
              className="flex-1 overflow-y-auto text-sm text-text-primary"
              // Texte riche produit par l'éditeur type Word (demande utilisateur point 1.2) —
              // affiché tel quel, jamais retapé côté client (voir RichTextEditor.tsx).
              dangerouslySetInnerHTML={{ __html: projet.description_html }}
            />

            <div className="mt-2 flex shrink-0 flex-wrap gap-2">
              {projet.cagnote_active && !projet.echeance_depassee && onContribuer && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onContribuer(projet);
                  }}
                  className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
                >
                  {t("cagnote.contribuer")}
                </button>
              )}
              {onVoirRapport && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onVoirRapport(projet);
                  }}
                  className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary"
                >
                  {t("rapport.voir")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Face arrière — demande utilisateur point 5 */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-bg-primary p-4 shadow-sm [backface-visibility:hidden]"
          style={{ transform: "rotateY(180deg)" }}
        >
          <h3 className="text-base font-semibold text-text-primary">{t("contributeurs.titre")}</h3>
          <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {contributeursEnChargement && (
              <p className="text-sm text-text-secondary">{t("contributeurs.chargement")}</p>
            )}
            {!contributeursEnChargement && contributeurs?.length === 0 && (
              <p className="text-sm text-text-secondary">{t("contributeurs.aucun")}</p>
            )}
            {contributeurs?.map((c) => (
              <div key={c.membre.id} className="flex items-center gap-2">
                {c.membre.photo ? (
                  <img
                    src={c.membre.photo}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-xs font-medium text-text-secondary">
                    {c.membre.prenom.charAt(0)}
                    {c.membre.nom.charAt(0)}
                  </div>
                )}
                <span className="flex-1 truncate text-sm text-text-primary">
                  {c.membre.prenom} {c.membre.nom}
                </span>
                <span className="text-sm font-medium text-text-primary">
                  {formatMontant(c.montant_total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
