/**
 * Import Excel des membres (mockup #pg-admin-import, RICEFW W-008/F-019).
 * Route gated RH+ par RequireRole (même niveau que MembreImportView côté
 * backend) — permet de télécharger le classeur vierge et d'importer un
 * fichier complété, avec affichage du journal ligne par ligne (RICEFW
 * R-012 "Journal import Master Data").
 *
 * Ajouté le 2026-09-19 — deuxième section "import historique" : réutilise
 * le même gabarit (template + upload + résultat) pour
 * apps.membres.imports_historique côté backend, qui importe le statut
 * associatif par année (une colonne par année) de membres déjà existants,
 * identifiés par email + CIN. Contrairement à l'import ci-dessus, cet
 * import ne crée jamais de membre et n'envoie aucune notification/email
 * (voir enregistrer_statut_annuel(notifier_membre=False) côté backend) —
 * un import Excel en masse de données historiques n'est pas un événement
 * personnel pour le membre concerné.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { telechargerTemplateImportHistorique, telechargerTemplateImportMembres } from "../../api/membres";
import { useImporterHistoriqueStatuts, useImporterMembres } from "../../hooks/useMembres";
import type { LigneErreurImport } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

/** Déclenche le téléchargement d'un blob avec le nom de fichier donné. */
function declencherTelechargement(blob: Blob, nomFichier: string) {
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}

/** Tableau des erreurs ligne par ligne, partagé par les deux imports. */
function TableauErreurs({
  erreurs,
  colLigne,
  colMessage,
  aucuneErreur,
}: {
  erreurs: LigneErreurImport[];
  colLigne: string;
  colMessage: string;
  aucuneErreur: string;
}) {
  if (erreurs.length === 0) {
    return <p className="text-sm text-text-secondary">{aucuneErreur}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
          <th className="px-2 py-1">{colLigne}</th>
          <th className="px-2 py-1">{colMessage}</th>
        </tr>
      </thead>
      <tbody>
        {erreurs.map((erreur, index) => (
          <tr key={`${erreur.ligne}-${index}`} className="border-b border-text-tertiary/10 last:border-0">
            <td className="px-2 py-1">{erreur.ligne}</td>
            <td className="px-2 py-1">{erreur.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function MembreImportPage() {
  const { t } = useTranslation("membres");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputHistoriqueRef = useRef<HTMLInputElement>(null);

  const [fichierSelectionne, setFichierSelectionne] = useState<File | null>(null);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);
  const [telechargementEnCours, setTelechargementEnCours] = useState(false);
  const [erreurTelechargement, setErreurTelechargement] = useState<string | null>(null);

  const [fichierHistoriqueSelectionne, setFichierHistoriqueSelectionne] = useState<File | null>(null);
  const [erreurLocaleHistorique, setErreurLocaleHistorique] = useState<string | null>(null);
  const [telechargementHistoriqueEnCours, setTelechargementHistoriqueEnCours] = useState(false);
  const [erreurTelechargementHistorique, setErreurTelechargementHistorique] = useState<string | null>(
    null,
  );

  const importMutation = useImporterMembres();
  const importHistoriqueMutation = useImporterHistoriqueStatuts();

  async function telechargerTemplate() {
    setErreurTelechargement(null);
    setTelechargementEnCours(true);
    try {
      const blob = await telechargerTemplateImportMembres();
      declencherTelechargement(blob, "template_import_membres.xlsx");
    } catch (error) {
      setErreurTelechargement(extractApiErrorMessage(error, t("import.erreur_template")));
    } finally {
      setTelechargementEnCours(false);
    }
  }

  async function telechargerTemplateHistorique() {
    setErreurTelechargementHistorique(null);
    setTelechargementHistoriqueEnCours(true);
    try {
      const blob = await telechargerTemplateImportHistorique();
      declencherTelechargement(blob, "template_import_historique.xlsx");
    } catch (error) {
      setErreurTelechargementHistorique(
        extractApiErrorMessage(error, t("import_historique.erreur_template")),
      );
    } finally {
      setTelechargementHistoriqueEnCours(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fichierSelectionne) {
      setErreurLocale(t("import.aucun_fichier"));
      return;
    }
    setErreurLocale(null);
    importMutation.mutate(fichierSelectionne, {
      onSuccess: () => {
        setFichierSelectionne(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  }

  function onSubmitHistorique(e: React.FormEvent) {
    e.preventDefault();
    if (!fichierHistoriqueSelectionne) {
      setErreurLocaleHistorique(t("import_historique.aucun_fichier"));
      return;
    }
    setErreurLocaleHistorique(null);
    importHistoriqueMutation.mutate(fichierHistoriqueSelectionne, {
      onSuccess: () => {
        setFichierHistoriqueSelectionne(null);
        if (fileInputHistoriqueRef.current) fileInputHistoriqueRef.current.value = "";
      },
    });
  }

  const resultat = importMutation.data;
  const resultatHistorique = importHistoriqueMutation.data;

  return (
    <div>
      <Link to="/membres" className="mb-4 inline-block text-sm text-text-secondary hover:underline">
        ← {t("fiche.retour")}
      </Link>

      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("import.titre")}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">
            {t("import.template_titre")}
          </h2>
          <p className="mb-3 text-sm text-text-secondary">{t("import.template_description")}</p>
          <button
            type="button"
            onClick={telechargerTemplate}
            disabled={telechargementEnCours}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("import.template_bouton")}
          </button>
          {erreurTelechargement && (
            <p className="mt-2 text-sm text-status-dangerText">{erreurTelechargement}</p>
          )}
        </section>

        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">{t("import.upload_titre")}</h2>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="fichier-import" className="mb-1 block text-xs font-medium text-text-secondary">
                {t("import.choisir_fichier")}
              </label>
              <input
                id="fichier-import"
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  setFichierSelectionne(e.target.files?.[0] ?? null);
                  setErreurLocale(null);
                }}
                className="block w-full text-sm text-text-secondary"
              />
              {erreurLocale && <p className="mt-1 text-xs text-status-dangerText">{erreurLocale}</p>}
            </div>
            <button
              type="submit"
              disabled={importMutation.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {importMutation.isPending ? t("import.import_en_cours") : t("import.importer")}
            </button>
            {importMutation.isError && (
              <p className="text-sm text-status-dangerText">
                {extractApiErrorMessage(importMutation.error, t("import.erreur_import"))}
              </p>
            )}
          </form>
        </section>
      </div>

      {resultat && (
        <section className="mt-4 rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("import.resultat_titre")}</h2>
          <dl className="mb-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <dt className="text-xs uppercase text-text-tertiary">{t("import.resultat_total")}</dt>
              <dd className="text-lg font-semibold text-text-primary">{resultat.total}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-tertiary">{t("import.resultat_importes")}</dt>
              <dd className="text-lg font-semibold text-status-successText">{resultat.importes}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-tertiary">{t("import.resultat_ignores")}</dt>
              <dd className="text-lg font-semibold text-status-dangerText">{resultat.ignores}</dd>
            </div>
          </dl>

          <h3 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
            {t("import.resultat_erreurs_titre")}
          </h3>
          <TableauErreurs
            erreurs={resultat.erreurs}
            colLigne={t("import.col_ligne")}
            colMessage={t("import.col_message")}
            aucuneErreur={t("import.resultat_aucune_erreur")}
          />
        </section>
      )}

      <h1 className="mb-4 mt-8 text-xl font-bold text-text-primary">{t("import_historique.titre")}</h1>
      <p className="mb-4 -mt-2 text-sm text-text-secondary">{t("import_historique.description")}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">
            {t("import_historique.template_titre")}
          </h2>
          <p className="mb-3 text-sm text-text-secondary">
            {t("import_historique.template_description")}
          </p>
          <button
            type="button"
            onClick={telechargerTemplateHistorique}
            disabled={telechargementHistoriqueEnCours}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("import_historique.template_bouton")}
          </button>
          {erreurTelechargementHistorique && (
            <p className="mt-2 text-sm text-status-dangerText">{erreurTelechargementHistorique}</p>
          )}
        </section>

        <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">
            {t("import_historique.upload_titre")}
          </h2>
          <form onSubmit={onSubmitHistorique} className="space-y-3">
            <div>
              <label
                htmlFor="fichier-import-historique"
                className="mb-1 block text-xs font-medium text-text-secondary"
              >
                {t("import_historique.choisir_fichier")}
              </label>
              <input
                id="fichier-import-historique"
                ref={fileInputHistoriqueRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  setFichierHistoriqueSelectionne(e.target.files?.[0] ?? null);
                  setErreurLocaleHistorique(null);
                }}
                className="block w-full text-sm text-text-secondary"
              />
              {erreurLocaleHistorique && (
                <p className="mt-1 text-xs text-status-dangerText">{erreurLocaleHistorique}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={importHistoriqueMutation.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {importHistoriqueMutation.isPending
                ? t("import_historique.import_en_cours")
                : t("import_historique.importer")}
            </button>
            {importHistoriqueMutation.isError && (
              <p className="text-sm text-status-dangerText">
                {extractApiErrorMessage(
                  importHistoriqueMutation.error,
                  t("import_historique.erreur_import"),
                )}
              </p>
            )}
          </form>
        </section>
      </div>

      {resultatHistorique && (
        <section className="mt-4 rounded-cid-lg bg-bg-primary p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">
            {t("import_historique.resultat_titre")}
          </h2>
          <dl className="mb-4 grid grid-cols-4 gap-4 text-center">
            <div>
              <dt className="text-xs uppercase text-text-tertiary">
                {t("import_historique.resultat_total")}
              </dt>
              <dd className="text-lg font-semibold text-text-primary">{resultatHistorique.total}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-tertiary">
                {t("import_historique.resultat_traitees")}
              </dt>
              <dd className="text-lg font-semibold text-text-primary">
                {resultatHistorique.lignes_traitees}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-tertiary">
                {t("import_historique.resultat_importees")}
              </dt>
              <dd className="text-lg font-semibold text-status-successText">
                {resultatHistorique.entrees_importees}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-text-tertiary">
                {t("import_historique.resultat_ignorees")}
              </dt>
              <dd className="text-lg font-semibold text-status-dangerText">
                {resultatHistorique.lignes_ignorees}
              </dd>
            </div>
          </dl>

          <h3 className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
            {t("import_historique.resultat_erreurs_titre")}
          </h3>
          <TableauErreurs
            erreurs={resultatHistorique.erreurs}
            colLigne={t("import_historique.col_ligne")}
            colMessage={t("import_historique.col_message")}
            aucuneErreur={t("import_historique.resultat_aucune_erreur")}
          />
        </section>
      )}
    </div>
  );
}
