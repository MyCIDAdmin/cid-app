/**
 * Page "Groupe de chat" (mockup #pg-groupes, thread ouvert) — historique REST + envoi/
 * réception temps réel par WebSocket (voir hooks/useGroupeChatSocket.ts : envoyer un
 * message ne passe JAMAIS par un POST REST). "Quitter" reste une action REST explicite.
 *
 * "Like oder antworten" + mentions "@" (demande utilisateur 2026-09-25) : like/réponse même
 * principe que MessagerieConversationPage.tsx (voir son docstring). Les mentions "@" sont
 * délibérément FRONTEND-ONLY — pas de stockage structuré côté backend, pas de nouveau type
 * de notification (arbitrage de périmètre pris pour ce lot, vu le volume du reste de la
 * demande) : la liste des membres suggérés est dérivée des auteurs déjà vus dans l'historique
 * chargé (aucun endpoint ne liste les membres d'un groupe aujourd'hui, seul leur nombre —
 * voir GroupeChatSerializer.nombre_membres), et l'affichage se contente de mettre en forme
 * tout token "@mot" dans le texte, sans vérifier qu'il correspond à un membre réel.
 */
import { useMemo, useState } from "react";
import { IconArrowBackUp, IconHeart, IconHeartFilled, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import EmojiPicker from "../../components/ui/EmojiPicker";
import {
  useGroupe,
  useLikerMessageGroupe,
  useMessagesGroupe,
  useQuitterGroupe,
  useSupprimerGroupe,
  useSupprimerMessageGroupe,
} from "../../hooks/useCommunaute";
import { useGroupeChatSocket } from "../../hooks/useGroupeChatSocket";
import { useAuthStore } from "../../store/authStore";
import type { Auteur, MessageApercu } from "../../types/communaute";

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Découpe un contenu de message pour mettre en forme les tokens "@mot" (mentions) — voir
 * docstring de tête. */
function renderContenuAvecMentions(contenu: string) {
  const parties = contenu.split(/(@\w+)/g);
  return parties.map((partie, index) =>
    partie.startsWith("@") ? (
      <span key={index} className="font-semibold text-ca">
        {partie}
      </span>
    ) : (
      <span key={index}>{partie}</span>
    ),
  );
}

export default function GroupeChatPage() {
  const { t } = useTranslation("communaute");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const moi = useAuthStore((s) => s.user);

  const groupeQuery = useGroupe(id);
  const historiqueQuery = useMessagesGroupe(id);
  const quitter = useQuitterGroupe();
  const supprimerGroupe = useSupprimerGroupe();
  const supprimerMessage = useSupprimerMessageGroupe();
  const likerMessage = useLikerMessageGroupe();
  const {
    statut,
    messages: messagesTempsReel,
    messagesSupprimesIds,
    likesRecus,
    erreur,
    envoyer,
  } = useGroupeChatSocket(id);

  const [texte, setTexte] = useState("");
  const [repondA, setRepondA] = useState<{ id: string; apercu: MessageApercu } | null>(null);

  const likesParMessage = useMemo(() => {
    const carte = new Map<string, { nombre_likes: number; jaime?: boolean }>();
    for (const evenement of likesRecus) {
      const jaimeCourant = evenement.membre_id === moi?.id ? evenement.aime : undefined;
      const precedent = carte.get(evenement.id);
      carte.set(evenement.id, {
        nombre_likes: evenement.nombre_likes,
        jaime: jaimeCourant ?? precedent?.jaime,
      });
    }
    return carte;
  }, [likesRecus, moi?.id]);

  const tousLesMessages = useMemo(() => {
    const supprimes = new Set(messagesSupprimesIds);
    const historique = (historiqueQuery.data?.results ?? []).filter((m) => !supprimes.has(m.id));
    const idsHistorique = new Set(historique.map((m) => m.id));
    const nouveaux = messagesTempsReel.filter((m) => !idsHistorique.has(m.id));
    return [
      ...historique.map((m) => {
        const maj = likesParMessage.get(m.id);
        return {
          id: m.id,
          contenu: m.contenu,
          auteur: m.auteur,
          created_at: m.created_at,
          estMoi: m.est_auteur,
          nombreLikes: maj?.nombre_likes ?? m.nombre_likes,
          jaime: maj?.jaime ?? m.jaime,
          repondADetail: m.repond_a_detail,
        };
      }),
      ...nouveaux.map((m) => {
        const maj = likesParMessage.get(m.id);
        return {
          id: m.id,
          contenu: m.contenu,
          auteur: m.auteur,
          created_at: m.created_at,
          estMoi: m.auteur.id === moi?.id,
          nombreLikes: maj?.nombre_likes ?? m.nombre_likes,
          jaime: maj?.jaime ?? false,
          repondADetail: m.repond_a_detail,
        };
      }),
    ];
  }, [historiqueQuery.data, messagesTempsReel, messagesSupprimesIds, likesParMessage, moi?.id]);

  // Membres suggérés pour l'autocomplétion "@" — voir docstring de tête (dérivés des
  // auteurs déjà vus, pas d'endpoint dédié).
  const membresConnus = useMemo(() => {
    const carte = new Map<string, Auteur>();
    for (const message of tousLesMessages) {
      if (!carte.has(message.auteur.id)) carte.set(message.auteur.id, message.auteur);
    }
    return Array.from(carte.values());
  }, [tousLesMessages]);

  const matchMention = /(^|\s)@(\w*)$/.exec(texte);
  const requeteMention = matchMention ? matchMention[2].toLowerCase() : null;
  const suggestionsMention =
    requeteMention !== null
      ? membresConnus.filter((m) => m.prenom.toLowerCase().startsWith(requeteMention)).slice(0, 5)
      : [];

  function choisirMention(auteur: Auteur) {
    setTexte((t2) => t2.replace(/@\w*$/, `@${auteur.prenom} `));
  }

  function envoyerMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    envoyer(texte, repondA?.id);
    setTexte("");
    setRepondA(null);
  }

  function handleQuitter() {
    if (!id) return;
    quitter.mutate(id, { onSuccess: () => navigate("/groupes") });
  }

  function handleSupprimerGroupe() {
    if (!id) return;
    supprimerGroupe.mutate(id, { onSuccess: () => navigate("/groupes") });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Link to="/groupes" className="text-xs text-ca hover:underline">
          {t("groupes.retour_liste")}
        </Link>
        <div className="flex gap-3">
          {/* Demande utilisateur du 2026-09-16 ("Besprechungen ... vom Ersteller gelöscht
              werden") — réservé au créateur côté backend (GroupeChatPermission), voir
              GroupeChatSerializer.est_createur. */}
          {groupeQuery.data?.est_createur && (
            <button
              type="button"
              onClick={handleSupprimerGroupe}
              className="text-xs text-status-dangerText hover:underline"
            >
              {t("groupes.supprimer_groupe")}
            </button>
          )}
          <button
            type="button"
            onClick={handleQuitter}
            className="text-xs text-status-dangerText hover:underline"
          >
            {t("groupes.quitter")}
          </button>
        </div>
      </div>

      {groupeQuery.data && (
        <h1 className="mb-2 text-lg font-bold text-text-primary">{groupeQuery.data.nom}</h1>
      )}

      <div className="flex h-[60vh] flex-col rounded-cid-lg bg-bg-primary shadow-sm">
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {historiqueQuery.isLoading && (
            <p className="text-sm text-text-tertiary">{t("groupes.chargement")}</p>
          )}
          {tousLesMessages.map((message) => (
            <div
              key={message.id}
              className={message.estMoi ? "group ml-auto max-w-[75%]" : "group max-w-[75%]"}
            >
              {!message.estMoi && (
                <p className="mb-0.5 text-[10px] font-bold text-text-tertiary">
                  {message.auteur.prenom} {message.auteur.nom}
                </p>
              )}
              <div
                className={`rounded-cid px-3 py-1.5 text-sm ${
                  message.estMoi ? "bg-ca text-white" : "bg-bg-secondary text-text-secondary"
                }`}
              >
                {message.repondADetail && (
                  <p
                    className={`mb-1 truncate rounded border-l-2 pl-1.5 text-[11px] italic ${
                      message.estMoi
                        ? "border-white/40 text-white/70"
                        : "border-ca/40 text-text-tertiary"
                    }`}
                  >
                    {message.repondADetail.contenu}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{renderContenuAvecMentions(message.contenu)}</p>
                <p
                  className={`mt-0.5 flex items-center gap-2 text-[10px] ${message.estMoi ? "text-white/70" : "text-text-tertiary"}`}
                >
                  {formatHeure(message.created_at)}
                  <button
                    type="button"
                    onClick={() => likerMessage.mutate(message.id)}
                    aria-label={t("messagerie.liker_aria")}
                    className={`flex items-center gap-0.5 hover:underline ${message.jaime ? "font-semibold" : ""}`}
                  >
                    {message.jaime ? <IconHeartFilled size={11} /> : <IconHeart size={11} />}
                    {message.nombreLikes > 0 && message.nombreLikes}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRepondA({
                        id: message.id,
                        apercu: { id: message.id, contenu: message.contenu },
                      })
                    }
                    className="hidden items-center gap-0.5 hover:underline group-hover:flex"
                  >
                    <IconArrowBackUp size={11} />
                    {t("messagerie.repondre")}
                  </button>
                  {message.estMoi && (
                    <button
                      type="button"
                      onClick={() => supprimerMessage.mutate(message.id)}
                      className="hover:underline"
                    >
                      {t("groupes.supprimer_message")}
                    </button>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>

        {repondA && (
          <div className="flex items-center justify-between gap-2 border-t border-text-tertiary/10 bg-bg-secondary px-3 py-1.5 text-xs text-text-tertiary">
            <span className="truncate">
              {t("messagerie.reponse_a", { texte: repondA.apercu.contenu })}
            </span>
            <button
              type="button"
              onClick={() => setRepondA(null)}
              aria-label={t("messagerie.annuler_reponse")}
              className="shrink-0 hover:text-text-secondary"
            >
              <IconX size={14} />
            </button>
          </div>
        )}

        <form
          onSubmit={envoyerMessage}
          className="relative flex gap-2 border-t border-text-tertiary/10 p-2"
        >
          {suggestionsMention.length > 0 && (
            <div className="absolute bottom-full left-2 z-10 mb-1 w-48 rounded-cid-lg bg-bg-primary py-1 shadow-xl">
              {suggestionsMention.map((auteur) => (
                <button
                  key={auteur.id}
                  type="button"
                  onClick={() => choisirMention(auteur)}
                  className="block w-full px-3 py-1 text-left text-xs hover:bg-bg-tertiary"
                >
                  {auteur.prenom} {auteur.nom}
                </button>
              ))}
            </div>
          )}
          <EmojiPicker onSelect={(emoji) => setTexte((t2) => `${t2}${emoji}`)} />
          <input
            type="text"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={t("groupes.placeholder_message")}
            disabled={statut !== "ouvert"}
            className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={statut !== "ouvert"}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("groupes.envoyer")}
          </button>
        </form>
        {erreur && <p className="px-2 pb-2 text-xs text-status-dangerText">{erreur}</p>}
      </div>
    </div>
  );
}
