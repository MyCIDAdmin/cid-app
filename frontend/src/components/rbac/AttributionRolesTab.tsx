/**
 * Onglet "Zuweisung" — Modul Rollenverwaltung (Phase C, 2026-09-23). Reprend le contenu de
 * l'ancienne GestionRolesPage (SCD §4.2) mais remplace le `<select>` mono-rôle par une
 * case-à-cocher par rôle (Mehrfachrollen, POST /rbac/utilisateurs/{id}/roles/) — le rôle
 * "Normales Mitglied" reste toujours coché et verrouillé (plancher imposé côté backend,
 * UserRolesView.post). La liste des rôles disponibles vient de `useRbacMatrice()`
 * (`matrice.roles`, non paginée) plutôt que d'un nouvel appel à `GET /rbac/roles/`.
 */
import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUtilisateursList } from "../../hooks/useUtilisateurs";
import { useAssignerRolesUtilisateur, useRbacMatrice, useRolesUtilisateur } from "../../hooks/useRbac";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function AttributionRolesTab() {
  const { t } = useTranslation(["utilisateurs", "rbac"]);
  const moi = useAuthStore((s) => s.user);

  const [q, setQ] = useState("");
  const [rechercheAppliquee, setRechercheAppliquee] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [utilisateurOuvert, setUtilisateurOuvert] = useState<string | null>(null);
  const [rolesEnCours, setRolesEnCours] = useState<string[]>([]);
  const [messageSucces, setMessageSucces] = useState<string | null>(null);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useUtilisateursList(rechercheAppliquee, pageUrl);
  const { data: matrice } = useRbacMatrice();
  const rolesUtilisateurQuery = useRolesUtilisateur(utilisateurOuvert ?? "", !!utilisateurOuvert);
  const assignerRolesMutation = useAssignerRolesUtilisateur();

  const roleMembre = matrice?.roles.find((r) => r.slug === "membre" && r.is_system);

  useEffect(() => {
    if (utilisateurOuvert && rolesUtilisateurQuery.data) {
      setRolesEnCours(rolesUtilisateurQuery.data.role_ids);
    }
  }, [utilisateurOuvert, rolesUtilisateurQuery.data]);

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

  function ouvrirGestionRoles(utilisateurId: string) {
    setMessageSucces(null);
    setErreurs((prev) => ({ ...prev, [utilisateurId]: "" }));
    setUtilisateurOuvert(utilisateurOuvert === utilisateurId ? null : utilisateurId);
    setRolesEnCours([]);
  }

  function basculerRole(roleId: string) {
    if (roleId === roleMembre?.id) return;
    setRolesEnCours((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId],
    );
  }

  function enregistrer(utilisateur: { id: string; email: string }) {
    setErreurs((prev) => ({ ...prev, [utilisateur.id]: "" }));
    assignerRolesMutation.mutate(
      { userId: utilisateur.id, roleIds: rolesEnCours },
      {
        onSuccess: () => {
          setUtilisateurOuvert(null);
          setMessageSucces(t("rbac:attribution.succes_message", { email: utilisateur.email }));
        },
        onError: (error) =>
          setErreurs((prev) => ({
            ...prev,
            [utilisateur.id]: extractApiErrorMessage(error, t("rbac:attribution.erreur_action")),
          })),
      },
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("utilisateurs:liste.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("utilisateurs:liste.description")}</p>

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
            {t("utilisateurs:liste.recherche")}
          </label>
          <input
            id="utilisateurs-recherche"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            placeholder={t("utilisateurs:liste.recherche_placeholder") ?? ""}
          />
        </div>
        <button
          type="submit"
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
        >
          {t("utilisateurs:liste.filtrer")}
        </button>
        <button
          type="button"
          onClick={reinitialiser}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
        >
          {t("utilisateurs:liste.reinitialiser")}
        </button>
      </form>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("utilisateurs:liste.col_nom")}</th>
              <th className="px-4 py-2">{t("utilisateurs:liste.col_email")}</th>
              <th className="px-4 py-2">{t("utilisateurs:liste.col_role_actuel")}</th>
              <th className="px-4 py-2">{t("utilisateurs:liste.col_statut")}</th>
              <th className="px-4 py-2">{t("rbac:attribution.col_roles_attribues")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">
                  {t("utilisateurs:liste.chargement")}
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-status-dangerText">
                  {t("utilisateurs:liste.erreur_chargement")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">
                  {t("utilisateurs:liste.aucun_resultat")}
                </td>
              </tr>
            )}
            {data?.results.map((utilisateur) => {
              const estMoi = utilisateur.id === moi?.id;
              const estOuvert = utilisateurOuvert === utilisateur.id;
              return (
                <Fragment key={utilisateur.id}>
                  <tr className="border-b border-text-tertiary/10 last:border-0">
                    <td className="px-4 py-2 font-medium text-text-primary">
                      {utilisateur.prenom || utilisateur.nom
                        ? `${utilisateur.prenom} ${utilisateur.nom}`.trim()
                        : "—"}
                      {estMoi && (
                        <span className="ml-1 text-xs text-text-tertiary">
                          ({t("utilisateurs:liste.vous")})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{utilisateur.email}</td>
                    <td className="px-4 py-2 text-text-secondary">
                      {t(`utilisateurs:role.${utilisateur.role}`)}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">
                      {utilisateur.is_active
                        ? t("utilisateurs:liste.actif")
                        : t("utilisateurs:liste.inactif")}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        disabled={estMoi}
                        onClick={() => ouvrirGestionRoles(utilisateur.id)}
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
                      >
                        {estOuvert
                          ? t("rbac:attribution.fermer")
                          : t("rbac:attribution.gerer_roles")}
                      </button>
                      {erreurs[utilisateur.id] && (
                        <p className="mt-1 text-xs text-status-dangerText">
                          {erreurs[utilisateur.id]}
                        </p>
                      )}
                    </td>
                  </tr>
                  {estOuvert && (
                    <tr className="border-b border-text-tertiary/10 bg-bg-secondary/40 last:border-0">
                      <td colSpan={5} className="px-4 py-3">
                        {rolesUtilisateurQuery.isLoading ? (
                          <p className="text-xs text-text-tertiary">
                            {t("rbac:attribution.chargement_roles")}
                          </p>
                        ) : rolesUtilisateurQuery.isError ? (
                          <p className="text-xs text-status-dangerText">
                            {t("rbac:attribution.erreur_chargement_roles")}
                          </p>
                        ) : (
                          <div>
                            <div className="mb-3 flex flex-wrap gap-3">
                              {matrice?.roles.map((role) => (
                                <label
                                  key={role.id}
                                  className="flex items-center gap-1.5 text-xs text-text-secondary"
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      role.id === roleMembre?.id || rolesEnCours.includes(role.id)
                                    }
                                    disabled={role.id === roleMembre?.id}
                                    onChange={() => basculerRole(role.id)}
                                    className="rounded"
                                  />
                                  {role.nom}
                                </label>
                              ))}
                            </div>
                            <p className="mb-3 text-[11px] text-text-tertiary">
                              {t("rbac:attribution.role_membre_verrouille")}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={assignerRolesMutation.isPending}
                                onClick={() => enregistrer(utilisateur)}
                                className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                              >
                                {t("rbac:attribution.enregistrer")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setUtilisateurOuvert(null)}
                                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary"
                              >
                                {t("rbac:attribution.annuler")}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
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
          {t("utilisateurs:liste.precedent")}
        </button>
        <button
          type="button"
          disabled={!data?.next}
          onClick={() => setPageUrl(data?.next ?? null)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
        >
          {t("utilisateurs:liste.suivant")}
        </button>
      </div>
    </div>
  );
}
