/**
 * Page "Conversation privée" (mockup #pg-messagerie, thread ouvert) — historique REST +
 * envoi/réception temps réel par WebSocket (voir hooks/useMessagerieSocket.ts et son
 * docstring : envoyer un message ne passe JAMAIS par un POST REST). Les messages reçus par
 * le socket sont ajoutés à la suite de l'historique chargé au montage (dédoublonnés par id
 * au cas où le serveur renverrait un message déjà présent dans la première page REST).
 *
 * "Like oder antworten" (demande utilisateur 2026-09-25) : le like passe par un POST REST
 * (voir useLikerMessagePrive) diffusé en temps réel à tous les participants — y compris
 * l'expéditeur du clic lui-même, dont le compteur `nombre_likes`/`jaime` de base (chargé via
 * REST) est donc mis à jour par le même mécanisme que pour l'autre participant, jamais
 * localement de façon optimiste. La réponse ("Antworten") est une citation à un seul niveau
 * (`repond_a`), envoyée avec le message via le WebSocket lui-même — pas de thread imbriqué.
 */
import { useEffect, useMemo, useState } from "react";
import { IconArrowBackUp, IconHeart, IconHeartFilled, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import EmojiPicker from "../../components/ui/EmojiPicker";
import {
  useLikerMessagePrive,
  useMessagesPrives,
  useSupprimerMessagePrive,
} from "../../hooks/useCommunaute";
import { useMessagerieSocket } from "../../hooks/useMessagerieSocket";
import { useAuthStore } from "../../store/authStore";
import type { MessageApercu } from "../../types/communaute";

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessagerieConversationPage() {
  const { t } = useTranslation("communaute");
  const { id } = useParams<{ id: string }>();
  const moi = useAuthStore((s) => s.user);

  const historiqueQuery = useMessagesPrives(id);
  const {
    statut,
    messages: messagesTempsReel,
    messagesSupprimesIds,
    likesRecus,
    erreur,
    envoyer,
    marquerLu,
  } = useMessagerieSocket(id);
  const supprimerMessage = useSupprimerMessagePrive();
  const likerMessage = useLikerMessagePrive();

  const [texte, setTexte] = useState("");
  const [repondA, setRepondA] = useState<{ id: string; apercu: MessageApercu } | null>(null);

  useEffect(() => {
    if (statut === "ouvert") marquerLu();
  }, [statut, marquerLu]);

  // Réplique chaque évènement "like" reçu depuis l'ouverture de la connexion (voir
  // useMessagerieSocket.ts) : le compteur partagé s'applique toujours, le "jaime" du membre
  // courant seulement si l'évènement le concerne (voir docstring MessagePriveSerializer).
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
          expediteur: m.expediteur,
          created_at: m.created_at,
          estMoi: m.est_expediteur,
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
          expediteur: m.expediteur,
          created_at: m.created_at,
          estMoi: m.expediteur === moi?.id,
          nombreLikes: maj?.nombre_likes ?? m.nombre_likes,
          jaime: maj?.jaime ?? false,
          repondADetail: m.repond_a_detail,
        };
      }),
    ];
  }, [historiqueQuery.data, messagesTempsReel, messagesSupprimesIds, likesParMessage, moi?.id]);

  function envoyerMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    envoyer(texte, repondA?.id);
    setTexte("");
    setRepondA(null);
  }

  return (
    <div>
      <Link to="/messagerie" className="mb-3 inline-block text-xs text-ca hover:underline">
        {t("messagerie.retour_liste")}
      </Link>

      <div className="flex h-[60vh] flex-col rounded-cid-lg bg-bg-primary shadow-sm">
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {historiqueQuery.isLoading && (
            <p className="text-sm text-text-tertiary">{t("messagerie.chargement")}</p>
          )}
          {tousLesMessages.map((message) => (
            <div
              key={message.id}
              className={`group max-w-[75%] rounded-cid px-3 py-1.5 text-sm ${
                message.estMoi ? "ml-auto bg-ca text-white" : "bg-bg-secondary text-text-secondary"
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
              <p className="whitespace-pre-wrap">{message.contenu}</p>
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
                    {t("messagerie.supprimer_message")}
                  </button>
                )}
              </p>
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

        <form onSubmit={envoyerMessage} className="flex gap-2 border-t border-text-tertiary/10 p-2">
          <EmojiPicker onSelect={(emoji) => setTexte((t2) => `${t2}${emoji}`)} />
          <input
            type="text"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={t("messagerie.placeholder_message")}
            disabled={statut !== "ouvert"}
            className="flex-1 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={statut !== "ouvert"}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("messagerie.envoyer")}
          </button>
        </form>
        {erreur && <p className="px-2 pb-2 text-xs text-status-dangerText">{erreur}</p>}
      </div>
    </div>
  );
}
