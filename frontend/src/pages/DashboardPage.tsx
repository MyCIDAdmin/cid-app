/**
 * Tableau de bord (mockup #pg-dashboard, FDD §3.6/§13, Release Plan §2.3 — "Dashboard : Tous
 * rôles, vue personnalisée selon rôle"). Entièrement composé à partir d'endpoints déjà
 * existants (evenements, cotisations, vote, communaute, stats) — aucun nouvel endpoint backend
 * n'a été nécessaire.
 *
 * Personnalisation par rôle (comme le mockup, qui bascule bandeau + tuiles selon le rôle démo) :
 * un rôle Bureau Admin+ (`estGestion`) voit des indicateurs club (membres actifs, taux de
 * collecte des cotisations, via apps.stats) ; en dessous, les tuiles restent volontairement
 * personnelles (mes inscriptions en attente, ma cotisation) plutôt que d'exposer les mêmes
 * totaux financiers — `apps.stats.StatsPermission` les réserve de toute façon à Bureau Admin+
 * côté API (403 sinon, voir useStatsFinancier/useStatsMembres ci-dessous, `enabled: estGestion`).
 *
 * Écart assumé par rapport au mockup — "Activité récente" : le mockup y affiche des actions
 * d'AUTRES membres (inscriptions, renouvellements de cotisation...), ce qui exposerait des
 * données personnelles/financières d'autrui à tout rôle, à l'inverse du principe IDOR appliqué
 * partout ailleurs dans l'app (SCD §2.3 A01 — un Membre ne voit que ses propres inscriptions/
 * cotisations, voir InscriptionViewSet/CotisationViewSet.get_queryset). Remplacé ici par
 * "Dernières publications" (Fil d'actualité) : contenu déjà public par construction (le module
 * Fil est un mur social partagé, voir apps.communaute), donc sans ce problème.
 *
 * "Mes projets" (mockup, 4ᵉ tuile KPI) n'a pas d'équivalent : aucune app.projets n'existe dans
 * ce dépôt (voir CLAUDE.md §3) — jamais construite malgré sa mention au FDD/Release Plan comme
 * lecture seule R1/gestion R2. Remplacée par une tuile "Votes en cours" (apps.vote, déjà
 * implémenté) plutôt que de laisser une tuile vide ou d'inventer un module non demandé.
 *
 * Animations (demande utilisateur 2026-09-25, "dynamischer und bewegender Kacheln und
 * Kennzahlen") : voir KpiTile ci-dessous pour le détail (count-up via useCountUp, icône,
 * survol) ; les listes (événements, ma situation, publications) gagnent une légère
 * apparition en fondu (animate-slide-in-fade, déjà utilisée par le Live-Ticker) à leur
 * montage. Pas de légende ajoutée : aucune couleur de cette page ne porte seule une
 * information — chaque badge de statut affiche déjà son texte (voir STATUT_STYLES).
 */
import {
  IconCalendarEvent,
  IconChecklist,
  IconClockHour4,
  IconReceipt2,
  IconUsers,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { useCountUp } from "../hooks/useCountUp";
import { useMesCotisations } from "../hooks/useCotisations";
import { usePublications } from "../hooks/useCommunaute";
import { useEvenements, useInscriptions } from "../hooks/useEvenements";
import { useStatsFinancier, useStatsMembres } from "../hooks/useStats";
import { useSessionVoteActive } from "../hooks/useVote";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../store/authStore";
import type { Cotisation, StatutCotisation, TypeArticle } from "../types/cotisation";
import type { Evenement } from "../types/evenements";

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "long" });
}

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

// Ligne la plus récente d'un type donné pour l'année en cours — l'historique (`useMesCotisations`)
// est déjà trié -created_at côté serveur (CotisationCursorPagination), donc le premier trouvé est
// le bon en cas de doublon (ex. une cotisation retentée après échec).
function derniereCotisation(
  cotisations: Cotisation[] | undefined,
  type: TypeArticle,
  annee: number,
): Cotisation | undefined {
  return cotisations?.find((c) => c.type_article === type && c.annee === annee);
}

const STATUT_STYLES: Record<StatutCotisation, string> = {
  payee: "bg-status-successBg text-status-successText",
  en_attente: "bg-status-warningBg text-status-warningText",
  echouee: "bg-status-dangerBg text-status-dangerText",
  remboursee: "bg-bg-tertiary text-text-secondary",
  annulee: "bg-bg-tertiary text-text-secondary",
};

// "dynamischer und bewegender" (demande utilisateur 2026-09-25) — chaque tuile anime sa valeur
// numérique (useCountUp, l'ancienne -> la nouvelle valeur) plutôt que de se contenter d'un
// remplacement instantané, gagne une légère élévation au survol, et porte une icône propre à sa
// nature pour rester identifiable en un coup d'œil même sans lire le libellé. Pas de flèche de
// tendance (hausse/baisse) : aucune donnée de période précédente n'existe côté API pour ces
// indicateurs (voir apps.stats) — en ajouter une aurait exigé d'inventer une comparaison
// fictive, ce qu'on évite plutôt que de l'implémenter à moitié.
function KpiTile({
  label,
  value,
  suffix,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  delta?: string;
  icon: typeof IconUsers;
}) {
  const valeurNumerique = typeof value === "number" ? value : undefined;
  const valeurAnimee = useCountUp(valeurNumerique);
  const texteValeur =
    typeof value === "number"
      ? `${Math.round(valeurAnimee ?? value).toLocaleString("de-DE")}${suffix ?? ""}`
      : value;

  return (
    <div className="group rounded-cid-lg bg-bg-primary p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-text-secondary">{label}</span>
        <Icon
          size={16}
          className="shrink-0 text-cad/50 transition-transform duration-200 group-hover:scale-110 group-hover:text-cad"
          aria-hidden="true"
        />
      </div>
      <div className="text-xl font-bold tabular-nums text-text-primary">{texteValeur}</div>
      {delta && <div className="mt-0.5 text-[11px] text-text-tertiary">{delta}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  // AHM-52 : prénom plutôt que l'email en accueil — un compte sans fiche
  // Membre liée (superuser, RH créé hors auto-inscription) n'a pas de
  // prénom, on retombe alors sur l'email.
  const prenomAffiche = user?.prenom || user?.email;
  const estGestion = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);
  const anneeCourante = new Date().getFullYear();

  const evenementsQuery = useEvenements({ date_apres: aujourdhuiISO() });
  const cotisationsQuery = useMesCotisations();
  const inscriptionsAttenteQuery = useInscriptions({ statut: "en_attente_paiement" });
  const voteActifQuery = useSessionVoteActive();
  const publicationsQuery = usePublications();
  const statsMembresQuery = useStatsMembres({}, { enabled: estGestion });
  const statsFinancierQuery = useStatsFinancier({}, { enabled: estGestion });

  const prochainsEvenements = useMemo<Evenement[]>(() => {
    const resultats = evenementsQuery.data?.results ?? [];
    return [...resultats]
      .sort((a, b) => a.date_evenement.localeCompare(b.date_evenement))
      .slice(0, 3);
  }, [evenementsQuery.data]);

  const cotisationAnnuelle = derniereCotisation(
    cotisationsQuery.data?.results,
    "cotisation",
    anneeCourante,
  );
  const fraisAdhesion = derniereCotisation(
    cotisationsQuery.data?.results,
    "adhesion",
    anneeCourante,
  );
  const inscriptionsEnAttente = inscriptionsAttenteQuery.data?.results ?? [];
  const publications = publicationsQuery.data?.results.slice(0, 3) ?? [];
  const voteOuvert = (voteActifQuery.data?.results.length ?? 0) > 0;
  const evenementsAVenirNombre = evenementsQuery.data?.results.length ?? 0;

  const bandeauMembre = !cotisationAnnuelle
    ? t("bandeau_membre_non_reglee", { annee: anneeCourante })
    : cotisationAnnuelle.statut === "payee"
      ? t("bandeau_membre_a_jour", { annee: anneeCourante })
      : t("bandeau_membre_en_attente", { annee: anneeCourante });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text-primary">{t("titre")}</h1>
      <p className="text-sm text-text-secondary">{t("bienvenue", { prenom: prenomAffiche })}</p>

      <div
        className={`rounded-cid p-3 text-sm ${
          estGestion
            ? "bg-status-infoBg text-status-infoText"
            : cotisationAnnuelle?.statut === "payee"
              ? "bg-status-successBg text-status-successText"
              : "bg-status-warningBg text-status-warningText"
        }`}
      >
        {estGestion ? t("bandeau_admin") : bandeauMembre}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {estGestion ? (
          <>
            <KpiTile
              icon={IconUsers}
              label={t("kpi.membres_actifs")}
              value={statsMembresQuery.data?.actifs ?? "—"}
            />
            <KpiTile
              icon={IconReceipt2}
              label={t("kpi.taux_collecte")}
              value={statsFinancierQuery.data?.taux_collecte ?? "—"}
              suffix=" %"
              delta={
                statsFinancierQuery.data
                  ? t("kpi.cotisations_en_attente", {
                      montant: formatMontant(statsFinancierQuery.data.cotisations_en_attente),
                    })
                  : undefined
              }
            />
            <KpiTile
              icon={IconCalendarEvent}
              label={t("kpi.evenements_a_venir")}
              value={evenementsAVenirNombre}
              delta={
                prochainsEvenements[0]
                  ? formatDateCourte(prochainsEvenements[0].date_evenement)
                  : t("kpi.aucun_evenement_prevu")
              }
            />
            <KpiTile
              icon={IconChecklist}
              label={t("kpi.votes_en_cours")}
              value={voteOuvert ? 1 : 0}
              delta={voteOuvert ? t("kpi.vote_ouvert") : t("kpi.aucun_vote")}
            />
          </>
        ) : (
          <>
            <KpiTile
              icon={IconCalendarEvent}
              label={t("kpi.evenements_a_venir")}
              value={evenementsAVenirNombre}
              delta={
                prochainsEvenements[0]
                  ? formatDateCourte(prochainsEvenements[0].date_evenement)
                  : t("kpi.aucun_evenement_prevu")
              }
            />
            <KpiTile
              icon={IconClockHour4}
              label={t("kpi.mes_inscriptions_attente")}
              value={inscriptionsEnAttente.length}
            />
            <KpiTile
              icon={IconChecklist}
              label={t("kpi.votes_en_cours")}
              value={voteOuvert ? 1 : 0}
              delta={voteOuvert ? t("kpi.vote_ouvert") : t("kpi.aucun_vote")}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">
              {t("prochains_evenements.titre")}
            </span>
            <Link to="/evenements" className="text-xs text-ca hover:underline">
              {t("prochains_evenements.voir_tout")}
            </Link>
          </div>
          {prochainsEvenements.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t("prochains_evenements.aucun")}</p>
          ) : (
            <ul className="space-y-2">
              {prochainsEvenements.map((evenement) => (
                <li
                  key={evenement.id}
                  className="flex animate-slide-in-fade items-center justify-between rounded-cid border-b border-bg-tertiary px-1 pb-2 text-sm transition-colors last:border-0 last:pb-0 hover:bg-bg-secondary"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text-primary">{evenement.titre}</div>
                    <div className="text-xs text-text-secondary">
                      {formatDateCourte(evenement.date_evenement)}
                      {evenement.lieu ? ` · ${evenement.lieu}` : ""}
                    </div>
                  </div>
                  {evenement.places_max != null && (
                    <span className="ml-2 shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      {evenement.places_reservees}/{evenement.places_max}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-text-primary">
            {t("ma_situation.titre")}
          </div>
          {!cotisationAnnuelle && !fraisAdhesion && inscriptionsEnAttente.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t("ma_situation.aucune_donnee")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {cotisationAnnuelle && (
                <li className="flex animate-slide-in-fade items-center justify-between">
                  <span>{t("ma_situation.cotisation_annuelle", { annee: anneeCourante })}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUT_STYLES[cotisationAnnuelle.statut]}`}
                  >
                    {t(`ma_situation.statut_${cotisationAnnuelle.statut}`)}
                  </span>
                </li>
              )}
              {fraisAdhesion && (
                <li className="flex animate-slide-in-fade items-center justify-between">
                  <span>{t("ma_situation.frais_adhesion", { annee: anneeCourante })}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUT_STYLES[fraisAdhesion.statut]}`}
                  >
                    {t(`ma_situation.statut_${fraisAdhesion.statut}`)}
                  </span>
                </li>
              )}
              {inscriptionsEnAttente.map((inscription) => (
                <li
                  key={inscription.id}
                  className="flex animate-slide-in-fade items-center justify-between"
                >
                  <span className="truncate">
                    {inscription.evenement_detail?.titre ?? inscription.evenement}
                  </span>
                  <span className="rounded-full bg-status-warningBg px-2 py-0.5 text-[11px] font-medium text-status-warningText">
                    {formatMontant(inscription.montant_paye)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => navigate("/cotisation")}
            className="mt-3 w-full rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:bg-cad"
          >
            {t("ma_situation.gerer_paiements")}
          </button>
        </div>
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-text-primary">
            {t("dernieres_publications.titre")}
          </span>
          <Link to="/fil" className="text-xs text-ca hover:underline">
            {t("dernieres_publications.voir_tout")}
          </Link>
        </div>
        {publications.length === 0 ? (
          <p className="text-xs text-text-tertiary">{t("dernieres_publications.aucune")}</p>
        ) : (
          <ul className="space-y-2">
            {publications.map((publication) => (
              <li
                key={publication.id}
                className="flex animate-slide-in-fade items-start gap-2 rounded-cid border-b border-bg-tertiary px-1 pb-2 text-sm transition-colors last:border-0 last:pb-0 hover:bg-bg-secondary"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cal text-[11px] font-bold text-cad">
                  {publication.auteur.prenom.charAt(0)}
                  {publication.auteur.nom.charAt(0)}
                </div>
                <div className="min-w-0">
                  <span className="font-medium text-text-primary">
                    {publication.auteur.prenom} {publication.auteur.nom}
                  </span>{" "}
                  <span className="text-text-secondary">{publication.contenu}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
