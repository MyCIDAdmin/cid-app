/**
 * Gestion des campagnes d'adhésion — vue Bureau Admin+ (mockup
 * #pg-admin-adhesion, FDD §6.1, AHM-21).
 *
 * Périmètre réduit acté avec l'utilisateur ("Member-Seite + einfache
 * Admin-Verwaltung") : créer une campagne, la publier, la clôturer — SANS
 * l'assistant de création en 4 étapes du mockup (#m-newcamp, paramètres/
 * offres/rabais/publication). La gestion des offres et rabais d'une
 * campagne reste, pour cette itération, assurée via le Django Admin déjà
 * livré par AHM-19 (voir apps/adhesions/admin.py — OffreAdhesionInline /
 * RabaisOffreInline) plutôt que réimplémentée ici.
 */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  useCampagnes,
  useCloturerCampagne,
  useCreerCampagne,
  usePublierCampagne,
} from "../../hooks/useAdhesions";
import type { CampagneAdhesion, CampagneCreatePayload, StatutCampagne } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";

const STATUT_STYLES: Record<StatutCampagne, string> = {
  brouillon: "bg-bg-tertiary text-text-secondary",
  publiee: "bg-status-successBg text-status-successText",
  cloturee: "bg-bg-tertiary text-text-secondary",
};

function formulaireInitial(): CampagneCreatePayload {
  return {
    nom: "",
    annee: new Date().getFullYear(),
    date_debut: "",
    date_fin: "",
    description: "",
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function AdminCampagnesPage() {
  const { t } = useTranslation("adhesions");

  const [form, setForm] = useState<CampagneCreatePayload>(formulaireInitial);
  const [campagneACloturer, setCampagneACloturer] = useState<CampagneAdhesion | null>(null);

  const campagnes = useCampagnes();
  const creerMutation = useCreerCampagne();
  const publierMutation = usePublierCampagne();
  const cloturerMutation = useCloturerCampagne();

  function handleCreer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    creerMutation.mutate(form, { onSuccess: () => setForm(formulaireInitial()) });
  }

  function confirmerCloturer() {
    if (!campagneACloturer) return;
    cloturerMutation.mutate(campagneACloturer.id, {
      onSuccess: () => setCampagneACloturer(null),
    });
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("admin.titre")}</h1>

      <div className="mb-5 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">{t("admin.nouvelle_campagne")}</h2>
        <form onSubmit={handleCreer} className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="camp-nom" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("admin.nom_label")}
            </label>
            <input
              id="camp-nom"
              type="text"
              required
              value={form.nom}
              onChange={(e) => setForm({ ...form, nom: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="camp-annee" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("admin.annee_label")}
            </label>
            <input
              id="camp-annee"
              type="number"
              required
              value={form.annee}
              onChange={(e) => setForm({ ...form, annee: Number(e.target.value) })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="camp-debut" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("admin.date_debut_label")}
            </label>
            <input
              id="camp-debut"
              type="date"
              required
              value={form.date_debut}
              onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="camp-fin" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("admin.date_fin_label")}
            </label>
            <input
              id="camp-fin"
              type="date"
              required
              value={form.date_fin}
              onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="camp-desc" className="mb-1 block text-xs font-medium text-text-secondary">
              {t("admin.description_label")}
            </label>
            <textarea
              id="camp-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            />
          </div>

          {creerMutation.isError && (
            <p className="text-xs text-status-dangerText md:col-span-2">
              {extractApiErrorMessage(creerMutation.error, t("admin.erreur_creation"))}
            </p>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creerMutation.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {t("admin.creer")}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <h2 className="px-4 pt-4 text-xs font-bold text-text-primary">{t("admin.liste_titre")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("admin.col_nom")}</th>
              <th className="px-4 py-2">{t("admin.col_annee")}</th>
              <th className="px-4 py-2">{t("admin.col_statut")}</th>
              <th className="px-4 py-2">{t("admin.col_periode")}</th>
              <th className="px-4 py-2">{t("admin.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {campagnes.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">
                  {t("admin.chargement")}
                </td>
              </tr>
            )}
            {campagnes.isError && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-status-dangerText">
                  {t("admin.erreur_chargement")}
                </td>
              </tr>
            )}
            {campagnes.data && campagnes.data.results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-text-tertiary">
                  {t("admin.aucune_campagne")}
                </td>
              </tr>
            )}
            {campagnes.data?.results.map((c) => (
              <tr key={c.id} className="border-b border-text-tertiary/10 last:border-0">
                <td className="px-4 py-2 font-medium text-text-primary">{c.nom}</td>
                <td className="px-4 py-2 text-text-secondary">{c.annee}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[c.statut]}`}
                  >
                    {t(`statut_campagne.${c.statut}`)}
                  </span>
                </td>
                <td className="px-4 py-2 text-text-secondary">
                  {formatDate(c.date_debut)} – {formatDate(c.date_fin)}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    {c.statut === "brouillon" && (
                      <button
                        type="button"
                        onClick={() => publierMutation.mutate(c.id)}
                        disabled={publierMutation.isPending}
                        className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                      >
                        {t("admin.publier")}
                      </button>
                    )}
                    {c.statut === "publiee" && (
                      <button
                        type="button"
                        onClick={() => setCampagneACloturer(c)}
                        className="rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg"
                      >
                        {t("admin.cloturer")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(publierMutation.isError || cloturerMutation.isError) && (
        <p className="mt-2 text-xs text-status-dangerText">
          {extractApiErrorMessage(
            publierMutation.error ?? cloturerMutation.error,
            t("admin.erreur_action"),
          )}
        </p>
      )}

      <ConfirmDialog
        open={campagneACloturer !== null}
        title={t("admin.confirmer_cloturer_titre")}
        message={t("admin.confirmer_cloturer_message", { nom: campagneACloturer?.nom })}
        danger
        onConfirm={confirmerCloturer}
        onCancel={() => setCampagneACloturer(null)}
      />
    </div>
  );
}
