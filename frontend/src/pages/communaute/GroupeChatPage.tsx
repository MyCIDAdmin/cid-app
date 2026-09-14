/**
 * Page "Groupe de chat" (mockup #pg-groupes, thread ouvert) — historique REST + envoi/
 * réception temps réel par WebSocket (voir hooks/useGroupeChatSocket.ts : envoyer un
 * message ne passe JAMAIS par un POST REST). "Quitter" reste une action REST explicite.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useGroupe, useMessagesGroupe, useQuitterGroupe } from "../../hooks/useCommunaute";
import { useGroupeChatSocket } from "../../hooks/useGroupeChatSocket";
import { useAuthStore } from "../../store/authStore";

function formatHeure(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function GroupeChatPage() {
  const { t } = useTranslation("communaute");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const moi = useAuthStore((s) => s.user);

  const groupeQuery = useGroupe(id);
  const historiqueQuery = useMessagesGroupe(id);
  const quitter = useQuitterGroupe();
  const { statut, messages: messagesTempsReel, erreur, envoyer } = useGroupeChatSocket(id);

  const [texte, setTexte] = useState("");

  const tousLesMessages = useMemo(() => {
    const historique = historiqueQuery.data?.results ?? [];
    const idsHistorique = new Set(historique.map((m) => m.id));
    const nouveaux = messagesTempsReel.filter((m) => !idsHistorique.has(m.id));
    return [
      ...historique.map((m) => ({
        id: m.id,
        contenu: m.contenu,
        auteur: m.auteur,
        created_at: m.created_at,
        estMoi: m.est_auteur,
      })),
      ...nouveaux.map((m) => ({
        id: m.id,
        contenu: m.contenu,
        auteur: m.auteur,
        created_at: m.created_at,
        estMoi: m.auteur.id === moi?.id,
      })),
    ];
  }, [historiqueQuery.data, messagesTempsReel, moi?.id]);

  function envoyerMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!texte.trim()) return;
    envoyer(texte);
    setTexte("");
  }

  function handleQuitter() {
    if (!id) return;
    quitter.mutate(id, { onSuccess: () => navigate("/groupes") });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Link to="/groupes" className="text-xs text-ca hover:underline">
          {t("groupes.retour_liste")}
        </Link>
        <button type="button" onClick={handleQuitter} className="text-xs text-status-dangerText hover:underline">
          {t("groupes.quitter")}
        </button>
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
            <div key={message.id} className={message.estMoi ? "ml-auto max-w-[75%]" : "max-w-[75%]"}>
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
                <p className="whitespace-pre-wrap">{message.contenu}</p>
                <p
                  className={`mt-0.5 text-[10px] ${message.estMoi ? "text-white/70" : "text-text-tertiary"}`}
                >
                  {formatHeure(message.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={envoyerMessage} className="flex gap-2 border-t border-text-tertiary/10 p-2">
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
