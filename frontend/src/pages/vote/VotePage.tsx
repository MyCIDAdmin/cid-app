/**
 * Page "Votes & Élections en direct" (mockup #pg-vote, FDD §3.5/F-008). Deux onglets portés
 * par cette itération — "Vote en cours" et "Votes passés" ; l'onglet "Calendrier" du mockup
 * n'a pas d'équivalent ici : RICEFW W-006 impose qu'une session soit lancée immédiatement à
 * sa création (pas d'état planifié/brouillon côté modèle, voir StatutSession), il n'y a donc
 * rien à afficher dans un calendrier de sessions futures.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ShareButton from "../../components/ui/ShareButton";
import BulletinVote from "../../components/vote/BulletinVote";
import MinuteurVote from "../../components/vote/MinuteurVote";
import ResultatsPodium from "../../components/vote/ResultatsPodium";
import { useDeepLinkCible } from "../../hooks/useDeepLinkCible";
import {
  useCloturerVoteSession,
  useHistoriqueVote,
  useResultatsVote,
  useSessionVoteActive,
  useVoteSession,
} from "../../hooks/useVote";
import { useVoteSocket } from "../../hooks/useVoteSocket";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

// Gestion des sessions de vote (créer/clôturer) réservée à cet ensemble exact de rôles — PAS
// un minRoleLevel : le Directeur Financier a un niveau numérique supérieur à Bureau Admin
// mais en est explicitement exclu (SCD §4.2, voir ROLES_GESTION_VOTE côté backend,
// apps.vote.permissions — même exception que côté App.tsx).
const ROLES_GESTION_VOTE = ["super_admin", "bureau_admin"] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function VotePage() {
  const { t } = useTranslation("vote");
  const user = useAuthStore((s) => s.user);
  const estAdmin = Boolean(
    user && ROLES_GESTION_VOTE.includes(user.role as (typeof ROLES_GESTION_VOTE)[number]),
  );

  const [onglet, setOnglet] = useState<"actif" | "historique">("actif");
  const [sessionAffichee, setSessionAffichee] = useState<string | undefined>();
  const [historiqueOuvert, setHistoriqueOuvert] = useState<string | null>(null);

  const activeQuery = useSessionVoteActive();
  useEffect(() => {
    const active = activeQuery.data?.results[0];
    if (active) setSessionAffichee(active.id);
    // On ne réinitialise jamais sessionAffichee à undefined ici : une session qui vient d'être
    // clôturée (donc disparue du filtre statut=ouverte) doit rester affichée avec ses résultats
    // pour l'utilisateur en train de la consulter.
  }, [activeQuery.data]);

  const sessionQuery = useVoteSession(sessionAffichee);
  const session = sessionQuery.data;
  const socket = useVoteSocket(sessionAffichee);

  // Lien profond depuis une notification (?session=<id>, voir useDeepLinkCible) — corrige le
  // clic sur "Wahlen offen" qui ne naviguait nulle part (l'ancien lien backend, "/vote", ne
  // correspondait à aucune route). Si la session visée n'est pas la session active actuellement
  // affichée, on bascule sur l'onglet "historique" et on ouvre directement son accordéon.
  const { cibleId: sessionCible, refCible } = useDeepLinkCible("session");
  useEffect(() => {
    if (!sessionCible || session?.id === sessionCible) return;
    setOnglet("historique");
    setHistoriqueOuvert(sessionCible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCible]);

  const cloturerMutation = useCloturerVoteSession();
  const historiqueQuery = useHistoriqueVote();
  const resultatsHistorique = useResultatsVote(
    historiqueOuvert ?? undefined,
    Boolean(historiqueOuvert),
  );

  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Repasse à false dès qu'une réponse arrive côté WebSocket (accusé de réception ou erreur) —
  // AUCUN lien avec l'état de connexion du socket lui-même (bug corrigé : le bouton restait
  // bloqué sur "Wird gesendet…" tant que la connexion n'était pas encore "ouverte", ce qui
  // pouvait sembler figé indéfiniment si la connexion tardait ou échouait).
  useEffect(() => {
    if (socket.voteEnregistre || socket.erreur) setEnvoiEnCours(false);
  }, [socket.voteEnregistre, socket.erreur]);

  const resultats = socket.resultats;
  const sessionCloturee = session?.statut === "cloturee" || Boolean(resultats);
  const aDejaVote = socket.voteEnregistre;

  function handleVoter(choix: string[]) {
    setEnvoiEnCours(true);
    socket.voter(choix);
  }

  function handleCloturer() {
    if (!session) return;
    cloturerMutation.mutate(session.id);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-text-primary">{t("page.titre")}</h1>
        {estAdmin && (
          <Link
            to="/votes/creer"
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
          >
            + {t("page.creer_session")}
          </Link>
        )}
      </div>

      {estAdmin && (
        <div className="mb-4 rounded-cid bg-status-infoBg px-3 py-2 text-xs text-status-infoText">
          {t("page.bandeau_admin")}
        </div>
      )}

      <div className="mb-4 flex gap-1 border-b border-text-tertiary/15">
        <button
          type="button"
          onClick={() => setOnglet("actif")}
          className={`px-3 py-2 text-xs font-semibold ${
            onglet === "actif" ? "border-b-2 border-ca text-ca" : "text-text-tertiary"
          }`}
        >
          {t("onglets.actif")}
        </button>
        <button
          type="button"
          onClick={() => setOnglet("historique")}
          className={`px-3 py-2 text-xs font-semibold ${
            onglet === "historique" ? "border-b-2 border-ca text-ca" : "text-text-tertiary"
          }`}
        >
          {t("onglets.historique")}
        </button>
      </div>

      {onglet === "actif" && (
        <div>
          {!session && !activeQuery.isLoading && (
            <div className="rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
              <div className="mb-2 text-3xl">🗳️</div>
              <div className="mb-1 text-sm font-semibold text-text-primary">{t("vide.titre")}</div>
              <div className="mb-4 text-xs text-text-tertiary">{t("vide.description")}</div>
              {estAdmin && (
                <Link
                  to="/votes/creer"
                  className="inline-block rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad"
                >
                  {t("page.creer_session")}
                </Link>
              )}
            </div>
          )}

          {session && (
            <div ref={refCible(session.id)} className="space-y-4">
              <div className="rounded-cid-lg bg-ca p-4 text-white shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase">
                    <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full bg-white ${sessionCloturee ? "" : "animate-pulse"}`}
                      />
                      {sessionCloturee ? t("statut.cloturee") : t("statut.ouverte")}
                    </span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5">
                      {session.mode_anonymat === "anonyme"
                        ? `🔒 ${t("anonymat.anonyme")}`
                        : `👁 ${t("anonymat.nominatif")}`}
                    </span>
                  </div>
                  <ShareButton
                    path={`/votes?session=${session.id}`}
                    titre={session.titre}
                    variant="inverse"
                  />
                </div>
                <div className="text-base font-bold">{session.titre}</div>
                <div className="mt-1 text-xs text-white/85">{session.description}</div>

                {!sessionCloturee && (
                  <div className="mt-3 flex flex-wrap items-center gap-5">
                    <div>
                      <div className="text-[10px] uppercase text-white/70">
                        {t("session.temps_restant")}
                      </div>
                      <MinuteurVote dateFin={session.date_fin} />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-white/70">
                        {t("session.participants")}
                      </div>
                      <div className="text-lg font-bold">
                        {socket.participation?.total_participants ?? session.total_participants}{" "}
                        <span className="text-xs font-normal text-white/70">
                          / {socket.participation?.total_eligibles ?? session.total_eligibles}{" "}
                          {t("session.membres")}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {estAdmin && !sessionCloturee && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCloturer}
                    disabled={cloturerMutation.isPending}
                    className="rounded-cid border border-ca px-3 py-1.5 text-xs font-medium text-ca hover:bg-cal/30 disabled:opacity-40"
                  >
                    {cloturerMutation.isPending
                      ? t("session.cloture_en_cours")
                      : t("session.cloturer")}
                  </button>
                </div>
              )}
              {cloturerMutation.isError && (
                <p className="text-right text-xs text-status-dangerText">
                  {extractApiErrorMessage(cloturerMutation.error, t("session.erreur_cloture"))}
                </p>
              )}

              {!sessionCloturee && !aDejaVote && (
                <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
                  {socket.erreur && (
                    <p className="mb-3 rounded-cid bg-status-dangerBg px-3 py-2 text-xs text-status-dangerText">
                      {socket.erreur}
                    </p>
                  )}
                  {socket.statut === "ouvert" && (
                    <BulletinVote
                      session={session}
                      onSubmit={handleVoter}
                      envoiEnCours={envoiEnCours}
                    />
                  )}
                  {socket.statut === "connexion" && (
                    <p className="text-center text-xs text-text-tertiary">
                      {t("bulletin.connexion_en_cours")}
                    </p>
                  )}
                  {(socket.statut === "erreur" || socket.statut === "ferme") && (
                    <p className="rounded-cid bg-status-warningBg px-3 py-2 text-center text-xs text-status-warningText">
                      {t("bulletin.connexion_indisponible")}
                    </p>
                  )}
                </div>
              )}

              {!sessionCloturee && aDejaVote && (
                <div className="rounded-cid-lg bg-bg-primary p-4 text-center shadow-sm">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-status-successBg text-2xl text-status-successText">
                    ✓
                  </div>
                  <div className="mb-1 text-sm font-bold text-text-primary">
                    {t("bulletin.vote_enregistre")}
                  </div>
                  <div className="mb-3 text-xs text-text-tertiary">
                    {t("bulletin.vote_enregistre_note")}
                  </div>
                  <p className="text-[10px] text-text-tertiary">
                    ⚠ {t("bulletin.resultats_a_la_cloture")}
                  </p>
                </div>
              )}

              {resultats && (
                <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
                  <h2 className="mb-3 text-xs font-bold uppercase text-text-primary">
                    {t("resultats.titre")}
                  </h2>
                  <ResultatsPodium resultats={resultats} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {onglet === "historique" && (
        <div className="rounded-cid-lg bg-bg-primary shadow-sm">
          {historiqueQuery.isLoading && (
            <p className="p-4 text-sm text-text-tertiary">{t("historique.chargement")}</p>
          )}
          {historiqueQuery.data && historiqueQuery.data.results.length === 0 && (
            <p className="p-4 text-sm text-text-tertiary">{t("historique.aucun")}</p>
          )}
          <ul>
            {historiqueQuery.data?.results.map((s) => (
              <li
                key={s.id}
                ref={refCible(s.id)}
                className="border-b border-text-tertiary/10 last:border-0"
              >
                <div className="flex w-full items-center justify-between px-4 py-3 hover:bg-bg-tertiary">
                  <button
                    type="button"
                    onClick={() => setHistoriqueOuvert(historiqueOuvert === s.id ? null : s.id)}
                    className="flex-1 text-left"
                  >
                    <div className="text-sm font-semibold text-text-primary">{s.titre}</div>
                    <div className="text-xs text-text-tertiary">
                      {t("historique.cloture_le", { date: formatDate(s.date_cloture) })} ·{" "}
                      {t("resultats.nombre_voix", { count: s.total_participants })}
                    </div>
                  </button>
                  <div className="flex items-center gap-1">
                    <ShareButton path={`/votes?session=${s.id}`} titre={s.titre} />
                    <button
                      type="button"
                      onClick={() => setHistoriqueOuvert(historiqueOuvert === s.id ? null : s.id)}
                      className="px-1 text-xs text-ca"
                    >
                      {historiqueOuvert === s.id ? "▲" : "▼"}
                    </button>
                  </div>
                </div>
                {historiqueOuvert === s.id && (
                  <div className="border-t border-text-tertiary/10 bg-bg-secondary/40 p-4">
                    {resultatsHistorique.isLoading && (
                      <p className="text-xs text-text-tertiary">{t("historique.chargement")}</p>
                    )}
                    {resultatsHistorique.data && (
                      <ResultatsPodium resultats={resultatsHistorique.data} />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
