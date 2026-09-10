/**
 * Import Excel des membres (mockup #pg-admin-import, RICEFW W-008/F-019).
 * Route gated RH+ par RequireRole (même niveau que MembreImportView côté
 * backend) — permet de télécharger le classeur vierge et d'importer un
 * fichier complété, avec affichage du journal ligne par ligne (RICEFW
 * R-012 "Journal import Master Data").
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { telechargerTemplateImportMembres } from "../../api/membres";
import { useImporterMembres } from "../../hooks/useMembres";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function MembreImportPage() {
  const { t } = useTranslation("membres");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fichierSelectionne, setFichierSelectionne] = useState<File | null>(null);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);
  const [telechargementEnCours, setTelechargementEnCours] = useState(false);
  const [erreurTelechargement, setErreurTelechargement] = useState<string | null>(null);

  const importMutation = useImporterMembres();

  async function telechargerTemplate() {
    setErreurTelechargement(null);
    setTelechargementEnCours(true);
    try {
      const blob = await telechargerTemplateImportMembres();
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = "template_import_membres.xlsx";
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErreurTelechargement(extractApiErrorMessage(error, t("import.erreur_template")));
    } finally {
      setTelechargementEnCours(false);
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

  const resultat = importMutation.data;

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
          {resultat.erreurs.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("import.resultat_aucune_erreur")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
                  <th className="px-2 py-1">{t("import.col_ligne")}</th>
                  <th className="px-2 py-1">{t("import.col_message")}</th>
                </tr>
              </thead>
              <tbody>
                {resultat.erreurs.map((erreur) => (
                  <tr key={erreur.ligne} className="border-b border-text-tertiary/10 last:border-0">
                    <td className="px-2 py-1">{erreur.ligne}</td>
                    <td className="px-2 py-1">{erreur.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
