/**
 * Page "Conversation privée" (mockup #pg-messagerie, thread ouvert) — historique REST +
 * envoi/réception temps réel par WebSocket (voir hooks/useMessagerieSocket.ts et son
 * docstring : envoyer un message ne passe JAMAIS par un POST REST). Les messages reçus par
 * le socket sont ajoutés à la suite de l'historique chargé au montage (dédoublonnés par id
 * au cas où le serveur renverrait un message déjà présent dans la première page REST).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { useMessagesPrives, useSupprimerMessagePrive } from "../../hooks/useCommunaute";
import { useMessagerieSocket } from "../../hooks/useMessagerieSocket";
import { useAuthStore } from "../../store/authStore";

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
    erreur,
    envoyer,
    marquerLu,
  } = useMessagerieSocket(id);
  const supprimerMessage = useSupprimerMessagePrive();

  const [texte, setTexte] = useState("");

  useEffect(() => {
    if (statut === "ouvert") marquerLu();
  }, [statut, marquerLu]);

  const tousLesMessages = useMemo(() => {
    const supprimes = new Set(messagesSupprimesIds);
    const historique = (historiqueQuery.data?.results ?? []).filter((m) => !supprimes.has(m.id));
    const idsHistorique = new Set(historique.map((m) => m.id));
    const nouveaux = messagesTempsReel.filter((m) => !idsHistorique.has(m.id));
    return [
      ...historique.map((m) => ({
        id: m.id,
        contenu: m.contenu,
        expediteur: m.expediteur,
        created_at: m.created_at,
        estMoi: m.est_expediteur,
      })),
      ...nouveaux.map((m) => ({
        id: m.id,
        contenu: m.contenu,
        expediteur: m.expediteur,
        created_at: m.created_at,
        estMoi: m.expediteur === moi?.id,
      })),
    ];
  }, [historiqueQuery.data, messagesTempsReel, messagesSupprimesIds, moi?.id]);

  function envoyerMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    envoyer(texte);
    setTexte("");
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
              className={`max-w-[75%] rounded-cid px-3 py-1.5 text-sm ${
                message.estMoi
                  ? "ml-auto bg-ca text-white"
                  : "bg-bg-secondary text-text-secondary"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.contenu}</p>
              <p
                className={`mt-0.5 flex items-center gap-2 text-[10px] ${message.estMoi ? "text-white/70" : "text-text-tertiary"}`}
              >
                {formatHeure(message.created_at)}
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

        <form onSubmit={envoyerMessage} className="flex gap-2 border-t border-text-tertiary/10 p-2">
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
