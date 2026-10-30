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
 * Refonte 2026-10-30 (maquette « Übersicht », demande utilisateur) : en haut le prochain match
 * (Heim ou Auswärts) avec compte à rebours et, s'il existe un voyage, « Am Reiseziel » ; puis
 * les accès rapides et « Heute für dich » (une seule liste au lieu de plusieurs bandeaux) ;
 * « Dein Stand » et « Neu seit deinem letzten Besuch » à gauche, agenda/finances/aides à droite.
 * Bureau Admin+ voit en plus « Zu erledigen » et les indicateurs club (composant
 * BueroZuErledigen). Aucun endpoint nouveau : tout vient des hooks existants.
 *
 * Animations (demande utilisateur 2026-09-25, "dynamischer und bewegender Kacheln und
 * Kennzahlen") : voir KpiTile ci-dessous pour le détail (count-up via useCountUp, icône,
 * survol) ; les listes (événements, ma situation, publications) gagnent une légère
 * apparition en fondu (animate-slide-in-fade, déjà utilisée par le Live-Ticker) à leur
 * montage. Pas de légende ajoutée : aucune couleur de cette page ne porte seule une
 * information — chaque badge de statut affiche déjà son texte (voir STATUT_STYLES).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import AktionenHinweis from "../components/aktionen/AktionenHinweis";
import BueroZuErledigen from "../components/dashboard/BueroZuErledigen";
import DeinStand from "../components/dashboard/DeinStand";
import HeuteFuerDich from "../components/dashboard/HeuteFuerDich";
import NaechstesSpielHero from "../components/dashboard/NaechstesSpielHero";
import NeuSeitBesuch from "../components/dashboard/NeuSeitBesuch";
import Schnellzugriffe from "../components/dashboard/Schnellzugriffe";
import UebersichtHinweise from "../components/dashboard/UebersichtHinweise";
import NaechsteTermine from "../components/kalender/NaechsteTermine";
import { useMesCotisations } from "../hooks/useCotisations";
import { usePublications } from "../hooks/useCommunaute";
import { useEvenements, useInscriptions } from "../hooks/useEvenements";
import { useOffeneStellen } from "../hooks/useProjets";
import { useModuleOuvert } from "../hooks/useRbac";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../store/authStore";
import type { Cotisation, StatutCotisation, TypeArticle } from "../types/cotisation";
import type { Evenement } from "../types/evenements";
import { tageszeit } from "../utils/uebersicht";

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateCourte(iso: string, langue: string): string {
  return new Date(iso).toLocaleDateString(langue, { day: "2-digit", month: "long" });
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

export default function DashboardPage() {
  const { t, i18n } = useTranslation("dashboard");
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
  // Un compte non-membre n'a accès ni au Fil ni aux Votes (apps.rbac.authentication, 403) — on
  // n'interroge pas ces API pour lui (2026-10-11), le tableau de bord n'affiche alors rien de plus.
  const filOuvert = useModuleOuvert("fil").ouvert;
  const projetsOuvert = useModuleOuvert("projets").ouvert;
  const stellenQuery = useOffeneStellen({ enabled: projetsOuvert });
  const publicationsQuery = usePublications({}, { enabled: filOuvert });

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
  const offeneStellen = [...(stellenQuery.data ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const gruss = t(`uebersicht.gruss_${tageszeit()}`, { prenom: prenomAffiche });
  const datum = new Date().toLocaleDateString(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-text-primary sm:text-2xl">{gruss}</h1>
        <p className="text-sm text-text-secondary">
          {t("titre")} · {datum}
        </p>
      </header>

      <NaechstesSpielHero />
      <Schnellzugriffe />
      <AktionenHinweis />
      <UebersichtHinweise />
      {estGestion && <BueroZuErledigen />}

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[999_1_30rem] space-y-4">
          <HeuteFuerDich />
          <DeinStand />
          <NeuSeitBesuch publikationen={publications} veranstaltungen={prochainsEvenements} />
        </div>

        <div className="min-w-0 flex-[1_1_20rem] space-y-4">
          <NaechsteTermine />

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
                      <div className="truncate font-medium text-text-primary">
                        {evenement.titre}
                      </div>
                      <div className="text-xs text-text-secondary">
                        {formatDateCourte(evenement.date_evenement, i18n.language)}
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
              onClick={() => navigate("/mon-adhesion")}
              className="mt-3 w-full rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:bg-cad"
            >
              {t("ma_situation.gerer_paiements")}
            </button>
          </div>

          {offeneStellen.length > 0 && (
            <div
              className="rounded-cid-lg bg-bg-primary p-3 shadow-sm"
              data-testid="dashboard-stellen"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">
                  {t("stellen.titre")}
                </span>
                <Link to="/projets" className="text-xs text-ca hover:underline">
                  {t("stellen.voir_tout")}
                </Link>
              </div>
              <ul className="space-y-2">
                {offeneStellen.map((stelle) => (
                  <li
                    key={stelle.id}
                    className="animate-slide-in-fade rounded-cid border-b border-bg-tertiary px-1 pb-2 text-sm transition-colors last:border-0 last:pb-0 hover:bg-bg-secondary"
                  >
                    <Link to={`/projets/${stelle.projet}`} className="block">
                      <span className="font-medium text-text-primary">🙋 {stelle.titel}</span>
                      {stelle.projet_titre && (
                        <span className="text-text-secondary"> — {stelle.projet_titre}</span>
                      )}
                      <span className="ml-2 text-xs text-ca">{t("stellen.mehr")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
