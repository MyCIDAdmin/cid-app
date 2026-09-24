/**
 * Page "Fan-Club" — détail d'un match (mockup #pg-live, troisième lot Phase 4B ; module
 * Fan-Club, 2026-09-24, extension du Live-Ticker).
 *
 * Score/chrono/statut : valeur initiale via REST (useMatch), tenue à jour en direct par les
 * diffusions `{type: "match"}` du WebSocket (voir hooks/useLiveMatchSocket.ts — REST reste la
 * seule façon de les MODIFIER, réservée Bureau Admin+, voir useModifierMatch). Commentaires :
 * historique REST + flux WebSocket, dédupliqués comme GroupeChatPage. Réactions emoji :
 * exclusivement WebSocket (jamais de POST REST, voir consumers.py). Membres connectés :
 * compteur agrégé WebSocket (voir LiveMatchConsumer, pas de liste nominative comme la
 * Messagerie — un match rassemble potentiellement des centaines de membres). Événements du
 * Live-Ticker (buts/cartons, module Fan-Club) : même principe historique REST + flux
 * WebSocket que les commentaires, ajout réservé à Bureau Admin+ (voir
 * MatchEvenementPermission côté backend), animés à l'arrivée (voir tailwind.config.js
 * ::slide-in-fade).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import {
  useCreerMatchEvenement,
  useMatch,
  useMatchCommentaires,
  useMatchEvenements,
  useModifierMatch,
} from "../../hooks/useCommunaute";
import { useLiveMatchSocket } from "../../hooks/useLiveMatchSocket";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";
import type {
  EquipeEvenement,
  StatutMatch,
  TypeEvenementMatch,
  TypeReactionMatch,
} from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";

const EMOJIS: Record<TypeReactionMatch, string> = {
  coeur: "❤️",
  feu: "🔥",
  etoile: "⭐",
  surprise: "😮",
};

const STATUTS: StatutMatch[] = ["a_venir", "en_cours", "termine"];

const TYPES_EVENEMENT: TypeEvenementMatch[] = [
  "coup_envoi",
  "but",
  "carton_jaune",
  "carton_rouge",
  "remplacement",
  "mi_temps",
  "fin_match",
];

const ICONES_EVENEMENT: Record<TypeEvenementMatch, string> = {
  coup_envoi: "🟢",
  but: "⚽",
  carton_jaune: "🟨",
  carton_rouge: "🟥",
  remplacement: "🔄",
  mi_temps: "⏸️",
  fin_match: "🏁",
};

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function LiveMatchDetailPage() {
  const { t } = useTranslation("communaute");
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);
  const peutPiloter = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const matchQuery = useMatch(id);
  const historiqueQuery = useMatchCommentaires(id);
  const historiqueEvenementsQuery = useMatchEvenements(id);
  const modifier = useModifierMatch();
  const creerEvenement = useCreerMatchEvenement();
  const {
    commentaires: commentairesTempsReel,
    reactions,
    connectes,
    miseAJourMatch,
    evenements: evenementsTempsReel,
    erreur: erreurSocket,
    envoyerCommentaire,
    envoyerReaction,
  } = useLiveMatchSocket(id);

  const [texte, setTexte] = useState("");
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [statutForm, setStatutForm] = useState<StatutMatch | "">("");
  const [scoreCaForm, setScoreCaForm] = useState("");
  const [scoreAdversaireForm, setScoreAdversaireForm] = useState("");
  const [minuteForm, setMinuteForm] = useState("");
  const [erreurForm, setErreurForm] = useState("");

  const [formulaireEvenementOuvert, setFormulaireEvenementOuvert] = useState(false);
  const [typeEvenementForm, setTypeEvenementForm] = useState<TypeEvenementMatch>("but");
  const [minuteEvenementForm, setMinuteEvenementForm] = useState("");
  const [equipeEvenementForm, setEquipeEvenementForm] = useState<EquipeEvenement>("ca");
  const [joueurEvenementForm, setJoueurEvenementForm] = useState("");
  const [descriptionEvenementForm, setDescriptionEvenementForm] = useState("");
  const [erreurEvenementForm, setErreurEvenementForm] = useState("");

  const match = matchQuery.data;
  // Le score/chrono/statut affichés privilégient la dernière diffusion WebSocket (temps réel),
  // avec repli sur la valeur REST tant qu'aucune diffusion n'est encore arrivée.
  const statutAffiche = miseAJourMatch?.statut ?? match?.statut;
  const scoreCaAffiche = miseAJourMatch?.score_ca ?? match?.score_ca;
  const scoreAdversaireAffiche = miseAJourMatch?.score_adversaire ?? match?.score_adversaire;
  const minuteAffichee = miseAJourMatch?.minute_chrono ?? match?.minute_chrono;
  const reactionsAffichees = reactions ?? match?.reactions;

  const tousLesCommentaires = useMemo(() => {
    const historique = historiqueQuery.data?.results ?? [];
    const idsHistorique = new Set(historique.map((c) => c.id));
    const nouveaux = commentairesTempsReel.filter((c) => !idsHistorique.has(c.id));
    return [...historique, ...nouveaux];
  }, [historiqueQuery.data, commentairesTempsReel]);

  const tousLesEvenements = useMemo(() => {
    const historique = historiqueEvenementsQuery.data?.results ?? [];
    const idsHistorique = new Set(historique.map((e) => e.id));
    const nouveaux = evenementsTempsReel.filter((e) => !idsHistorique.has(e.id));
    return [...historique, ...nouveaux].sort((a, b) => a.minute - b.minute);
  }, [historiqueEvenementsQuery.data, evenementsTempsReel]);

  function ajouterEvenement(e: React.FormEvent) {
    e.preventDefault();
    if (!id || minuteEvenementForm === "") return;
    creerEvenement.mutate(
      {
        match: id,
        type_evenement: typeEvenementForm,
        minute: Number(minuteEvenementForm),
        equipe: equipeEvenementForm,
        joueur: joueurEvenementForm,
        description: descriptionEvenementForm,
      },
      {
        onSuccess: () => {
          setMinuteEvenementForm("");
          setJoueurEvenementForm("");
          setDescriptionEvenementForm("");
          setErreurEvenementForm("");
        },
        onError: (err) =>
          setErreurEvenementForm(extractApiErrorMessage(err, t("live.evenement_erreur_ajout"))),
      },
    );
  }

  function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    envoyerCommentaire(texte);
    setTexte("");
  }

  function ouvrirFormulaire() {
    setStatutForm(statutAffiche ?? "");
    setScoreCaForm(String(scoreCaAffiche ?? 0));
    setScoreAdversaireForm(String(scoreAdversaireAffiche ?? 0));
    setMinuteForm(String(minuteAffichee ?? 0));
    setFormulaireOuvert(true);
  }

  function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    modifier.mutate(
      {
        id,
        payload: {
          statut: statutForm || undefined,
          score_ca: Number(scoreCaForm),
          score_adversaire: Number(scoreAdversaireForm),
          minute_chrono: Number(minuteForm),
        },
      },
      {
        onSuccess: () => setFormulaireOuvert(false),
        onError: (err) => setErreurForm(extractApiErrorMessage(err, t("live.erreur_modification"))),
      },
    );
  }

  if (matchQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.chargement")}</p>;
  }
  if (matchQuery.isError || !match) {
    return <p className="text-sm text-status-dangerText">{t("live.erreur_chargement")}</p>;
  }

  return (
    <div>
      <Link to="/live" className="mb-3 inline-block text-xs text-ca hover:underline">
        {t("live.retour_liste")}
      </Link>

      <div className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-text-primary">
            CA {t("live.vs")} {match.adversaire}
          </h1>
          <span className="text-xs text-text-tertiary">
            {t("live.connectes", { count: connectes })}
          </span>
        </div>
        <p className="text-xs text-text-tertiary">
          {[match.competition, match.lieu].filter(Boolean).join(" · ")}
        </p>

        <div className="my-3 flex items-center justify-center gap-4">
          <div className="text-3xl font-bold text-text-primary">
            {scoreCaAffiche} — {scoreAdversaireAffiche}
          </div>
          {statutAffiche === "en_cours" && (
            <span className="rounded bg-status-dangerBg px-2 py-1 text-xs font-bold text-status-dangerText">
              {minuteAffichee}&apos; · {t("live.statut_en_cours")}
            </span>
          )}
          {statutAffiche && statutAffiche !== "en_cours" && (
            <span className="rounded bg-bg-secondary px-2 py-1 text-xs font-bold text-text-tertiary">
              {t(`live.statut_${statutAffiche}`)}
            </span>
          )}
        </div>

        <div className="flex justify-center gap-3">
          {(Object.keys(EMOJIS) as TypeReactionMatch[]).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => envoyerReaction(emoji)}
              className="flex flex-col items-center gap-0.5 rounded-cid px-2 py-1 text-lg hover:bg-bg-secondary"
            >
              <span>{EMOJIS[emoji]}</span>
              <span className="text-[10px] font-medium text-text-tertiary">
                {reactionsAffichees?.[emoji] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {peutPiloter && (
          <div className="mt-3 border-t border-text-tertiary/10 pt-2">
            {!formulaireOuvert ? (
              <button
                type="button"
                onClick={ouvrirFormulaire}
                className="text-xs font-medium text-ca hover:underline"
              >
                {t("live.modifier_match")}
              </button>
            ) : (
              <form onSubmit={enregistrer} className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-text-secondary">
                      {t("live.score_ca")}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={scoreCaForm}
                      onChange={(e) => setScoreCaForm(e.target.value)}
                      className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-text-secondary">
                      {t("live.score_adversaire")}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={scoreAdversaireForm}
                      onChange={(e) => setScoreAdversaireForm(e.target.value)}
                      className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-text-secondary">
                      {t("live.minute_chrono")}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={minuteForm}
                      onChange={(e) => setMinuteForm(e.target.value)}
                      className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-text-secondary">
                    {t("live.statut_label")}
                  </label>
                  <select
                    value={statutForm}
                    onChange={(e) => setStatutForm(e.target.value as StatutMatch)}
                    className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                  >
                    {STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {t(`live.statut_${s}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={modifier.isPending}
                    className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
                  >
                    {t("live.enregistrer")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormulaireOuvert(false)}
                    className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-tertiary hover:bg-bg-secondary"
                  >
                    {t("live.annuler")}
                  </button>
                </div>
                {erreurForm && <p className="text-xs text-status-dangerText">{erreurForm}</p>}
              </form>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase text-text-tertiary">
            {t("live.evenements_titre")}
          </h2>
          {peutPiloter && !formulaireEvenementOuvert && (
            <button
              type="button"
              onClick={() => setFormulaireEvenementOuvert(true)}
              className="text-xs font-medium text-ca hover:underline"
            >
              {t("live.ajouter_evenement")}
            </button>
          )}
        </div>

        {tousLesEvenements.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t("live.evenements_aucun")}</p>
        ) : (
          <ul className="space-y-1.5">
            {tousLesEvenements.map((evenement) => (
              <li
                key={evenement.id}
                className="flex animate-slide-in-fade items-center gap-2 rounded-cid bg-bg-secondary px-2 py-1.5 text-sm"
              >
                <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-text-tertiary">
                  {evenement.minute}&apos;
                </span>
                <span aria-hidden="true">{ICONES_EVENEMENT[evenement.type_evenement]}</span>
                <span className="font-medium text-text-primary">
                  {t(`live.evenement_${evenement.type_evenement}`)}
                </span>
                {evenement.joueur && (
                  <span className="text-text-secondary">— {evenement.joueur}</span>
                )}
                {evenement.equipe && (
                  <span className="ml-auto text-xs text-text-tertiary">
                    {t(`live.evenement_equipe_${evenement.equipe}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {peutPiloter && formulaireEvenementOuvert && (
          <form
            onSubmit={ajouterEvenement}
            className="mt-3 space-y-2 border-t border-text-tertiary/10 pt-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-text-secondary">
                  {t("live.evenement_type_label")}
                </label>
                <select
                  value={typeEvenementForm}
                  onChange={(e) => setTypeEvenementForm(e.target.value as TypeEvenementMatch)}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  {TYPES_EVENEMENT.map((type) => (
                    <option key={type} value={type}>
                      {t(`live.evenement_${type}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-text-secondary">
                  {t("live.evenement_minute_label")}
                </label>
                <input
                  type="number"
                  min={0}
                  value={minuteEvenementForm}
                  onChange={(e) => setMinuteEvenementForm(e.target.value)}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-text-secondary">
                {t("live.evenement_equipe_label")}
              </label>
              <select
                value={equipeEvenementForm}
                onChange={(e) => setEquipeEvenementForm(e.target.value as EquipeEvenement)}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              >
                <option value="ca">{t("live.evenement_equipe_ca")}</option>
                <option value="adversaire">{t("live.evenement_equipe_adversaire")}</option>
              </select>
            </div>
            <input
              type="text"
              value={joueurEvenementForm}
              onChange={(e) => setJoueurEvenementForm(e.target.value)}
              placeholder={t("live.evenement_joueur_placeholder")}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              value={descriptionEvenementForm}
              onChange={(e) => setDescriptionEvenementForm(e.target.value)}
              placeholder={t("live.evenement_description_placeholder")}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creerEvenement.isPending}
                className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
              >
                {t("live.evenement_ajouter")}
              </button>
              <button
                type="button"
                onClick={() => setFormulaireEvenementOuvert(false)}
                className="rounded-cid px-3 py-1.5 text-xs font-medium text-text-tertiary hover:bg-bg-secondary"
              >
                {t("live.annuler")}
              </button>
            </div>
            {erreurEvenementForm && (
              <p className="text-xs text-status-dangerText">{erreurEvenementForm}</p>
            )}
          </form>
        )}
      </div>

      <div className="flex h-[45vh] flex-col rounded-cid-lg bg-bg-primary shadow-sm">
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {tousLesCommentaires.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("live.aucun_commentaire")}</p>
          )}
          {tousLesCommentaires.map((commentaire) => (
            <div key={commentaire.id} className="text-sm">
              <span className="font-bold text-text-primary">
                {commentaire.auteur.prenom} {commentaire.auteur.nom}
              </span>{" "}
              <span className="text-text-secondary">{commentaire.contenu}</span>{" "}
              <span className="text-[10px] text-text-tertiary">
                {formatHeure(commentaire.created_at)}
              </span>
            </div>
          ))}
        </div>
        <form onSubmit={envoyer} className="flex gap-2 border-t border-text-tertiary/10 p-2">
          <input
            type="text"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={t("live.placeholder_commentaire")}
            className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
          >
            {t("live.envoyer")}
          </button>
        </form>
        {erreurSocket && <p className="px-2 pb-2 text-xs text-status-dangerText">{erreurSocket}</p>}
      </div>
    </div>
  );
}
