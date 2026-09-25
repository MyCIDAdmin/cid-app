/**
 * Page "Statistiques & KPIs" (mockup #pg-stats, FDD §5.3, Admin/DG/Bureau Admin — voir
 * StatsPermission côté backend). 4 onglets : Financier, Membres, Événements, Finanzdaten (ce
 * dernier ajouté le 2026-09-25, demande utilisateur : "Tab für alle Finanzdaten
 * (filterbar/sortierbar)") — Engagement et Projets restent R2 (CID-RPL-001 §2.2), pas d'onglet
 * créé pour eux ici.
 *
 * Filtres communs (année/ville/statut) partagés par les 4 onglets, comme côté API
 * (apps.stats.services) — l'onglet Membres ignore volontairement `annee` (kpis_membres n'en
 * prend pas, c'est une photo de l'état actuel, pas une série temporelle).
 *
 * Export PDF/Excel du dashboard (demande utilisateur du 2026-09-25 : "Export als
 * PDF/Excel-Dashboard") — mêmes filtres globaux que les onglets, même pattern
 * blob+téléchargement que GestionCommandesTab.tsx (module Shop-Verwaltung).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import OngletEvenements from "../../components/stats/OngletEvenements";
import OngletFinancier from "../../components/stats/OngletFinancier";
import OngletFinances from "../../components/stats/OngletFinances";
import OngletMembres from "../../components/stats/OngletMembres";
import { exporterStatsExcel, exporterStatsPdf } from "../../api/stats";
import { BUNDESLANDER, PAYS_MEMBRE } from "../../types/membre";
import type { StatsFiltres } from "../../types/stats";
import { extractApiErrorMessage } from "../../utils/apiError";

type Onglet = "financier" | "membres" | "evenements" | "finances";

const ANNEE_COURANTE = new Date().getFullYear();

/** Déclenche le téléchargement d'un blob côté navigateur — même pattern que
 * GestionCommandesTab.declencherTelechargement. */
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

export default function StatsPage() {
  const { t } = useTranslation("stats");
  const [onglet, setOnglet] = useState<Onglet>("financier");
  const [annee, setAnnee] = useState(ANNEE_COURANTE);
  const [ville, setVille] = useState("");
  const [statut, setStatut] = useState("");
  // Ajoutés le 2026-09-19 (demande utilisateur : "Bei ... Statistiken & KPIs füge mehr
  // Filtermöglichten hinzu z.B. Bundesland") — mêmes filtres que la liste des membres, le
  // backend (apps.stats.services) les supportait déjà pour les 3 onglets.
  const [land, setLand] = useState("");
  const [pays, setPays] = useState("");
  const [dateAdhesionApres, setDateAdhesionApres] = useState("");
  const [dateAdhesionAvant, setDateAdhesionAvant] = useState("");
  const [exportEnCours, setExportEnCours] = useState<"pdf" | "excel" | null>(null);
  const [erreurExport, setErreurExport] = useState<string | null>(null);

  const filtres: StatsFiltres = {
    annee,
    ville: ville || undefined,
    statut: statut || undefined,
    land: land || undefined,
    pays: pays || undefined,
    date_adhesion_apres: dateAdhesionApres || undefined,
    date_adhesion_avant: dateAdhesionAvant || undefined,
  };

  async function exporterPdf() {
    setErreurExport(null);
    setExportEnCours("pdf");
    try {
      const blob = await exporterStatsPdf(filtres);
      declencherTelechargement(blob, `dashboard_stats_${annee}.pdf`);
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("export.erreur")));
    } finally {
      setExportEnCours(null);
    }
  }

  async function exporterExcel() {
    setErreurExport(null);
    setExportEnCours("excel");
    try {
      const { blob, nomFichier } = await exporterStatsExcel(filtres);
      declencherTelechargement(blob, nomFichier);
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("export.erreur")));
    } finally {
      setExportEnCours(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("page.titre")}</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label
            htmlFor="stats-annee"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.annee")}
          </label>
          <input
            id="stats-annee"
            type="number"
            value={annee}
            onChange={(e) => setAnnee(Number(e.target.value))}
            className="w-24 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="stats-ville"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.ville")}
          </label>
          <input
            id="stats-ville"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder={t("filtres.ville_placeholder")}
            className="w-32 rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="stats-statut"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.statut")}
          </label>
          <select
            id="stats-statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("filtres.statut_tous")}</option>
            <option value="actif">{t("filtres.statut_actif")}</option>
            <option value="en_attente">{t("filtres.statut_en_attente")}</option>
            <option value="inactif">{t("filtres.statut_inactif")}</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="stats-land"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.land")}
          </label>
          <select
            id="stats-land"
            value={land}
            onChange={(e) => setLand(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("filtres.land_tous")}</option>
            {BUNDESLANDER.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="stats-pays"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.pays")}
          </label>
          <select
            id="stats-pays"
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("filtres.pays_tous")}</option>
            {PAYS_MEMBRE.map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.labelKey, { ns: "membres" })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="stats-adhesion-apres"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.adhesion_apres")}
          </label>
          <input
            id="stats-adhesion-apres"
            type="date"
            value={dateAdhesionApres}
            onChange={(e) => setDateAdhesionApres(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="stats-adhesion-avant"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("filtres.adhesion_avant")}
          </label>
          <input
            id="stats-adhesion-avant"
            type="date"
            value={dateAdhesionAvant}
            onChange={(e) => setDateAdhesionAvant(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={exporterPdf}
            disabled={exportEnCours !== null}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
          >
            {exportEnCours === "pdf" ? t("export.en_cours") : t("export.pdf")}
          </button>
          <button
            type="button"
            onClick={exporterExcel}
            disabled={exportEnCours !== null}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
          >
            {exportEnCours === "excel" ? t("export.en_cours") : t("export.excel")}
          </button>
        </div>
      </div>

      {erreurExport && <p className="mb-2 text-xs text-status-dangerText">{erreurExport}</p>}

      <div className="mb-4 flex gap-1 border-b border-text-tertiary/20">
        {(["financier", "membres", "evenements", "finances"] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            className={`px-3 py-2 text-sm font-medium ${
              onglet === o
                ? "border-b-2 border-ca text-ca"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {t(`onglets.${o}`)}
          </button>
        ))}
      </div>

      {onglet === "financier" && <OngletFinancier filtres={filtres} />}
      {onglet === "membres" && <OngletMembres filtres={filtres} />}
      {onglet === "evenements" && <OngletEvenements filtres={filtres} />}
      {onglet === "finances" && <OngletFinances filtres={filtres} />}
    </div>
  );
}
