/**
 * Onglet "Finanzdaten" — Statistiques & KPIs (ajouté le 2026-09-25, demande utilisateur : "Tab
 * für alle Finanzdaten (filterbar/sortierbar)"). Registre unifié de toutes les écritures
 * financières individuelles (cotisations/dons/adhésions/événements/boutique/autres/projets), quel
 * que soit leur statut — voir apps.stats.services.finances_liste côté backend pour la logique de
 * dé-duplication entre sources.
 *
 * Filtre supplémentaire propre à cet onglet (type de transaction), en plus des filtres globaux
 * déjà partagés (`filtres`, voir StatsPage.tsx). Tri effectué côté client via DetailBoxTriable
 * (voir api/stats.ts::getStatsFinances — le paramètre `tri`/`ordre` côté backend existe pour
 * d'autres consommateurs de l'API mais n'est pas utilisé par cette UI).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useStatsFinances } from "../../hooks/useStats";
import type { FinanceRecord, StatsFiltres, TypeTransaction } from "../../types/stats";
import type { Drill } from "./OngletBilan";
import DetailBoxTriable, { type ColonneDetailBox } from "./DetailBoxTriable";

const TYPES_TRANSACTION: TypeTransaction[] = [
  "cotisation",
  "don",
  "adhesion",
  "evenement",
  "boutique",
  "autre",
  "projet",
  "depense",
];

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

/** Repli lisible pour une valeur de statut inconnue (underscore -> espace, majuscule initiale). */
function formatStatutBrut(statut: string): string {
  const texte = statut.replace(/_/g, " ");
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export default function OngletFinances({
  filtres,
  drill = null,
  onResetDrill,
}: {
  filtres: StatsFiltres;
  /** Pré-filtre venu d'un clic sur un graphique (Jahresbilanz/Financier) — type et/ou mois. */
  drill?: Drill | null;
  onResetDrill?: () => void;
}) {
  const { t, i18n } = useTranslation("stats");
  const [typeTransaction, setTypeTransaction] = useState<TypeTransaction | "">(drill?.type ?? "");
  const mois = drill?.mois;

  const { data, isLoading, isError } = useStatsFinances({
    ...filtres,
    type_transaction: typeTransaction || undefined,
    mois,
  });

  const colonnes: ColonneDetailBox<FinanceRecord>[] = [
    { cle: "date", label: t("finances.col_date") },
    { cle: "type", label: t("finances.col_type"), render: (r) => t(`finances.type_${r.type}`) },
    { cle: "membre_nom", label: t("finances.col_membre") },
    { cle: "description", label: t("finances.col_description") },
    {
      cle: "montant",
      label: t("finances.col_montant"),
      align: "right",
      render: (r) => formatMontant(r.montant),
      valeurTri: (r) => Number(r.montant),
    },
    {
      cle: "statut",
      label: t("finances.col_statut"),
      render: (r) =>
        t(`finances.statuts.${r.statut}`, { defaultValue: formatStatutBrut(r.statut) }),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label
            htmlFor="finances-type-transaction"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("finances.filtre_type")}
          </label>
          <select
            id="finances-type-transaction"
            value={typeTransaction}
            onChange={(e) => setTypeTransaction(e.target.value as TypeTransaction | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
          >
            <option value="">{t("finances.filtre_type_tous")}</option>
            {TYPES_TRANSACTION.map((type) => (
              <option key={type} value={type}>
                {t(`finances.type_${type}`)}
              </option>
            ))}
          </select>
        </div>
        {mois && (
          <button
            type="button"
            onClick={onResetDrill}
            className="rounded-full bg-bg-tertiary px-3 py-1 text-xs text-text-secondary hover:bg-text-tertiary/20"
          >
            {t("finances.filtre_mois", {
              mois: new Date(2000, mois - 1, 1).toLocaleString(i18n.language, { month: "long" }),
            })}{" "}
            ✕
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-text-tertiary">{t("chargement")}</p>
      ) : isError || !data ? (
        <p className="text-sm text-status-dangerText">{t("erreur")}</p>
      ) : (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <DetailBoxTriable
            colonnes={colonnes}
            lignes={data.results}
            getRowKey={(r) => r.id}
            triInitial="date"
            directionInitiale="desc"
            messageVide={t("finances.aucune_donnee")}
          />
        </div>
      )}
    </div>
  );
}
