/**
 * Onglet "Tabelle"/"Classement" — module Fan-Club (2026-09-24, extension du Live Match).
 * Lecture seule : le classement est toujours synchronisé automatiquement depuis GOAL API
 * (voir backend apps.communaute.services), jamais éditable ici.
 *
 * Bascule "Gesamt/Heim/Auswärts" (ensemble/domicile/extérieur) ajoutée lors du passage à
 * GOAL API (2026-09-24) : le classement contient désormais nativement une répartition
 * domicile/extérieur par équipe (`ClassementLigue.*_domicile`/`*_exterieur`, voir
 * apps.communaute.services), indisponible sous SerpApi/Google Sports. Le rang affiché
 * reste toujours le rang général du championnat (GOAL API ne fournit pas de classement
 * domicile/extérieur reclassé) — seules les colonnes statistiques changent selon la vue.
 *
 * Fan-Club-Umbau (2026-11, Vorschlag A) : drei Kennzahlen oben (Platz, Abstand zu Platz 1
 * bzw. Vorsprung auf Platz 2, Polster zum Abstieg), farbige Zonen mit Legende, Trend ▲▼
 * (`rang_vorher`, vom Sync beim neuen Spieltag gesetzt). Alles rein aus den Tabellendaten, damit
 * der Reiter weiter ohne Anmeldung funktioniert (öffentliche FanClubPreview).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useClassementLigue } from "../../hooks/useCommunaute";
import type { ClassementLigue } from "../../types/communaute";
import { tabellenKpis, trend, zoneArt } from "../../utils/fanclub";
import EquipeLogoImage from "./EquipeLogoImage";

type Vue = "ensemble" | "domicile" | "exterieur";

const VUES: Vue[] = ["ensemble", "domicile", "exterieur"];

function statistiquesDeLaVue(ligne: ClassementLigue, vue: Vue) {
  if (vue === "domicile") {
    return {
      joues: ligne.joues_domicile,
      victoires: ligne.victoires_domicile,
      nuls: ligne.nuls_domicile,
      defaites: ligne.defaites_domicile,
      buts_pour: ligne.buts_pour_domicile,
      buts_contre: ligne.buts_contre_domicile,
      points: ligne.points_domicile,
    };
  }
  if (vue === "exterieur") {
    return {
      joues: ligne.joues_exterieur,
      victoires: ligne.victoires_exterieur,
      nuls: ligne.nuls_exterieur,
      defaites: ligne.defaites_exterieur,
      buts_pour: ligne.buts_pour_exterieur,
      buts_contre: ligne.buts_contre_exterieur,
      points: ligne.points_exterieur,
    };
  }
  return {
    joues: ligne.joues,
    victoires: ligne.victoires,
    nuls: ligne.nuls,
    defaites: ligne.defaites,
    buts_pour: ligne.buts_pour,
    buts_contre: ligne.buts_contre,
    points: ligne.points,
  };
}

const FORM_STIL: Record<string, string> = {
  V: "bg-status-successBg text-status-successText",
  N: "bg-bg-tertiary text-text-secondary",
  D: "bg-status-dangerBg text-status-dangerText",
};

/** Letzte fünf Ergebnisse als farbige Kürzel (V/N/D intern → S/U/N je Sprache über i18n). */
function FormChips({ forme }: { forme: string }) {
  const { t } = useTranslation("communaute");
  if (!forme) return <span className="text-text-tertiary">–</span>;
  return (
    <span className="flex gap-0.5">
      {forme.split("").map((code, index) => (
        <span
          key={index}
          title={t(`live.forme_${code}`, { defaultValue: code })}
          className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${FORM_STIL[code] ?? FORM_STIL.N}`}
        >
          {t(`live.forme_kurz_${code}`, { defaultValue: code })}
        </span>
      ))}
    </span>
  );
}

const ZONE_STIL = {
  oben: "border-l-4 border-l-status-successText",
  abstieg: "border-l-4 border-l-status-dangerText",
} as const;

function TrendAnzeige({ ligne }: { ligne: ClassementLigue }) {
  const { t } = useTranslation("communaute");
  const delta = trend(ligne);
  if (delta === null || delta === 0) {
    return (
      <span className="text-text-tertiary" title={t("live.trend_gleich")}>
        ·
      </span>
    );
  }
  const hoch = delta > 0;
  return (
    <span
      className={`text-[11px] font-bold tabular-nums ${
        hoch ? "text-status-successText" : "text-status-dangerText"
      }`}
      title={t(hoch ? "live.trend_hoch" : "live.trend_runter", { anzahl: Math.abs(delta) })}
    >
      {hoch ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

function Kennzahl({ label, wert, hinweis }: { label: string; wert: string; hinweis?: string }) {
  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-text-primary">{wert}</p>
      {hinweis && <p className="mt-0.5 text-[11px] text-text-tertiary">{hinweis}</p>}
    </div>
  );
}

function Kennzahlen({ lignes }: { lignes: ClassementLigue[] }) {
  const { t } = useTranslation("communaute");
  const kpis = tabellenKpis(lignes);
  if (!kpis) return null;
  const fuehrt = kpis.abstandPlatz1 === 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="tabelle-kennzahlen">
      <Kennzahl
        label={t("live.kpi_platz")}
        wert={`${kpis.rang}.`}
        hinweis={t("live.kpi_punkte_hinweis", { punkte: kpis.punkte })}
      />
      {fuehrt ? (
        <Kennzahl
          label={t("live.kpi_vorsprung_platz2")}
          wert={kpis.abstandPlatz2 === null ? "–" : `+${Math.abs(kpis.abstandPlatz2)}`}
          hinweis={t("live.kpi_punkte_einheit")}
        />
      ) : (
        <Kennzahl
          label={t("live.kpi_abstand_platz1")}
          wert={`−${kpis.abstandPlatz1}`}
          hinweis={t("live.kpi_punkte_einheit")}
        />
      )}
      {kpis.polsterAbstieg !== null && (
        <Kennzahl
          label={t("live.kpi_polster_abstieg")}
          wert={`+${kpis.polsterAbstieg}`}
          hinweis={t("live.kpi_punkte_einheit")}
        />
      )}
    </div>
  );
}

export default function ClassementTab() {
  const { t } = useTranslation("communaute");
  const { data, isLoading, isError } = useClassementLigue();
  const [vue, setVue] = useState<Vue>("ensemble");
  const lignes = data?.results ?? [];

  if (isLoading) {
    return <p className="text-sm text-text-tertiary">{t("live.classement_chargement")}</p>;
  }
  if (isError) {
    return <p className="text-sm text-status-dangerText">{t("live.classement_erreur")}</p>;
  }
  if (lignes.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("live.classement_vide")}</p>;
  }

  const hatZonen = lignes.some((l) => zoneArt(l.zone_texte) !== null);

  return (
    <div className="space-y-3">
      <Kennzahlen lignes={lignes} />
      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-text-tertiary/10 px-3 py-2">
          <span className="text-xs font-bold text-text-tertiary">
            {t("live.classement_saison", { saison: lignes[0].saison })}
          </span>
          <div
            className="flex gap-1 overflow-x-auto"
            role="tablist"
            aria-label={t("live.classement_vue_label")}
          >
            {VUES.map((valeur) => (
              <button
                key={valeur}
                type="button"
                role="tab"
                aria-selected={vue === valeur}
                onClick={() => setVue(valeur)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  vue === valeur
                    ? "bg-ca text-white"
                    : "bg-bg-secondary text-text-tertiary hover:text-text-primary"
                }`}
              >
                {t(`live.classement_vue_${valeur}`)}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text-tertiary">
              <th className="px-3 py-2">{t("live.classement_rang")}</th>
              <th className="w-8 px-1 py-2" aria-label={t("live.trend_label")} />
              <th className="px-3 py-2">{t("live.classement_equipe")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_joues")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_victoires")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_nuls")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_defaites")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_buts_pour")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_buts_contre")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_difference")}</th>
              <th className="px-2 py-2 text-center">{t("live.classement_points")}</th>
              {vue === "ensemble" && <th className="px-3 py-2">{t("live.classement_forme")}</th>}
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne) => {
              const stats = statistiquesDeLaVue(ligne, vue);
              const difference = stats.buts_pour - stats.buts_contre;
              const zone = zoneArt(ligne.zone_texte);
              return (
                <tr
                  key={ligne.id}
                  className={`border-t border-text-tertiary/10 ${zone ? ZONE_STIL[zone] : ""} ${
                    ligne.equipe === "Club Africain"
                      ? "bg-cal/40 font-bold text-cad"
                      : "text-text-primary"
                  }`}
                >
                  <td className="px-3 py-2">{ligne.rang}</td>
                  <td className="px-1 py-2">
                    <TrendAnzeige ligne={ligne} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <EquipeLogoImage equipe={ligne.equipe} />
                      <span className="whitespace-nowrap">{ligne.equipe}</span>
                      {ligne.zone_texte && (
                        <span className="hidden text-[10px] font-normal text-text-tertiary lg:inline">
                          {ligne.zone_texte}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums">{stats.joues}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{stats.victoires}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{stats.nuls}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{stats.defaites}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{stats.buts_pour}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{stats.buts_contre}</td>
                  <td className="px-2 py-2 text-center tabular-nums">
                    {difference > 0 ? `+${difference}` : difference}
                  </td>
                  <td className="px-2 py-2 text-center text-sm font-bold tabular-nums">
                    {stats.points}
                  </td>
                  {vue === "ensemble" && (
                    <td className="px-3 py-2">
                      <FormChips forme={ligne.forme_recente} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {hatZonen && (
          <ul
            className="flex flex-wrap gap-x-4 gap-y-1 border-t border-text-tertiary/10 px-3 py-2 text-[11px] text-text-tertiary"
            aria-label={t("live.zonen_legende")}
          >
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-1 rounded-sm bg-status-successText" aria-hidden="true" />
              {t("live.zone_oben")}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-1 rounded-sm bg-status-dangerText" aria-hidden="true" />
              {t("live.zone_abstieg")}
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
