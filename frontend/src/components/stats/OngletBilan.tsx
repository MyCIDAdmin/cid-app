/**
 * Onglet "Jahresbilanz" — Statistiken & KPIs (demande utilisateur du 2026-10-06, extension pour
 * le service financier) : recettes/dépenses/résultat avec comparaison à l'année précédente,
 * courbe mensuelle, Budget vs. Ist, résultat par événement/projet, exports PDF/Excel.
 *
 * Drill-down : un clic sur une barre de graphique (mois, source de recette) ou sur une ligne de
 * dépense appelle `onDrill`, que StatsPage traduit en ouverture de l'onglet "Finanzdaten"
 * pré-filtré (type de transaction et/ou mois). Le bilan est celui de l'association entière : les
 * filtres membre (ville, Bundesland...) ne s'appliquent pas, seule l'année compte.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { exporterBilanExcel, exporterBilanPdf, exporterBuchungenCsv } from "../../api/stats";
import { useStatsBilan } from "../../hooks/useStats";
import type {
  LigneDepenseBilan,
  LigneRecetteBilan,
  ResultatBilan,
  SourceRecette,
  StatutBudget,
  TypeTransaction,
} from "../../types/stats";
import { extractApiErrorMessage } from "../../utils/apiError";
import { declencherTelechargement } from "../../utils/telechargement";
import AnimatedKpiTile from "./AnimatedKpiTile";
import DetailBoxTriable, { type ColonneDetailBox } from "./DetailBoxTriable";

export interface Drill {
  type?: TypeTransaction;
  mois?: number;
}

const SOURCE_VERS_TYPE: Record<SourceRecette, TypeTransaction> = {
  cotisations: "cotisation",
  dons: "don",
  projets: "projet",
  adhesions: "adhesion",
  boutique: "boutique",
  evenements: "evenement",
};

const COULEUR_RECETTES = "#CC0000";
const COULEUR_DEPENSES = "#6b7280";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function variation(actuel: string, precedent: string): string | null {
  const p = Number(precedent);
  if (!p) return null;
  const pct = ((Number(actuel) - p) / Math.abs(p)) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")} %`;
}

const CLASSE_STATUT: Record<StatutBudget, string> = {
  aucun: "text-text-tertiary",
  ok: "text-status-successText",
  attention: "text-status-warningText",
  depasse: "text-status-dangerText",
};

export default function OngletBilan({
  annee,
  onDrill,
}: {
  annee: number;
  onDrill: (drill: Drill) => void;
}) {
  const { t, i18n } = useTranslation("stats");
  const { data, isLoading, isError } = useStatsBilan(annee);
  const [exportEnCours, setExportEnCours] = useState<"pdf" | "excel" | "csv" | null>(null);
  const [erreurExport, setErreurExport] = useState<string | null>(null);

  async function exporter(format: "pdf" | "excel" | "csv") {
    setErreurExport(null);
    setExportEnCours(format);
    try {
      if (format === "pdf") {
        declencherTelechargement(await exporterBilanPdf(annee), `jahresbilanz_${annee}.pdf`);
      } else if (format === "csv") {
        declencherTelechargement(await exporterBuchungenCsv(annee), `buchungen_${annee}.csv`);
      } else {
        const { blob, nomFichier } = await exporterBilanExcel(annee);
        declencherTelechargement(blob, nomFichier);
      }
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("export.erreur")));
    } finally {
      setExportEnCours(null);
    }
  }

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  const nomMois = (m: number) =>
    new Date(2000, m - 1, 1).toLocaleString(i18n.language, { month: "short" });
  const mensuel = data.mensuel.map((m) => ({
    mois: m.mois,
    nom: nomMois(m.mois),
    recettes: Number(m.recettes),
    depenses: Number(m.depenses),
    cumul: Number(m.cumul),
  }));

  const colonnesRecettes: ColonneDetailBox<LigneRecetteBilan>[] = [
    { cle: "cle", label: t("bilan.col_poste"), render: (r) => t(`bilan.source_${r.cle}`) },
    {
      cle: "montant",
      label: String(annee),
      align: "right",
      render: (r) => formatMontant(r.montant),
      valeurTri: (r) => Number(r.montant),
    },
    {
      cle: "montant_precedent",
      label: t("bilan.col_precedent"),
      align: "right",
      render: (r) => formatMontant(r.montant_precedent),
      valeurTri: (r) => Number(r.montant_precedent),
    },
  ];

  const colonnesDepenses: ColonneDetailBox<LigneDepenseBilan>[] = [
    { cle: "nom", label: t("bilan.col_categorie") },
    {
      cle: "montant",
      label: t("bilan.col_ist"),
      align: "right",
      render: (r) => formatMontant(r.montant),
      valeurTri: (r) => Number(r.montant),
    },
    {
      cle: "budget",
      label: t("bilan.col_budget"),
      align: "right",
      render: (r) => (Number(r.budget) ? formatMontant(r.budget) : "—"),
      valeurTri: (r) => Number(r.budget),
    },
    {
      cle: "statut_budget",
      label: t("bilan.col_statut_budget"),
      render: (r) => (
        <span className={`font-medium ${CLASSE_STATUT[r.statut_budget]}`}>
          {t(`bilan.statut_${r.statut_budget}`)}
          {r.pourcentage_budget !== null && ` (${r.pourcentage_budget} %)`}
        </span>
      ),
      valeurTri: (r) => r.pourcentage_budget ?? -1,
    },
    {
      cle: "montant_precedent",
      label: t("bilan.col_precedent"),
      align: "right",
      render: (r) => formatMontant(r.montant_precedent),
      valeurTri: (r) => Number(r.montant_precedent),
    },
  ];

  const colonnesResultat = (cleTitre: string): ColonneDetailBox<ResultatBilan>[] => [
    { cle: "titre", label: cleTitre },
    {
      cle: "recettes",
      label: t("bilan.recettes"),
      align: "right",
      render: (r) => formatMontant(r.recettes),
      valeurTri: (r) => Number(r.recettes),
    },
    {
      cle: "depenses",
      label: t("bilan.depenses"),
      align: "right",
      render: (r) => formatMontant(r.depenses),
      valeurTri: (r) => Number(r.depenses),
    },
    {
      cle: "resultat",
      label: t("bilan.resultat"),
      align: "right",
      render: (r) => (
        <span className={Number(r.resultat) < 0 ? "text-status-dangerText" : undefined}>
          {formatMontant(r.resultat)}
        </span>
      ),
      valeurTri: (r) => Number(r.resultat),
    },
  ];

  const deltaResultat = variation(data.resultat, data.resultat_precedent);
  const sourcesBarres = data.recettes.lignes.map((l) => ({
    cle: l.cle,
    nom: t(`bilan.source_${l.cle}`),
    montant: Number(l.montant),
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-xs text-text-tertiary">{t("bilan.hinweis_drill")}</p>
        <div className="ml-auto flex gap-2">
          {(["pdf", "excel", "csv"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => exporter(f)}
              disabled={exportEnCours !== null}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
            >
              {exportEnCours === f ? t("export.en_cours") : t(`bilan.export_${f}`)}
            </button>
          ))}
        </div>
      </div>
      {erreurExport && <p className="mb-2 text-xs text-status-dangerText">{erreurExport}</p>}

      {data.abschluss.abgeschlossen && (
        <p className="mb-4 rounded-cid bg-status-infoBg px-3 py-2 text-xs text-status-infoText">
          {t("bilan.abgeschlossen", {
            datum: new Date(data.abschluss.abgeschlossen_am ?? "").toLocaleDateString(
              i18n.language,
            ),
          })}
          {Number(data.abschluss.abweichung) !== 0 &&
            ` — ${t("bilan.abweichung", { betrag: formatMontant(data.abschluss.abweichung ?? 0) })}`}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AnimatedKpiTile label={t("bilan.recettes")} value={formatMontant(data.recettes.total)} />
        <AnimatedKpiTile label={t("bilan.depenses")} value={formatMontant(data.depenses.total)} />
        <AnimatedKpiTile label={t("bilan.resultat")} value={formatMontant(data.resultat)} accent />
        <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <div className="text-[10px] uppercase text-text-tertiary">
            {t("bilan.vs_precedent", { annee: annee - 1 })}
          </div>
          <div className="text-lg font-bold text-text-primary">{deltaResultat ?? "—"}</div>
          <div className="text-[10px] text-text-tertiary">
            {formatMontant(data.resultat_precedent)}
          </div>
        </div>
      </div>

      {data.depenses_en_attente.nombre > 0 && (
        <p className="mb-4 rounded-cid bg-status-warningBg px-3 py-2 text-xs text-status-warningText">
          {t("bilan.en_attente", {
            nombre: data.depenses_en_attente.nombre,
            montant: formatMontant(data.depenses_en_attente.montant),
          })}
        </p>
      )}

      <div className="mb-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">{t("bilan.mensuel")}</h2>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={mensuel}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
            <XAxis dataKey="nom" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatMontant(value)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="recettes"
              name={t("bilan.recettes")}
              fill={COULEUR_RECETTES}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(d: { mois: number }) => onDrill({ mois: d.mois })}
            />
            <Bar
              dataKey="depenses"
              name={t("bilan.depenses")}
              fill={COULEUR_DEPENSES}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(d: { mois: number }) => onDrill({ type: "depense", mois: d.mois })}
            />
            <Line
              dataKey="cumul"
              name={t("bilan.cumul")}
              stroke="#111827"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("bilan.recettes")}</h2>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={sourcesBarres}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--BR, #e5e7eb)" />
              <XAxis dataKey="nom" tick={{ fontSize: 9 }} interval={0} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: number) => formatMontant(value)} />
              <Bar
                dataKey="montant"
                name={t("bilan.recettes")}
                fill={COULEUR_RECETTES}
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(d: { cle: SourceRecette }) => onDrill({ type: SOURCE_VERS_TYPE[d.cle] })}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-3">
            <DetailBoxTriable
              colonnes={colonnesRecettes}
              lignes={data.recettes.lignes}
              getRowKey={(r) => r.cle}
              triInitial="montant"
              directionInitiale="desc"
              messageVide={t("financier.aucune_donnee")}
            />
          </div>
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("bilan.budget_vs_ist")}</h2>
          <DetailBoxTriable
            colonnes={colonnesDepenses}
            lignes={data.depenses.lignes}
            getRowKey={(r) => r.categorie_id}
            triInitial="montant"
            directionInitiale="desc"
            messageVide={t("bilan.aucune_depense")}
          />
          <button
            type="button"
            onClick={() => onDrill({ type: "depense" })}
            className="mt-3 text-xs font-medium text-ca hover:underline"
          >
            {t("bilan.voir_depenses")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("bilan.par_evenement")}</h2>
          <DetailBoxTriable
            colonnes={colonnesResultat(t("bilan.col_evenement"))}
            lignes={data.resultats_evenements}
            getRowKey={(r) => r.id}
            triInitial="resultat"
            directionInitiale="desc"
            messageVide={t("bilan.aucune_donnee")}
          />
        </div>
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("bilan.par_projet")}</h2>
          <DetailBoxTriable
            colonnes={colonnesResultat(t("bilan.col_projet"))}
            lignes={data.resultats_projets}
            getRowKey={(r) => r.id}
            triInitial="resultat"
            directionInitiale="desc"
            messageVide={t("bilan.aucune_donnee")}
          />
        </div>
      </div>
    </div>
  );
}
