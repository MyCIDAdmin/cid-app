/**
 * Page "Fan-Club" (renommée le 2026-09-24, anciennement "Live-Spiel"/"Live Match" —
 * changement de label uniquement, voir CLAUDE.md/plan : URL `/live`, nom de modèle `Match`
 * et noms de fichiers inchangés pour limiter le risque). Devenue un conteneur à onglets
 * (même motif que AdminBoutiquePage/GestionCatalogueTab) : l'onglet "Ticker" est l'ancien
 * contenu unique de cette page (liste des matchs, mockup #pg-live, Release Plan §3.2,
 * troisième lot Phase 4B) — lecture ouverte à tout authentifié, création d'un match
 * réservée Bureau Admin+ (voir MatchPermission côté backend). Les nouveaux onglets
 * "Tabelle"/"Spielplan"/"Statistiken" affichent les données Club Africain synchronisées
 * automatiquement depuis GOAL API (voir backend apps.communaute.services, décision
 * "hybride" du plan approuvé) — purement en lecture, aucune action de gestion. Le détail
 * d'un match (score/chrono en direct, commentaires, réactions, événements du Live-Ticker)
 * vit toujours dans LiveMatchDetailPage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import CalendrierTab from "../../components/communaute/CalendrierTab";
import ClassementTab from "../../components/communaute/ClassementTab";
import StatistiquesTab from "../../components/communaute/StatistiquesTab";
import TippspielSection from "../../components/communaute/TippspielSection";
import { useCreerMatch, useMatchs } from "../../hooks/useCommunaute";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type { StatutMatch } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

type Onglet = "ticker" | "tabelle" | "spielplan" | "statistiken";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const BADGE_CLASSES: Record<StatutMatch, string> = {
  a_venir: "bg-bg-secondary text-text-tertiary",
  en_cours: "bg-status-dangerBg text-status-dangerText",
  termine: "bg-cal text-cad",
};

export default function LiveMatchPage() {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const peutCreer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);
  const [onglet, setOnglet] = useState<Onglet>("ticker");

  const matchsQuery = useMatchs();
  const creer = useCreerMatch();

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [adversaire, setAdversaire] = useState("");
  const [competition, setCompetition] = useState("");
  const [lieu, setLieu] = useState("");
  const [dateHeure, setDateHeure] = useState("");
  const [erreur, setErreur] = useState("");

  function creerMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!adversaire.trim() || !dateHeure) return;
    creer.mutate(
      { adversaire, competition, lieu, date_heure: new Date(dateHeure).toISOString() },
      {
        onSuccess: () => {
          setAdversaire("");
          setCompetition("");
          setLieu("");
          setDateHeure("");
          setAfficherFormulaire(false);
          setErreur("");
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("live.erreur_creation"))),
      },
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("live.titre")}</h1>
        {onglet === "ticker" && peutCreer && (
          <button
            type="button"
            onClick={() => setAfficherFormulaire((v) => !v)}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
          >
            {t("live.nouveau_match")}
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-text-tertiary/20">
        {(["ticker", "tabelle", "spielplan", "statistiken"] as const).map((valeur) => (
          <button
            key={valeur}
            type="button"
            onClick={() => setOnglet(valeur)}
            className={`px-3 py-2 text-sm font-medium ${
              onglet === valeur
                ? "border-b-2 border-ca text-ca"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t(`live.onglet_${valeur}`)}
          </button>
        ))}
      </div>

      {onglet === "tabelle" && <ClassementTab />}
      {onglet === "spielplan" && <CalendrierTab />}
      {onglet === "statistiken" && <StatistiquesTab />}

      {onglet === "ticker" && (
        <>
          {afficherFormulaire && (
            <form
              onSubmit={creerMatch}
              className="mb-4 space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
            >
              <input
                type="text"
                value={adversaire}
                onChange={(e) => setAdversaire(e.target.value)}
                placeholder={t("live.adversaire_placeholder")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
                placeholder={t("live.competition_placeholder")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                value={lieu}
                onChange={(e) => setLieu(e.target.value)}
                placeholder={t("live.lieu_placeholder")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("live.date_heure_label")}
                </label>
                <input
                  type="datetime-local"
                  value={dateHeure}
                  onChange={(e) => setDateHeure(e.target.value)}
                  aria-label={t("live.date_heure_label")}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={creer.isPending}
                className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("live.creer")}
              </button>
              {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
            </form>
          )}

          {matchsQuery.isLoading && (
            <p className="text-sm text-text-tertiary">{t("live.chargement")}</p>
          )}
          {matchsQuery.isError && (
            <p className="text-sm text-status-dangerText">{t("live.erreur_chargement")}</p>
          )}
          {matchsQuery.data?.results.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("live.aucun_match")}</p>
          )}

          <div className="space-y-2">
            {matchsQuery.data?.results.map((match) => (
              <Link
                key={match.id}
                to={`/live/${match.id}`}
                className="block rounded-cid-lg bg-bg-primary p-3 shadow-sm hover:bg-bg-secondary"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-text-primary">
                    CA {t("live.vs")} {match.adversaire}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${BADGE_CLASSES[match.statut]}`}
                  >
                    {t(`live.statut_${match.statut}`)}
                  </span>
                </div>
                {match.statut !== "a_venir" && (
                  <div className="mt-1 text-lg font-bold text-text-primary">
                    {match.score_ca} — {match.score_adversaire}
                    {match.statut === "en_cours" && (
                      <span className="ml-2 text-xs font-normal text-text-tertiary">
                        {match.minute_chrono}&apos;
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-text-tertiary">
                  {[match.competition, match.lieu].filter(Boolean).join(" · ")}
                  {(match.competition || match.lieu) && " · "}
                  {formatDate(match.date_heure)}
                </div>
              </Link>
            ))}
          </div>

          {/* Tippspiel (2026-09-24) — "zum Modul Fan-Club hinzufügen im Tab 'Ticker'",
              retour utilisateur : placé sous la liste des matchs de ce même onglet plutôt
              que dans un onglet séparé, voir TippspielSection pour le détail (règles,
              inscription, pronostics, classement, gestion Administrateur App/Directeur
              Financier). Ne s'affiche rien tant qu'aucun Tippspiel n'existe pour un membre
              standard (voir TippspielSection). */}
          <div className="mt-6 border-t border-text-tertiary/20 pt-4">
            <h2 className="mb-3 text-sm font-bold uppercase text-text-tertiary">
              {t("tippspiel.titre")}
            </h2>
            <TippspielSection />
          </div>
        </>
      )}
    </div>
  );
}
