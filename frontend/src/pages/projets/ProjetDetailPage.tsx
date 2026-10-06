/**
 * Page de détail d'un projet (demande utilisateur 2026-09-26 : porter la structure de
 * https://www.mycid.org/projects — le bouton "View Project" y ouvre une page dédiée par projet,
 * jamais une modale par-dessus la liste). Équivalent membre de "Voir le rapport"
 * (ProjetCard.onVoirRapport, voir ProjetsPage) : image/statut/année, progression de la cagnote,
 * description intégrale (jamais tronquée ici, contrairement à la kachel — voir docstring
 * ProjetCard sur line-clamp-3), bouton "Contribuer" (ModaleContribution, même composant partagé
 * que ProjetsPage) et le rapport d'avancement en lecture seule (RapportListe, partagé avec
 * RapportModal). La gestion du Projet lui-même (créer/modifier/statut/cagnote/échéance/
 * responsable, ajout de mises à jour) reste exclusivement dans /admin/projets (Gestion des
 * projets) — cette page ne branche ni `onModifier`, ni le formulaire d'ajout de RapportModal,
 * exactement comme ProjetsPage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import ModaleContribution from "../../components/projets/ModaleContribution";
import RapportListe from "../../components/projets/RapportListe";
import SichtbarkeitBadge from "../../components/projets/SichtbarkeitBadge";
import StatutProjetBadge from "../../components/projets/StatutProjetBadge";
import ImageCarousel from "../../components/projets/ImageCarousel";
import AnimatedProgress from "../../components/ui/AnimatedProgress";
import ShareButton from "../../components/ui/ShareButton";
import { useMisesAJourProjet, useProjet } from "../../hooks/useProjets";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function ProjetDetailPage() {
  const { t } = useTranslation("projets");
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const projetQuery = useProjet(id);
  const misesAJourQuery = useMisesAJourProjet(id);
  const projet = projetQuery.data;

  const [contributionOuverte, setContributionOuverte] = useState(false);

  const progression =
    projet?.objectif_montant && Number(projet.objectif_montant) > 0
      ? Math.min(100, (Number(projet.montant_collecte) / Number(projet.objectif_montant)) * 100)
      : null;
  const objectifAtteint = progression !== null && progression >= 100;
  const proposeContribution = Boolean(projet && projet.cagnote_active && !projet.echeance_depassee);

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/projets" className="mb-3 inline-block text-xs text-ca hover:underline">
        {t("detail.retour_liste")}
      </Link>

      {projetQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("page.chargement")}</p>
      )}
      {projetQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("page.erreur_chargement")}</p>
      )}

      {projet && (
        <>
          <div className="overflow-hidden rounded-cid-lg border border-text-tertiary/20 bg-card-gradient shadow-card">
            <div className="relative">
              <ImageCarousel
                images={projet.images}
                titre={projet.titre}
                className="h-56 shrink-0"
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
                <span className="pointer-events-auto flex gap-1 drop-shadow">
                  <StatutProjetBadge statut={projet.statut} />
                  <SichtbarkeitBadge sichtbarkeit={projet.sichtbarkeit} />
                </span>
                <span className="pointer-events-auto rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                  {new Date(projet.created_at).getFullYear()}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h1 className="text-lg font-bold leading-snug text-text-primary">{projet.titre}</h1>
                <div className="shrink-0">
                  <ShareButton
                    path={`/projets/${projet.id}`}
                    titre={projet.titre}
                    texte={projet.titre}
                  />
                </div>
              </div>

              {projet.responsable_detail && (
                <p className="text-xs text-text-tertiary">
                  {t("detail.responsable", {
                    nom: `${projet.responsable_detail.prenom} ${projet.responsable_detail.nom}`,
                  })}
                </p>
              )}

              {projet.darf_arbeitsbereich && (
                <Link
                  to={`/projets/${projet.id}/arbeitsbereich`}
                  className="self-start rounded-cid border border-ca px-3 py-1.5 text-sm font-medium text-ca hover:bg-ca/10"
                >
                  {t("arbeitsbereich.oeffnen")}
                </Link>
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

              {projet.cagnote_active && (
                <div className="space-y-1.5 rounded-cid border border-text-tertiary/20 p-3">
                  {progression !== null ? (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span className="text-base font-semibold text-ca">
                          {formatMontant(projet.montant_collecte)}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {objectifAtteint
                            ? t("cagnote.objectif_atteint")
                            : `${Math.round(progression)}%`}
                        </span>
                      </div>
                      <AnimatedProgress value={progression} />
                    </>
                  ) : (
                    <p className="text-sm text-text-secondary">
                      {t("cagnote.collecte_sans_objectif", {
                        montant: formatMontant(projet.montant_collecte),
                      })}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-text-tertiary">
                    <span>{t("cagnote.nb_contributeurs", { count: projet.nb_contributeurs })}</span>
                    {projet.objectif_montant && (
                      <span>{formatMontant(projet.objectif_montant)}</span>
                    )}
                  </div>
                </div>
              )}

              {proposeContribution && (
                <button
                  type="button"
                  onClick={() => setContributionOuverte(true)}
                  className="w-full rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad"
                >
                  {t("cagnote.contribuer")}
                </button>
              )}

              {/* Texte intégral, jamais tronqué ici (contrairement à la kachel de /projets — voir
                  docstring ProjetCard sur line-clamp-3) : cette page est précisément l'endroit où
                  le texte complet reste consultable. */}
              <div>
                <h2 className="mb-1 text-sm font-semibold text-text-primary">
                  {t("detail.a_propos")}
                </h2>
                <div
                  className="prose prose-sm max-w-none text-text-primary"
                  dangerouslySetInnerHTML={{ __html: projet.description_html }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-base font-bold text-text-primary">{t("rapport.titre")}</h2>
            <RapportListe
              misesAJour={misesAJourQuery.data?.results}
              chargement={misesAJourQuery.isLoading}
            />
          </div>
        </>
      )}

      {contributionOuverte && projet && (
        <ModaleContribution
          projet={projet}
          onClose={() => setContributionOuverte(false)}
          onPayer={(cotisationId) => navigate(`/cotisation?paiement=${cotisationId}`)}
        />
      )}
    </div>
  );
}
