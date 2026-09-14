/**
 * Page "Messagerie privée" — liste des conversations (Release Plan §3.2 "Conversations
 * 1-to-1 chiffrées AES-256, indicateur 'lu'"). Démarrer une conversation cherche un membre
 * par nom via `useRechercherMembres` (endpoint dédié communaute — PAS `useMembresList` de
 * apps/membres, qui est volontairement verrouillé à RH+ pour tout rôle Membre standard, voir
 * MembreViewSet.get_queryset côté backend ; utiliser cette liste ici rendait la recherche de
 * destinataire silencieusement vide pour la quasi-totalité des membres, bug remonté en test
 * manuel Phase 4) puis crée/retrouve la conversation via REST (`useCreerConversation` —
 * idempotent côté backend, voir Conversation.get_or_create_entre) ; l'ENVOI des messages,
 * lui, passe exclusivement par le WebSocket, voir MessagerieConversationPage.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  useCreerConversation,
  useConversations,
  useRechercherMembres,
} from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function initiales(auteur: { prenom: string; nom: string }): string {
  return `${auteur.prenom.charAt(0)}${auteur.nom.charAt(0)}`.toUpperCase();
}

export default function MessageriePage() {
  const { t } = useTranslation("communaute");
  const navigate = useNavigate();
  const conversationsQuery = useConversations();
  const creerConversation = useCreerConversation();
  const moi = useAuthStore((s) => s.user);

  const [recherche, setRecherche] = useState("");
  const membresQuery = useRechercherMembres(recherche);

  function demarrerConversation(membreId: string) {
    creerConversation.mutate(membreId, {
      onSuccess: (conversation) => {
        setRecherche("");
        navigate(`/messagerie/${conversation.id}`);
      },
    });
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("messagerie.titre")}</h1>

      <div className="mb-4 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t("messagerie.rechercher_membre")}
          className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
        />
        {recherche.length >= 2 && (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {membresQuery.data
              ?.filter((m) => m.id !== moi?.id)
              .map((membre) => (
                <button
                  key={membre.id}
                  type="button"
                  onClick={() => demarrerConversation(membre.id)}
                  className="flex w-full items-center gap-2 rounded-cid px-2 py-1 text-left text-sm hover:bg-bg-secondary"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cal text-[9px] font-bold text-cad">
                    {initiales(membre)}
                  </span>
                  {membre.prenom} {membre.nom}
                </button>
              ))}
            {membresQuery.data?.length === 0 && (
              <p className="px-2 py-1 text-xs text-text-tertiary">
                {t("messagerie.aucun_membre_trouve")}
              </p>
            )}
          </div>
        )}
      </div>

      {conversationsQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("messagerie.chargement")}</p>
      )}
      {conversationsQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("messagerie.erreur_chargement")}</p>
      )}
      {conversationsQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("messagerie.aucune_conversation")}</p>
      )}

      <div className="space-y-2">
        {conversationsQuery.data?.results.map((conversation) => (
          <button
            key={conversation.id}
            type="button"
            onClick={() => navigate(`/messagerie/${conversation.id}`)}
            className="flex w-full items-center gap-3 rounded-cid-lg bg-bg-primary p-3 text-left shadow-sm hover:bg-bg-secondary"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ca text-xs font-bold text-white">
              {conversation.autre_participant ? initiales(conversation.autre_participant) : "?"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-primary">
                  {conversation.autre_participant
                    ? `${conversation.autre_participant.prenom} ${conversation.autre_participant.nom}`
                    : t("messagerie.membre_inconnu")}
                </span>
                {conversation.nombre_non_lus > 0 && (
                  <span className="ml-2 rounded-full bg-ca px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {conversation.nombre_non_lus}
                  </span>
                )}
              </span>
              {conversation.dernier_message && (
                <span className="block truncate text-xs text-text-tertiary">
                  {conversation.dernier_message.contenu} ·{" "}
                  {formatDate(conversation.dernier_message.created_at)}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
