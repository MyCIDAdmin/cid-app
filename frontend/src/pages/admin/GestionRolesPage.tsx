/**
 * Gestion des rôles utilisateurs (SCD §4.2 : `GET /admin/rôles/`, réservée
 * Admin App — route gated par RequireRole au même niveau que UsersListView/
 * ChangeUserRoleView côté backend). Sert par exemple à retrouver un compte
 * après son inscription libre-service et sa validation par RH (voir
 * /inscriptions), puis à lui attribuer un rôle au-delà de Membre Normal —
 * il n'existe pas d'autre façon dans l'app de promouvoir un compte.
 *
 * Chaque changement est journalisé côté backend (AuditLogEntry, SCD §8.1) ;
 * un Admin App ne peut pas changer son propre rôle (ChangeUserRoleView),
 * la ligne correspondante est donc affichée mais son sélecteur désactivé.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useChangerRoleUtilisateur, useUtilisateursList } from "../../hooks/useUtilisateurs";
import { useAuthStore } from "../../store/authStore";
import { ROLES } from "../../types/utilisateur";
import type { CidUser } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function GestionRolesPage() {
  const { t } = useTranslation("utilisateurs");
  const moi = useAuthStore((s) => s.user);

  const [q, setQ] = useState("");
  const [rechercheAppliquee, setRechercheAppliquee] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [nouveauxRoles, setNouveauxRoles] = useState<Record<string, CidUser["role"] | "">>({});
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useUtilisateursList(rechercheAppliquee, pageUrl);
  const changerRoleMutation = useChangerRoleUtilisateur();

  function rechercher(e: React.FormEvent) {
    e.preventDefault();
    setRechercheAppliquee(q);
    setPageUrl(null);
  }

  function reinitialiser() {
    setQ("");
    setRechercheAppliquee("");
    setPageUrl(null);
  }

  function appliquer(utilisateur: { id: string; email: string }) {
    const role = nouveauxRoles[utilisateur.id];
    if (!role) return;
    setMessageSucces(null);
    setErreurs((prev) => ({ ...prev, [utilisateur.id]: "" }));
    changerRoleMutation.mutate(
      { id: utilisateur.id, role },
      {
        onSuccess: () => {
          setNouveauxRoles((prev) => ({ ...prev, [utilisateur.id]: "" }));
          setMessageSucces(
            t("liste.succes_message", { email: utilisateur.email, role: t(`role.${role}`) }),
          );
        },
        onError: (error) =>
          setErreurs((prev) => ({
            ...prev,
            [utilisateur.id]: extractApiErrorMessage(error, t("liste.erreur_action")),
          })),
      },
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("liste.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("liste.description")}</p>

      {messageSucces && (
        <div className="mb-4 rounded-cid border border-status-successText/30 bg-status-successBg px-3 py-2 text-sm text-status-successText">
          {messageSucces}
        </div>
      )}

      <form
        onSubmit={rechercher}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      >
        <div className="min-w-[14rem] flex-1">
          <label
            htmlFor="utilisateurs-recherche"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.recherche")}
          </label>
          <input
            id="utilisateurs-recherche"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            placeholder={t("liste.recherche_placeholder") ?? ""}
          />
        </div>
        <button
          type="submit"
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
        >
          {t("liste.filtrer")}
        </button>
        <button
          type="button"
          onClick={reinitialiser}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
        >
          {t("liste.reinitialiser")}
        </button>
      </form>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("liste.col_nom")}</th>
              <th className="px-4 py-2">{t("liste.col_email")}</th>
              <th className="px-4 py-2">{t("liste.col_role_actuel")}</th>
              <th className="px-4 py-2">{t("liste.col_statut")}</th>
              <th className="px-4 py-2">{t("liste.col_nouveau_role")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.chargement")}
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-status-dangerText">
                  {t("liste.erreur_chargement")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.aucun_resultat")}
                </td>
              </tr>
            )}
            {data?.results.map((utilisateur) => {
              const estMoi = utilisateur.id === moi?.id;
              const roleChoisi = nouveauxRoles[utilisateur.id] ?? "";
              return (
                <tr key={utilisateur.id} className="border-b border-text-tertiary/10 last:border-0">
                  <td className="px-4 py-2 font-medium text-text-primary">
                    {utilisateur.prenom || utilisateur.nom
                      ? `${utilisateur.prenom} ${utilisateur.nom}`.trim()
                      : "—"}
                    {estMoi && (
                      <span className="ml-1 text-xs text-text-tertiary">
                        ({t("liste.vous")})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-text-secondary">{utilisateur.email}</td>
                  <td className="px-4 py-2 text-text-secondary">{t(`role.${utilisateur.role}`)}</td>
                  <td className="px-4 py-2 text-text-secondary">
                    {utilisateur.is_active ? t("liste.actif") : t("liste.inactif")}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <select
                        aria-label={t("liste.col_nouveau_role")}
                        value={roleChoisi}
                        disabled={estMoi}
                        onChange={(e) =>
                          setNouveauxRoles((prev) => ({
                            ...prev,
                            [utilisateur.id]: e.target.value as CidUser["role"] | "",
                          }))
                        }
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs disabled:opacity-40"
                      >
                        <option value="">{t("liste.choisir_role")}</option>
                        {ROLES.filter((r) => r.value !== utilisateur.role).map((r) => (
                          <option key={r.value} value={r.value}>
                            {t(r.labelKey)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={estMoi || !roleChoisi || changerRoleMutation.isPending}
                        onClick={() => appliquer(utilisateur)}
                        className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                      >
                        {t("liste.appliquer")}
                      </button>
                    </div>
                    {erreurs[utilisateur.id] && (
                      <p className="mt-1 text-xs text-status-dangerText">
                        {erreurs[utilisateur.id]}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={!data?.previous}
          onClick={() => setPageUrl(data?.previous ?? null)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
        >
          {t("liste.precedent")}
        </button>
        <button
          type="button"
          disabled={!data?.next}
          onClick={() => setPageUrl(data?.next ?? null)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
        >
          {t("liste.suivant")}
        </button>
      </div>
    </div>
  );
}
