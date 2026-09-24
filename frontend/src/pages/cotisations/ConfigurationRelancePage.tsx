/**
 * Échéances des relances de cotisation, configurables par année — vue Directeur Financier/Admin
 * (AHM-54, suite retour utilisateur sur AHM-18 : l'ancrage fixe au 1er janvier ne convenait pas).
 *
 * Le Directeur Financier/Admin définit ici, année de cotisation par année de cotisation, la date
 * à partir de laquelle la cotisation est considérée en retard. Les 3 relances (J-30/J-7/J+1,
 * apps.cotisations.tasks) restent calculées relativement à cette date — seule la date pivot est
 * configurable ici, pas les décalages eux-mêmes. Une année sans ligne dans ce tableau retombe sur
 * le comportement historique (échéance au 1er janvier de cette année).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useConfigurationsRelance,
  useCreerConfigurationRelance,
  useModifierConfigurationRelance,
  useSupprimerConfigurationRelance,
} from "../../hooks/useCotisations";
import { useMembre } from "../../hooks/useMembres";
import { usePageAccess } from "../../hooks/useRbac";
import type { ConfigurationRelance } from "../../types/cotisation";
import { extractApiErrorMessage } from "../../utils/apiError";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

interface ConfigurationRelanceRowProps {
  config: ConfigurationRelance;
  /** task #216 : GET=lecture, POST/PATCH/DELETE=écriture côté backend (page_cotisations_relances)
   * — modifier/supprimer une échéance sont donc toutes deux des actions d'écriture. */
  modifiable: boolean;
}

function ConfigurationRelanceRow({ config, modifiable }: ConfigurationRelanceRowProps) {
  const { t } = useTranslation(["cotisations", "common"]);
  const modifiePar = useMembre(config.modifie_par ?? undefined);
  const modifierMutation = useModifierConfigurationRelance();
  const supprimerMutation = useSupprimerConfigurationRelance();

  const [dateEcheance, setDateEcheance] = useState(config.date_echeance);
  const modifiee = dateEcheance !== config.date_echeance;

  function enregistrer() {
    modifierMutation.mutate({ id: config.id, payload: { date_echeance: dateEcheance } });
  }

  function supprimer() {
    if (window.confirm(t("configuration_relance.confirmer_suppression", { annee: config.annee }))) {
      supprimerMutation.mutate(config.id);
    }
  }

  return (
    <tr className="border-b border-text-tertiary/10 last:border-0 align-top">
      <td className="px-4 py-2 font-semibold text-text-primary">{config.annee}</td>
      <td className="px-4 py-2">
        <input
          type="date"
          data-testid={`configuration-relance-date-${config.annee}`}
          value={dateEcheance}
          onChange={(e) => setDateEcheance(e.target.value)}
          disabled={!modifiable}
          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs disabled:opacity-30"
        />
      </td>
      <td className="px-4 py-2 text-xs text-text-tertiary">
        {config.modifie_par === null
          ? "—"
          : modifiePar.data
            ? `${modifiePar.data.prenom} ${modifiePar.data.nom}`
            : t("configuration_relance.chargement")}
        <div>{formatDateTime(config.updated_at)}</div>
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enregistrer}
            disabled={!modifiee || modifierMutation.isPending || !modifiable}
            title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
            className="rounded-cid bg-ca px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {modifierMutation.isPending
              ? t("configuration_relance.en_cours")
              : t("configuration_relance.enregistrer")}
          </button>
          <button
            type="button"
            onClick={supprimer}
            disabled={supprimerMutation.isPending || !modifiable}
            title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
            className="rounded-cid border border-status-dangerText px-2 py-1 text-xs font-medium text-status-dangerText hover:bg-status-dangerText/10 disabled:opacity-40"
          >
            {t("configuration_relance.supprimer")}
          </button>
        </div>
        {(modifierMutation.isError || supprimerMutation.isError) && (
          <p className="mt-1 text-xs text-status-dangerText">
            {extractApiErrorMessage(
              modifierMutation.error ?? supprimerMutation.error,
              t("configuration_relance.erreur_action"),
            )}
          </p>
        )}
      </td>
    </tr>
  );
}

interface NouvelleEcheanceFormProps {
  modifiable: boolean;
}

function NouvelleEcheanceForm({ modifiable }: NouvelleEcheanceFormProps) {
  const { t } = useTranslation(["cotisations", "common"]);
  const creerMutation = useCreerConfigurationRelance();

  const anneeParDefaut = new Date().getFullYear() + 1;
  const [annee, setAnnee] = useState(anneeParDefaut);
  const [dateEcheance, setDateEcheance] = useState(`${anneeParDefaut}-01-01`);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    creerMutation.mutate(
      { annee, date_echeance: dateEcheance },
      {
        onSuccess: () => {
          setAnnee(annee + 1);
          setDateEcheance(`${annee + 1}-01-01`);
        },
      },
    );
  }

  return (
    <form
      onSubmit={soumettre}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
    >
      <div>
        <label
          htmlFor="configuration-relance-annee"
          className="mb-1 block text-xs font-semibold uppercase text-text-tertiary"
        >
          {t("configuration_relance.champ_annee")}
        </label>
        <input
          id="configuration-relance-annee"
          type="number"
          value={annee}
          onChange={(e) => setAnnee(Number(e.target.value))}
          disabled={!modifiable}
          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
          className="w-28 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-30"
          required
        />
      </div>
      <div>
        <label
          htmlFor="configuration-relance-date-echeance"
          className="mb-1 block text-xs font-semibold uppercase text-text-tertiary"
        >
          {t("configuration_relance.champ_date_echeance")}
        </label>
        <input
          id="configuration-relance-date-echeance"
          type="date"
          value={dateEcheance}
          onChange={(e) => setDateEcheance(e.target.value)}
          disabled={!modifiable}
          title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
          className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-30"
          required
        />
      </div>
      <button
        type="submit"
        disabled={creerMutation.isPending || !modifiable}
        title={!modifiable ? t("common:acces.lecture_seule_tooltip") ?? "" : ""}
        className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {creerMutation.isPending
          ? t("configuration_relance.en_cours")
          : t("configuration_relance.ajouter")}
      </button>
      {creerMutation.isError && (
        <p className="w-full text-xs text-status-dangerText">
          {extractApiErrorMessage(creerMutation.error, t("configuration_relance.erreur_action"))}
        </p>
      )}
    </form>
  );
}

export default function ConfigurationRelancePage() {
  const { t } = useTranslation(["cotisations", "common"]);
  const { accessible, modifiable } = usePageAccess("page_cotisations_relances");
  const configurations = useConfigurationsRelance();

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("configuration_relance.titre")}</h1>
      <p className="mb-4 text-sm text-text-tertiary">{t("configuration_relance.sous_titre")}</p>

      {accessible && !modifiable && (
        <p className="mb-4 rounded-cid-lg bg-bg-tertiary px-4 py-2 text-sm text-text-secondary">
          {t("common:acces.lecture_seule_banniere")}
        </p>
      )}

      <NouvelleEcheanceForm modifiable={modifiable} />

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("configuration_relance.col_annee")}</th>
              <th className="px-4 py-2">{t("configuration_relance.col_date_echeance")}</th>
              <th className="px-4 py-2">{t("configuration_relance.col_modifie_par")}</th>
              <th className="px-4 py-2">{t("configuration_relance.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {configurations.isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                  {t("configuration_relance.chargement")}
                </td>
              </tr>
            )}
            {configurations.isError && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-status-dangerText">
                  {t("configuration_relance.erreur_chargement")}
                </td>
              </tr>
            )}
            {configurations.data && configurations.data.results.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-text-tertiary">
                  {t("configuration_relance.aucune")}
                </td>
              </tr>
            )}
            {configurations.data?.results.map((config) => (
              <ConfigurationRelanceRow key={config.id} config={config} modifiable={modifiable} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-text-tertiary">{t("configuration_relance.note_repli")}</p>
    </div>
  );
}
