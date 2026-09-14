/**
 * Page "Groupes de chat" (mockup #pg-groupes, Release Plan §3.2 "Groupes public ou privé,
 * chat temps réel WebSocket, créer/rejoindre"). Liste des groupes visibles (publics + ceux
 * dont je fais déjà partie, voir GroupeChatViewSet.get_queryset côté backend) + création.
 * Rejoindre un groupe public est une action REST explicite (useRejoindreGroupe) — l'envoi
 * de messages, lui, passe exclusivement par WebSocket, voir GroupeChatPage.
 *
 * L'invitation à un groupe privé cherche un membre par nom via `useRechercherMembres`
 * (endpoint dédié communaute — PAS `useMembresList` de apps/membres, verrouillé à RH+ pour un
 * rôle Membre standard, voir MembreViewSet.get_queryset côté backend ; même bug que
 * MessageriePage, remonté en test manuel Phase 4).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  useCreerGroupe,
  useGroupes,
  useRechercherMembres,
  useRejoindreGroupe,
} from "../../hooks/useCommunaute";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function GroupesPage() {
  const { t } = useTranslation("communaute");
  const navigate = useNavigate();
  const groupesQuery = useGroupes();
  const creerGroupe = useCreerGroupe();
  const rejoindre = useRejoindreGroupe();

  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [typeGroupe, setTypeGroupe] = useState<"public" | "prive">("public");
  const [rechercheInvites, setRechercheInvites] = useState("");
  const [invites, setInvites] = useState<string[]>([]);
  const [erreur, setErreur] = useState("");

  const membresQuery = useRechercherMembres(typeGroupe === "prive" ? rechercheInvites : "");

  function creer(e: React.FormEvent) {
    e.preventDefault();
    if (!nom.trim()) return;
    creerGroupe.mutate(
      {
        nom,
        description,
        type_groupe: typeGroupe,
        membres_invites: typeGroupe === "prive" ? invites : undefined,
      },
      {
        onSuccess: (groupe) => {
          setNom("");
          setDescription("");
          setInvites([]);
          setAfficherFormulaire(false);
          navigate(`/groupes/${groupe.id}`);
        },
        onError: (err) => setErreur(extractApiErrorMessage(err, t("groupes.erreur_creation"))),
      },
    );
  }

  function ouvrirOuRejoindre(groupeId: string, estMembre: boolean) {
    if (estMembre) {
      navigate(`/groupes/${groupeId}`);
      return;
    }
    rejoindre.mutate(groupeId, { onSuccess: () => navigate(`/groupes/${groupeId}`) });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("groupes.titre")}</h1>
        <button
          type="button"
          onClick={() => setAfficherFormulaire((v) => !v)}
          className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad"
        >
          {t("groupes.nouveau_groupe")}
        </button>
      </div>

      {afficherFormulaire && (
        <form onSubmit={creer} className="mb-4 space-y-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t("groupes.nom_placeholder")}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("groupes.description_placeholder")}
            rows={2}
            className="w-full resize-none rounded-cid border border-text-tertiary/30 p-2 text-sm"
          />
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={typeGroupe === "public"}
                onChange={() => setTypeGroupe("public")}
              />
              {t("groupes.type_public")}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={typeGroupe === "prive"}
                onChange={() => setTypeGroupe("prive")}
              />
              {t("groupes.type_prive")}
            </label>
          </div>

          {typeGroupe === "prive" && (
            <div>
              <input
                type="text"
                value={rechercheInvites}
                onChange={(e) => setRechercheInvites(e.target.value)}
                placeholder={t("groupes.inviter_membres")}
                className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
              {rechercheInvites.length >= 2 && (
                <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                  {membresQuery.data?.map((membre) => (
                    <label key={membre.id} className="flex items-center gap-2 px-1 text-xs">
                      <input
                        type="checkbox"
                        checked={invites.includes(membre.id)}
                        onChange={(e) =>
                          setInvites((precedents) =>
                            e.target.checked
                              ? [...precedents, membre.id]
                              : precedents.filter((id) => id !== membre.id),
                          )
                        }
                      />
                      {membre.prenom} {membre.nom}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={creerGroupe.isPending}
            className="rounded-cid bg-ca px-4 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("groupes.creer")}
          </button>
          {erreur && <p className="text-xs text-status-dangerText">{erreur}</p>}
        </form>
      )}

      {groupesQuery.isLoading && (
        <p className="text-sm text-text-tertiary">{t("groupes.chargement")}</p>
      )}
      {groupesQuery.isError && (
        <p className="text-sm text-status-dangerText">{t("groupes.erreur_chargement")}</p>
      )}
      {groupesQuery.data?.results.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("groupes.aucun_groupe")}</p>
      )}

      <div className="space-y-2">
        {groupesQuery.data?.results.map((groupe) => (
          <div
            key={groupe.id}
            className="flex items-center justify-between rounded-cid-lg bg-bg-primary p-3 shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text-primary">{groupe.nom}</span>
                <span className="rounded bg-cal px-1.5 py-0.5 text-[10px] font-medium text-cad">
                  {t(`groupes.type_${groupe.type_groupe}`)}
                </span>
              </div>
              {groupe.description && (
                <p className="text-xs text-text-tertiary">{groupe.description}</p>
              )}
              <p className="text-[10px] text-text-tertiary">
                {t("groupes.nombre_membres", { count: groupe.nombre_membres })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => ouvrirOuRejoindre(groupe.id, groupe.est_membre)}
              className="rounded-cid bg-ca px-3 py-1 text-xs font-medium text-white hover:bg-cad"
            >
              {groupe.est_membre ? t("groupes.ouvrir") : t("groupes.rejoindre")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
