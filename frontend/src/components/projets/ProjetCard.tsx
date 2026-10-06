import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import AnimatedProgress from "../ui/AnimatedProgress";
import ShareButton from "../ui/ShareButton";
import { useContributeursProjet } from "../../hooks/useProjets";
import type { Projet } from "../../types/projets";
import ImageCarousel from "./ImageCarousel";
import SichtbarkeitBadge from "./SichtbarkeitBadge";
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

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** Icônes minimalistes maison (mêmes conventions que le SVG de repli d'ImageCarousel) — pas de
 * bibliothèque d'icônes dans le projet, voir package.json. */
function IconePersonnes() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor">
      <circle cx="9" cy="8" r="3" strokeWidth="1.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.3" strokeWidth="1.5" />
      <path d="M15.5 14.2c2.5.4 4.5 2.6 4.5 5.8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconeCible() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="8.5" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4.5" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconeCoeur() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="currentColor">
      <path d="M12 20.6l-1.4-1.3C5.4 14.7 2 11.6 2 7.9 2 5.1 4.2 3 6.9 3c1.5 0 3 .7 3.9 1.9C11.7 3.7 13.2 3 14.7 3 17.4 3 19.6 5.1 19.6 7.9c0 3.7-3.4 6.8-8.6 11.5l-1 .9z" />
    </svg>
  );
}

function IconeFleche() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Kachel de projet/action — demande utilisateur point 5 : "Wenn man auf der Kachel klick, dreht
 * sie auf der Rückseite. Die Rückseite Zeigt Details zu den Mitgliedern die beigetragen haben."
 * Flip CSS 3D pur (perspective/backface-visibility), pas de bibliothèque tierce — la face
 * arrière ne charge les contributeurs qu'une fois retournée (voir `flipped` ci-dessous), pour ne
 * jamais interroger /contributeurs/ pour des kacheln jamais consultées en détail (liste
 * potentiellement longue de projets sur la page membre). CONSERVÉ tel quel lors du portage de
 * structure/style depuis https://www.mycid.org/projects (demande utilisateur 2026-09-26,
 * "das Drehen um Contributeur zu zeigen soll beibehalten werden") — mycid.org n'a pas cette
 * interaction, seule la face avant (image/statut/année/description/cagnote/CTA) en reprend
 * l'habillage visuel ci-dessous.
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
  const objectifAtteint = progression !== null && progression >= 100;
  // Pas de champ "année" dédié côté modèle (Projet n'a que created_at/date_limite, voir
  // types/projets.ts) — dérivée de created_at pour la pastille d'année reprise de mycid.org
  // (chaque kachel y affiche l'année du projet en haut à droite de l'image), sans changement de
  // schéma backend.
  const annee = new Date(projet.created_at).getFullYear();
  const proposeContribution = Boolean(
    projet.cagnote_active && !projet.echeance_depassee && onContribuer,
  );

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
        {/* Face avant — habillage repris de https://www.mycid.org/projects (demande utilisateur
            2026-09-26) : pastilles statut/année superposées à l'image, description tronquée
            (line-clamp-3, le texte complet reste consultable via "Voir le rapport" → la nouvelle
            page /projets/:id, voir ProjetDetailPage), ligne d'icônes contributeurs/objectif. Pas
            de hauteur fixe pour autant (`overflow-hidden` sert toujours uniquement à rogner les
            coins carrés du carousel sur les coins arrondis de la kachel) : la description
            tronquée à 3 lignes borne déjà naturellement la hauteur, contrairement à l'ancien texte
            intégral qui nécessitait de laisser la kachel s'étirer librement (voir la face arrière
            ci-dessous pour comment elle se cale sur cette même hauteur). */}
        <div className="flex flex-col overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-card-gradient shadow-card [backface-visibility:hidden]">
          <div className="relative">
            <ImageCarousel images={projet.images} titre={projet.titre} className="h-44 shrink-0" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
              <span className="pointer-events-auto flex gap-1 drop-shadow">
                <StatutProjetBadge statut={projet.statut} />
                <SichtbarkeitBadge sichtbarkeit={projet.sichtbarkeit} />
              </span>
              <span className="pointer-events-auto rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                {annee}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold leading-snug text-text-primary">
                {projet.titre}
              </h3>
              {/* Partage social (demande utilisateur 2026-09-25, "Es soll möglich sein Elemente
                  in Social Media zu Teilen") — ShareButton stoppe déjà lui-même la propagation
                  du clic (voir son implémentation), donc le retournement de la kachel (au clic
                  sur son corps) n'est pas déclenché par erreur. */}
              <div
                className="flex shrink-0 items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
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

            {/* Texte intégral déplacé sur /projets/:id (section "À propos du projet"/"Über dieses
                Projekt", voir ProjetDetailPage) — line-clamp-3 (Tailwind core depuis 3.3, déjà
                utilisé ailleurs, voir CataloguePage.tsx) borne ici la kachel à 3 lignes, comme sur
                mycid.org. */}
            <div
              className="line-clamp-3 text-sm text-text-primary"
              // Texte riche produit par l'éditeur type Word (demande utilisateur point 1.2) —
              // affiché tel quel, jamais retapé côté client (voir RichTextEditor.tsx).
              dangerouslySetInnerHTML={{ __html: projet.description_html }}
            />

            {projet.cagnote_active && (
              <div className="mt-1 space-y-1.5">
                {progression !== null ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-ca">
                        {formatMontant(projet.montant_collecte)}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {objectifAtteint
                          ? t("cagnote.objectif_atteint")
                          : `${Math.round(progression)}%`}
                      </span>
                    </div>
                    {/* Barre de progression animée reprise de MyCID (merge de design
                        2026-09-25) — s'anime de 0 à `progression` dès l'entrée dans le
                        viewport, voir components/ui/AnimatedProgress.tsx. */}
                    <AnimatedProgress value={progression} />
                  </>
                ) : (
                  <p className="text-xs text-text-secondary">
                    {t("cagnote.collecte_sans_objectif", {
                      montant: formatMontant(projet.montant_collecte),
                    })}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <IconePersonnes />
                    {t("cagnote.nb_contributeurs", { count: projet.nb_contributeurs })}
                  </span>
                  {projet.objectif_montant && (
                    <span className="flex items-center gap-1">
                      <IconeCible />
                      {formatMontant(projet.objectif_montant)}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-2 flex gap-2">
              {proposeContribution && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onContribuer?.(projet);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad ${
                    onVoirRapport ? "flex-1" : "w-full"
                  }`}
                >
                  <IconeCoeur />
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
                  className={`flex items-center justify-center gap-1.5 rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary ${
                    proposeContribution ? "flex-1" : "w-full"
                  }`}
                >
                  {t("rapport.voir")}
                  <IconeFleche />
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
