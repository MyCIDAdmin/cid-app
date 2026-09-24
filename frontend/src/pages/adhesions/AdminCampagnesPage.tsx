/**
 * Gestion des campagnes d'adhésion — vue Bureau Admin+ (mockup
 * #pg-admin-adhesion, FDD §6.1, AHM-21).
 *
 * Périmètre initial acté avec l'utilisateur ("Member-Seite + einfache
 * Admin-Verwaltung") : créer une campagne, la publier, la clôturer — SANS
 * l'assistant de création en 4 étapes du mockup (#m-newcamp, paramètres/
 * offres/rabais/publication) ; la gestion des offres/rabais renvoyait alors
 * vers Django Admin (AHM-19).
 *
 * Étendu le 2026-09-16 (demande utilisateur, "tool" analogue à la zone
 * Adhésion de Django Admin) : chaque campagne peut désormais être dépliée
 * pour gérer ses offres, et chaque offre pour gérer ses rabais — voir
 * OffresManager/RabaisManager. Toujours pas l'assistant en 4 étapes du
 * mockup (panneaux dépliables persistants, modifiables à tout moment,
 * plutôt qu'un flux de création unique) : le CRUD backend (AHM-19) le
 * permettait déjà, seule l'UI manquait.
 */
import { Fragment, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import OffresManager from "../../components/adhesions/OffresManager";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import {
  useCampagnes,
  useCloturerCampagne,
  useCreerCampagne,
  usePublierCampagne,
} from "../../hooks/useAdhesions";
import { usePageAccess } from "../../hooks/useRbac";
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
  const { t } = useTranslation(["adhesions", "common"]);
  // Task #216 (2026-09-24) : "page_campagnes_adhesion" distingue désormais lecture/
  // lecture_ecriture — désactive créer/publier/clôturer ci-dessous, et se propage à
  // OffresManager/RabaisManager (CRUD offres/rabais fait partie de la même gestion).
  const { accessible, modifiable } = usePageAccess("page_campagnes_adhesion");

  const [form, setForm] = useState<CampagneCreatePayload>(formulaireInitial);
  const [campagneACloturer, setCampagneACloturer] = useState<CampagneAdhesion | null>(null);
  const [campagneDepliee, setCampagneDepliee] = useState<string | null>(null);

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

      {accessible && !modifiable && (
        <div className="mb-4 rounded-cid border border-status-warningText/30 bg-status-warningBg px-3 py-2 text-sm text-status-warningText">
          {t("common:acces.lecture_seule_banniere")}
        </div>
      )}

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
              disabled={creerMutation.isPending || !modifiable}
              title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
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
              <Fragment key={c.id}>
                <tr className="border-b border-text-tertiary/10 last:border-0">
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
                    <div className="flex flex-wrap gap-1">
                      {c.statut === "brouillon" && (
                        <button
                          type="button"
                          onClick={() => publierMutation.mutate(c.id)}
                          disabled={publierMutation.isPending || !modifiable}
                          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                          className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:bg-cad disabled:opacity-40"
                        >
                          {t("admin.publier")}
                        </button>
                      )}
                      {c.statut === "publiee" && (
                        <button
                          type="button"
                          onClick={() => setCampagneACloturer(c)}
                          disabled={!modifiable}
                          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
                          className="rounded-cid px-2 py-1 text-xs text-status-dangerText hover:bg-status-dangerBg disabled:opacity-40"
                        >
                          {t("admin.cloturer")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setCampagneDepliee((cur) => (cur === c.id ? null : c.id))
                        }
                        className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
                      >
                        {campagneDepliee === c.id
                          ? t("admin.masquer_offres")
                          : t("admin.gerer_offres")}
                      </button>
                    </div>
                  </td>
                </tr>
                {campagneDepliee === c.id && (
                  <tr className="border-b border-text-tertiary/10 last:border-0">
                    <td colSpan={5} className="bg-bg-tertiary/20 px-4 py-3">
                      <OffresManager campagne={c} modifiable={modifiable} />
                    </td>
                  </tr>
                )}
              </Fragment>
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
