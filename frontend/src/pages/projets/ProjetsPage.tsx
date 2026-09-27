/**
 * Page membre "Projets & Actions" (module ajouté le 2026-09-22, demande utilisateur — voir
 * apps.projets.models docstring de module pour les 8 points). Restructurée le 2026-09-26 (demande
 * utilisateur : porter la structure/layout/style de https://www.mycid.org/projects) : bandeau
 * d'en-tête, tuiles KPI (ProjetsKpiTiles), onglets de filtre All/Active/Completed
 * (ProjetsFiltreTabs) puis grille responsive de kacheln (ProjetCard, retournement pour voir les
 * contributeurs — comportement INCHANGÉ, voir docstring ProjetCard).
 *
 * "Voir le rapport" (ProjetCard.onVoirRapport) navigue désormais vers /projets/:id
 * (ProjetDetailPage) au lieu d'ouvrir RapportModal en superposition — même comportement que
 * "View Project" sur mycid.org, qui ouvre une page dédiée. RapportModal (avec son formulaire
 * d'ajout) reste exclusivement utilisée par /admin/projets (Gestion des projets) : la gestion
 * complète du Projet lui-même (créer/modifier/statut/cagnote/échéance/responsable, ajout de
 * mises à jour de rapport) reste réservée à ce module admin, jamais à cette page membre — pour
 * la même raison, `onModifier` n'est volontairement pas branché sur ProjetCard ici.
 *
 * ModaleContribution (points 2/3, création d'une Cotisation en attente puis navigation vers
 * `/cotisation?paiement=<id>`) est désormais un composant partagé (components/projets/
 * ModaleContribution.tsx) plutôt qu'inline ici, pour être réutilisable aussi depuis
 * ProjetDetailPage (bouton "Contribuer" équivalent au "Donate Now" de mycid.org).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import ModaleContribution from "../../components/projets/ModaleContribution";
import ProjetCard from "../../components/projets/ProjetCard";
import ProjetsFiltreTabs, { type FiltreProjet } from "../../components/projets/ProjetsFiltreTabs";
import ProjetsKpiTiles from "../../components/projets/ProjetsKpiTiles";
import { useProjets } from "../../hooks/useProjets";
import { useAuthStore } from "../../store/authStore";
import type { Projet } from "../../types/projets";

/** Correspondance onglet de filtre -> StatutProjet backend (voir docstring ProjetsFiltreTabs pour
 * pourquoi "annule" n'a pas d'onglet dédié). */
const STATUT_PAR_FILTRE: Record<Exclude<FiltreProjet, "tous">, Projet["statut"]> = {
  actifs: "en_cours",
  termines: "termine",
};

export default function ProjetsPage() {
  const { t } = useTranslation("projets");
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const projetsQuery = useProjets();
  const [projetContribution, setProjetContribution] = useState<Projet | null>(null);
  const [filtre, setFiltre] = useState<FiltreProjet>("tous");

  // Cette page est désormais aussi embarquée dans l'onglet public "Projekte" (Phase D, page
  // d'accueil publique, demande utilisateur : "Spenden-Button führt bei fehlendem Login auf
  // /login") — useContribuerProjet exige un membre authentifié côté backend (voir
  // apps.cotisations.views), donc un visiteur anonyme est renvoyé se connecter au lieu d'ouvrir
  // une modale vouée à échouer avec un 401.
  function ouvrirContribution(projet: Projet) {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setProjetContribution(projet);
  }

  // `data?.results` change de référence à chaque re-render tant que la query n'est pas résolue
  // (nouveau tableau vide `?? []`) — dépendance directe sur `projetsQuery.data` (stable tant que
  // React Query ne re-fetch pas) plutôt que sur ce tableau dérivé, pour ne pas recalculer le
  // useMemo à chaque render.
  const projets = useMemo(() => projetsQuery.data?.results ?? [], [projetsQuery.data]);
  const projetsFiltres = useMemo(() => {
    if (filtre === "tous") return projets;
    return projets.filter((p) => p.statut === STATUT_PAR_FILTRE[filtre]);
  }, [projets, filtre]);

  return (
    <div>
      {/* Bandeau d'en-tête (demande utilisateur 2026-09-26 : porter la structure de
          https://www.mycid.org/projects) — titre + sous-titre centrés au-dessus des tuiles KPI. */}
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-text-primary">{t("page.titre")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("page.sous_titre")}</p>
      </div>

      {projetsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("page.chargement")}</p>
      )}
      {projetsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("page.erreur_chargement")}</p>
      )}

      {!projetsQuery.isLoading && !projetsQuery.isError && (
        <>
          <div className="mb-6">
            <ProjetsKpiTiles projets={projets} />
          </div>

          <div className="mb-6">
            <ProjetsFiltreTabs valeur={filtre} onChange={setFiltre} />
          </div>

          {projetsFiltres.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("page.aucun_projet")}</p>
          )}

          {/* Grille responsive (remplace le 2026-09-26 l'ancien empilement mono-colonne
              max-w-2xl) — même pattern que CataloguePage/EvenementsPage : sm:2 colonnes,
              lg:3 colonnes. stagger-children (repris de MyCID, merge de design 2026-09-25) :
              apparition échelonnée à l'affichage de la liste. */}
          <div className="grid gap-4 stagger-children sm:grid-cols-2 lg:grid-cols-3">
            {projetsFiltres.map((projet) => (
              <ProjetCard
                key={projet.id}
                projet={projet}
                onContribuer={ouvrirContribution}
                onVoirRapport={(p) => navigate(`/projets/${p.id}`)}
              />
            ))}
          </div>
        </>
      )}

      {projetContribution && (
        <ModaleContribution
          projet={projetContribution}
          onClose={() => setProjetContribution(null)}
          onPayer={(cotisationId) => navigate(`/cotisation?paiement=${cotisationId}`)}
        />
      )}
    </div>
  );
}
