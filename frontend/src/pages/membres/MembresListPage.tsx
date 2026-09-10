/**
 * Répertoire des membres (mockup #pg-admin-membres). Backend scope déjà le
 * queryset selon le rôle (apps.membres.views.MembreViewSet.get_queryset) :
 * un rôle < RH ne voit ici que sa propre fiche, sans qu'on ait besoin de
 * dupliquer cette logique côté frontend.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StatutBadge from "../../components/ui/StatutBadge";
import { useDeleteMembre, useMembresList } from "../../hooks/useMembres";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { PAYS_ALLEMAGNE } from "../../types/membre";
import type { StatutMembre } from "../../types/membre";

function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

export default function MembresListPage() {
  const { t } = useTranslation("membres");
  const user = useAuthStore((s) => s.user);
  const peutGerer = hasRoleAtLeast(user, ROLE_LEVELS.rh);
  const peutSupprimer = hasRoleAtLeast(user, ROLE_LEVELS.bureau_admin);

  const [statut, setStatut] = useState<StatutMembre | "">("");
  const [ville, setVille] = useState("");
  const [q, setQ] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<{ id: string; nom: string } | null>(null);

  const filters = { statut, ville, q };
  const { data, isLoading, isError } = useMembresList(filters, pageUrl);
  const deleteMutation = useDeleteMembre();

  function appliquerFiltres(e: React.FormEvent) {
    e.preventDefault();
    setPageUrl(null); // toute modification de filtre repart de la première page
  }

  function reinitialiserFiltres() {
    setStatut("");
    setVille("");
    setQ("");
    setPageUrl(null);
  }

  function confirmerSuppression() {
    if (!aSupprimer) return;
    deleteMutation.mutate(aSupprimer.id, { onSuccess: () => setASupprimer(null) });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">{t("liste.titre")}</h1>
        {peutGerer && (
          <Link
            to="/membres/nouveau"
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
          >
            + {t("liste.ajouter")}
          </Link>
        )}
      </div>

      <form
        onSubmit={appliquerFiltres}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("liste.filtre_statut")}
          </label>
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value as StatutMembre | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("liste.tous_statuts")}</option>
            <option value="actif">{t("statut.actif")}</option>
            <option value="en_attente">{t("statut.en_attente")}</option>
            <option value="inactif">{t("statut.inactif")}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("liste.filtre_ville")}
          </label>
          <input
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            placeholder={t("liste.filtre_ville_placeholder") ?? ""}
          />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            {t("liste.recherche")}
          </label>
          <input
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
          onClick={reinitialiserFiltres}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
        >
          {t("liste.reinitialiser")}
        </button>
      </form>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("liste.col_membre")}</th>
              <th className="px-4 py-2">{t("liste.col_ville")}</th>
              <th className="px-4 py-2">{t("liste.col_cin")}</th>
              <th className="px-4 py-2">{t("liste.col_email")}</th>
              <th className="px-4 py-2">{t("liste.col_statut")}</th>
              <th className="px-4 py-2">{t("liste.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.chargement")}
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-status-dangerText">
                  {t("liste.erreur")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.aucun_resultat")}
                </td>
              </tr>
            )}
            {data?.results.map((membre) => (
              <tr key={membre.id} className="border-b border-text-tertiary/10 last:border-0">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cal text-[10px] font-semibold text-ca">
                      {initiales(membre.prenom, membre.nom)}
                    </div>
                    <div>
                      <div className="font-medium text-text-primary">
                        {membre.prenom} {membre.nom}
                      </div>
                      <div className="text-xs text-text-tertiary">{membre.numero_membre}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  {membre.pays === PAYS_ALLEMAGNE ? membre.ville_de : t(`pays.${membre.pays}`)}
                </td>
                <td className="px-4 py-2">{membre.cin_masque}</td>
                <td className="px-4 py-2">{membre.email}</td>
                <td className="px-4 py-2">
                  <StatutBadge statut={membre.statut} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <Link
                      to={`/membres/${membre.id}`}
                      className="rounded-cid px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                      aria-label={t("liste.voir")}
                    >
                      {t("liste.voir")}
                    </Link>
                    {peutGerer && (
                      <Link
                        to={`/membres/${membre.id}/modifier`}
                        className="rounded-cid px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                      >
                        {t("liste.modifier")}
                      </Link>
                    )}
                    {peutSupprimer && (
                      <button
                        type="button"
                        onClick={() =>
                          setASupprimer({ id: membre.id, nom: `${membre.prenom} ${membre.nom}` })
                        }
                        className="rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                      >
                        {t("liste.supprimer")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
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

      <ConfirmDialog
        open={aSupprimer !== null}
        title={t("liste.confirmer_suppression_titre")}
        message={t("liste.confirmer_suppression_message", { nom: aSupprimer?.nom })}
        danger
        onConfirm={confirmerSuppression}
        onCancel={() => setASupprimer(null)}
      />
    </div>
  );
}
