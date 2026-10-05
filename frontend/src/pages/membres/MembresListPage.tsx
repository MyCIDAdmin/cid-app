/**
 * Répertoire des membres (mockup #pg-admin-membres). Backend scope déjà le
 * queryset selon le rôle (apps.membres.views.MembreViewSet.get_queryset) :
 * un rôle < RH ne voit ici que sa propre fiche, sans qu'on ait besoin de
 * dupliquer cette logique côté frontend.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import ExportChampsDialog from "../../components/membres/ExportChampsDialog";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import StatutBadge from "../../components/ui/StatutBadge";
import { exporterMembres } from "../../api/membres";
import type { MembresOrdering } from "../../api/membres";
import { useDeleteMembre, useMembresList } from "../../hooks/useMembres";
import { ROLE_LEVELS, hasRoleAtLeast, useAuthStore } from "../../store/authStore";
import { BUNDESLANDER, CHAMPS_EXPORT, PAYS_ALLEMAGNE, PAYS_MEMBRE } from "../../types/membre";
import type { ChampExport, StatutMembre } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

const TOUS_LES_CHAMPS_EXPORT: ChampExport[] = CHAMPS_EXPORT.map((c) => c.value);

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
  // Ajoutés le 2026-09-19 (demande utilisateur : "füge mehr Filtermöglichten hinzu z.B.
  // Bundesland") — le backend (apps.membres.filters.MembreFilter) les supportait déjà, seule
  // l'UI manquait.
  const [land, setLand] = useState("");
  const [pays, setPays] = useState("");
  const [dateAdhesionApres, setDateAdhesionApres] = useState("");
  const [dateAdhesionAvant, setDateAdhesionAvant] = useState("");
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<{ id: string; nom: string } | null>(null);
  // Tri utilisé uniquement pour l'export Excel (demande utilisateur du 2026-09-16) — l'écran
  // reste paginé par curseur à ordre fixe (nom, prénom, voir MembreCursorPagination côté
  // backend), qui ne supporte pas un tri dynamique par requête ; le fichier exporté, lui, n'est
  // pas paginé et peut donc être trié librement (voir apps.membres.exports côté backend).
  const [ordering, setOrdering] = useState<MembresOrdering>("nom");
  const [exportEnCours, setExportEnCours] = useState(false);
  const [erreurExport, setErreurExport] = useState<string | null>(null);
  const [exportDialogOuvert, setExportDialogOuvert] = useState(false);
  // Toutes les colonnes cochées par défaut à l'ouverture de la boîte de dialogue — l'utilisateur
  // décoche celles qu'il ne veut pas plutôt que de partir d'une sélection vide.
  const [champsExport, setChampsExport] = useState<ChampExport[]>(TOUS_LES_CHAMPS_EXPORT);

  const filters = {
    statut,
    ville,
    q,
    land,
    pays,
    date_adhesion_apres: dateAdhesionApres,
    date_adhesion_avant: dateAdhesionAvant,
  };
  const { data, isLoading, isError } = useMembresList(filters, pageUrl);
  const deleteMutation = useDeleteMembre();

  async function exporter() {
    // La boîte de dialogue ne sert qu'à choisir les colonnes — une fois confirmée, elle se
    // ferme immédiatement ; le téléchargement lui-même (succès ou erreur) suit le même
    // affichage qu'avant (bouton "en cours", erreur sous le formulaire de filtres).
    setExportDialogOuvert(false);
    setErreurExport(null);
    setExportEnCours(true);
    try {
      const { blob, nomFichier } = await exporterMembres({
        ...filters,
        ordering,
        champs: champsExport,
      });
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nomFichier;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("liste.export_erreur")));
    } finally {
      setExportEnCours(false);
    }
  }

  function toggleChampExport(champ: ChampExport) {
    setChampsExport((prev) =>
      prev.includes(champ) ? prev.filter((c) => c !== champ) : [...prev, champ],
    );
  }

  function appliquerFiltres(e: React.FormEvent) {
    e.preventDefault();
    setPageUrl(null); // toute modification de filtre repart de la première page
  }

  function reinitialiserFiltres() {
    setStatut("");
    setVille("");
    setQ("");
    setLand("");
    setPays("");
    setDateAdhesionApres("");
    setDateAdhesionAvant("");
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
          <div className="flex gap-2">
            <Link
              to="/membres/import"
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("liste.importer")}
            </Link>
            <Link
              to="/membres/nouveau"
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
            >
              + {t("liste.ajouter")}
            </Link>
          </div>
        )}
      </div>

      <form
        onSubmit={appliquerFiltres}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      >
        <div>
          <label
            htmlFor="membres-filtre-statut"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_statut")}
          </label>
          <select
            id="membres-filtre-statut"
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
          <label
            htmlFor="membres-filtre-ville"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_ville")}
          </label>
          <input
            id="membres-filtre-ville"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            placeholder={t("liste.filtre_ville_placeholder") ?? ""}
          />
        </div>
        <div>
          <label
            htmlFor="membres-filtre-land"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_land")}
          </label>
          <select
            id="membres-filtre-land"
            value={land}
            onChange={(e) => setLand(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("liste.tous_lander")}</option>
            {BUNDESLANDER.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="membres-filtre-pays"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_pays")}
          </label>
          <select
            id="membres-filtre-pays"
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("liste.tous_pays")}</option>
            {PAYS_MEMBRE.map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="membres-filtre-adhesion-apres"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_adhesion_apres")}
          </label>
          <input
            id="membres-filtre-adhesion-apres"
            type="date"
            value={dateAdhesionApres}
            onChange={(e) => setDateAdhesionApres(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="membres-filtre-adhesion-avant"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.filtre_adhesion_avant")}
          </label>
          <input
            id="membres-filtre-adhesion-avant"
            type="date"
            value={dateAdhesionAvant}
            onChange={(e) => setDateAdhesionAvant(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[10rem]">
          <label
            htmlFor="membres-recherche"
            className="mb-1 block text-xs font-medium text-text-secondary"
          >
            {t("liste.recherche")}
          </label>
          <input
            id="membres-recherche"
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

        {peutGerer && (
          <>
            {/* Tri : n'affecte que l'export Excel ci-dessous, pas le tableau à l'écran (voir
                commentaire sur `ordering` plus haut). */}
            <div className="ml-auto">
              <label
                htmlFor="membres-tri"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("liste.trier_par")}
              </label>
              <select
                id="membres-tri"
                value={ordering}
                onChange={(e) => setOrdering(e.target.value as MembresOrdering)}
                className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              >
                <option value="nom">{t("liste.tri_nom_asc")}</option>
                <option value="-nom">{t("liste.tri_nom_desc")}</option>
                <option value="-date_adhesion">{t("liste.tri_date_adhesion_desc")}</option>
                <option value="date_adhesion">{t("liste.tri_date_adhesion_asc")}</option>
                <option value="statut">{t("liste.tri_statut")}</option>
                <option value="ville_de">{t("liste.tri_ville")}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setExportDialogOuvert(true)}
              disabled={exportEnCours}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
            >
              {exportEnCours ? t("liste.export_en_cours") : t("liste.exporter")}
            </button>
          </>
        )}
      </form>

      {erreurExport && <p className="mb-4 -mt-2 text-sm text-status-dangerText">{erreurExport}</p>}

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("liste.col_membre")}</th>
              <th className="px-4 py-2">{t("liste.col_ville")}</th>
              <th className="px-4 py-2">{t("liste.col_cin")}</th>
              <th className="px-4 py-2">{t("liste.col_email")}</th>
              <th className="px-4 py-2">{t("liste.col_statut")}</th>
              <th className="px-4 py-2">{t("liste.col_offre")}</th>
              <th className="px-4 py-2">{t("liste.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-tertiary">
                  {t("liste.chargement")}
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-status-dangerText">
                  {t("liste.erreur")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.results.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-tertiary">
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
                <td className="px-4 py-2 text-text-secondary">
                  {membre.offre_actuelle
                    ? `${membre.offre_actuelle.nom} (${membre.offre_actuelle.annee})`
                    : "—"}
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
                    {/* RH+ modifie n'importe quelle fiche ; pour un rôle
                        inférieur, la seule fiche que cette liste peut
                        contenir est de toute façon la sienne (le backend
                        scope déjà le queryset — voir get_queryset), donc ce
                        lien pointe toujours vers sa propre fiche (AHM-51). */}
                    <Link
                      to={`/membres/${membre.id}/modifier`}
                      className="rounded-cid px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                    >
                      {t("liste.modifier")}
                    </Link>
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

      <ExportChampsDialog
        open={exportDialogOuvert}
        selection={champsExport}
        onToggle={toggleChampExport}
        onToutSelectionner={() => setChampsExport(TOUS_LES_CHAMPS_EXPORT)}
        onToutDeselectionner={() => setChampsExport([])}
        onConfirm={exporter}
        onCancel={() => setExportDialogOuvert(false)}
      />
    </div>
  );
}
