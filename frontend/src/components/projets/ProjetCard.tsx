import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import AnimatedProgress from "../ui/AnimatedProgress";
import ShareButton from "../ui/ShareButton";
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
        className="relative w-full cursor-pointer transition-transform duration-700 ease-in-out [transform-style:preserve-3d]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* Face avant — demande utilisateur 2026-09-22 : plus de hauteur fixe (h-[30rem]) ni de
            scroll interne sur la description. Cette div reste dans le flux normal (plus en
            `absolute inset-0`) : sa hauteur devient donc celle, naturelle, de son contenu, et
            c'est CETTE hauteur qui dimensionne la kachel — la description s'affiche donc en
            entier, jamais tronquée ni scrollable. `overflow-hidden` est conservé uniquement pour
            rogner les coins carrés du carousel d'images sur les coins arrondis de la kachel (plus
            aucun contenu ne dépasse la hauteur de cette div désormais, elle n'a donc plus de rôle
            de découpe verticale). Voir la face arrière ci-dessous pour comment elle se cale sur
            cette même hauteur, désormais dynamique. */}
        <div className="flex flex-col overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-card-gradient shadow-card [backface-visibility:hidden]">
          <ImageCarousel images={projet.images} titre={projet.titre} className="h-40 shrink-0" />
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-snug text-text-primary">
                {projet.titre}
              </h3>
              {/* Partage social (demande utilisateur 2026-09-25, "Es soll möglich sein Elemente
                  in Social Media zu Teilen") — ShareButton stoppe déjà lui-même la propagation
                  du clic (voir son implémentation), donc le retournement de la kachel (au clic
                  sur son corps) n'est pas déclenché par erreur. */}
              <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <ShareButton
                  path={`/projets?projet=${projet.id}`}
                  titre={projet.titre}
                  texte={projet.titre}
                />
                {onModifier && (
                  <button
                    type="button"
                    aria-label="Modifier"
                    onClick={(e) => {
                      e.stopPropagation();
                      onModifier(projet);
                    }}
                    className="rounded-cid p-1 text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
                  >
                    ✎
                  </button>
                )}
              </div>
            </div>
            <StatutProjetBadge statut={projet.statut} />

            {projet.cagnote_active && (
              <div className="mt-1 space-y-1">
                {progression !== null ? (
                  <>
                    {/* Barre de progression animée reprise de MyCID (merge de design
                        2026-09-25) — s'anime de 0 à `progression` dès l'entrée dans le
                        viewport, voir components/ui/AnimatedProgress.tsx. */}
                    <AnimatedProgress value={progression} />
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
                className={`text-xs ${
                  projet.echeance_depassee ? "text-status-dangerText" : "text-text-tertiary"
                }`}
              >
                {projet.echeance_depassee
                  ? t("echeance.depassee")
                  : t("echeance.limite", { date: formatDate(projet.date_limite) })}
              </p>
            )}

            {/* Plus de flex-1/overflow-y-auto ici (retiré le 2026-09-22) : la kachel n'a plus de
                hauteur fixe (voir la face avant ci-dessus), donc plus besoin de faire défiler la
                description dans une zone bornée — elle s'affiche simplement en entier, comme le
                reste du contenu. */}
            <div
              className="text-sm text-text-primary"
              // Texte riche produit par l'éditeur type Word (demande utilisateur point 1.2) —
              // affiché tel quel, jamais retapé côté client (voir RichTextEditor.tsx).
              dangerouslySetInnerHTML={{ __html: projet.description_html }}
            />

            <div className="mt-2 flex flex-wrap gap-2">
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
          className="absolute inset-0 flex flex-col overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-card-gradient p-4 shadow-card [backface-visibility:hidden]"
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
