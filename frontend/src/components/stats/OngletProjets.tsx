/**
 * Onglet "Projekte" — Statistiken & KPIs (2026-10-07). Schnappschuss aller Projekte : Fortschritt
 * der Aufgaben, Plan/Ist/Offen der Kosten und Ergebnis. Ignoriert die globalen Filter (Jahr,
 * Ort, …) bewusst — Projekte laufen über Jahre ; wie der Onglet "Membres" ein aktueller Stand.
 */
import { useTranslation } from "react-i18next";

import { useStatsProjets } from "../../hooks/useStats";
import type { ProjektKennzahlZeile } from "../../types/stats";
import AnimatedKpiTile from "./AnimatedKpiTile";
import DetailBoxTriable, { type ColonneDetailBox } from "./DetailBoxTriable";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

export default function OngletProjets() {
  const { t } = useTranslation("stats");
  const { data, isLoading, isError } = useStatsProjets();

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  const colonnen: ColonneDetailBox<ProjektKennzahlZeile>[] = [
    { cle: "titre", label: t("projekte.col_projekt") },
    {
      cle: "prozent",
      label: t("projekte.col_fortschritt"),
      align: "right",
      render: (r) => `${r.aufgaben_erledigt}/${r.aufgaben_gesamt} (${r.prozent} %)`,
    },
    { cle: "ueberfaellig", label: t("projekte.col_ueberfaellig"), align: "right" },
    {
      cle: "plan",
      label: t("projekte.col_plan"),
      align: "right",
      render: (r) => formatMontant(r.plan),
      valeurTri: (r) => Number(r.plan),
    },
    {
      cle: "ist",
      label: t("projekte.col_ist"),
      align: "right",
      render: (r) => formatMontant(r.ist),
      valeurTri: (r) => Number(r.ist),
    },
    {
      cle: "offen",
      label: t("projekte.col_offen"),
      align: "right",
      render: (r) => formatMontant(r.offen),
      valeurTri: (r) => Number(r.offen),
    },
    {
      cle: "ergebnis",
      label: t("projekte.col_ergebnis"),
      align: "right",
      render: (r) => formatMontant(r.ergebnis),
      valeurTri: (r) => Number(r.ergebnis),
    },
  ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <AnimatedKpiTile label={t("projekte.gesamt")} value={data.projekte_gesamt} accent />
        <AnimatedKpiTile
          label={t("projekte.veroeffentlicht")}
          value={`${data.veroeffentlicht} / ${data.entwurf}`}
        />
        <AnimatedKpiTile
          label={t("projekte.aufgaben_quote")}
          value={data.aufgaben.quote}
          suffix=" %"
        />
        <AnimatedKpiTile label={t("projekte.ueberfaellig")} value={data.aufgaben.ueberfaellig} />
        <AnimatedKpiTile label={t("projekte.plan")} value={formatMontant(data.kosten.plan)} />
        <AnimatedKpiTile label={t("projekte.ist")} value={formatMontant(data.kosten.ist)} />
        <AnimatedKpiTile
          label={t("projekte.auslastung")}
          value={data.kosten.auslastung === null ? "–" : data.kosten.auslastung}
          suffix={data.kosten.auslastung === null ? undefined : " %"}
        />
        <AnimatedKpiTile
          label={t("projekte.ergebnis")}
          value={formatMontant(data.kosten.ergebnis)}
        />
      </div>
      <p className="mb-2 text-xs text-text-tertiary">{t("projekte.hinweis")}</p>
      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-xs font-bold text-text-primary">{t("projekte.je_projekt")}</h2>
        <DetailBoxTriable
          colonnes={colonnen}
          lignes={data.projekte}
          getRowKey={(r) => r.id}
          triInitial="titre"
          directionInitiale="asc"
          messageVide={t("projekte.keine_daten")}
        />
      </div>
    </div>
  );
}
