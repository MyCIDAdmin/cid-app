/**
 * Cockpit: Ampel-Kacheln, Aufgaben je Rolle (aus dem Datenstand abgeleitet), Ausgaben-Prognose
 * und Jahresrhythmus. Rein lesend; jede Aufgabe führt zur passenden Liste oder zum Probelauf.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useCockpit } from "../../hooks/useFinances";
import type { Cockpit, CockpitAufgabe, CockpitRolle, PruefZiel } from "../../types/finances";
import { euro } from "../../utils/finanzen";
import { EinfachSchalter, Fachwort, HilfeHinweis } from "./Erklaerung";

type Ampel = "gruen" | "orange" | "rot";
const KACHEL_RAND: Record<Ampel, string> = {
  gruen: "border-t-status-successText",
  orange: "border-t-status-warningText",
  rot: "border-t-status-dangerText",
};
const KACHEL_BADGE: Record<Ampel, string> = {
  gruen: "bg-status-successBg text-status-successText",
  orange: "bg-status-warningBg text-status-warningText",
  rot: "bg-status-dangerBg text-status-dangerText",
};
const ROLLEN: CockpitRolle[] = ["fin", "buero", "pruef"];
const MONATE = 12;

function tageBis(faellig: string, stand: string): number {
  const ms = new Date(`${faellig}T00:00:00`).getTime() - new Date(`${stand}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

function FristPlakette({ tage, datum }: { tage: number; datum: string }) {
  const { t, i18n } = useTranslation("finances");
  const stil =
    tage < 0
      ? "bg-status-dangerBg text-status-dangerText"
      : tage <= 7
        ? "bg-status-warningBg text-status-warningText"
        : "bg-status-infoBg text-status-infoText";
  const text =
    tage < 0
      ? t("cockpit.frist.ueberfaellig", { tage: -tage })
      : tage === 0
        ? t("cockpit.frist.heute")
        : tage <= 7
          ? t("cockpit.frist.in_tagen", { tage })
          : t("cockpit.frist.bis", {
              datum: new Date(`${datum}T00:00:00`).toLocaleDateString(i18n.language, {
                day: "2-digit",
                month: "2-digit",
              }),
            });
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stil}`}>{text}</span>
  );
}

function Kachel({
  ampel,
  titel,
  wert,
  text,
  onClick,
}: {
  ampel: Ampel;
  titel: string;
  wert: string;
  text: string;
  onClick: () => void;
}) {
  const { t } = useTranslation("finances");
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-cid-lg border-t-4 bg-bg-primary p-3 text-left shadow-sm hover:shadow ${KACHEL_RAND[ampel]}`}
    >
      <span className="flex items-center justify-between gap-2 text-[10px] uppercase text-text-tertiary">
        {titel}
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KACHEL_BADGE[ampel]}`}
        >
          {t(`cockpit.ampel.${ampel}`)}
        </span>
      </span>
      <b className="text-2xl tabular-nums text-text-primary">{wert}</b>
      <small className="text-xs text-text-secondary">{text}</small>
    </button>
  );
}

function Prognose({ daten }: { daten: Cockpit }) {
  const { t, i18n } = useTranslation("finances");
  const sp = i18n.language;
  const werte = daten.prognose.kumuliert.map(Number);
  const ende = Number(daten.prognose.jahresende);
  const budget = Number(daten.prognose.budget);
  const hoechst = Math.max(budget, ende, ...werte, 1) * 1.1;
  const B = 640;
  const H = 210;
  const links = 50;
  const x = (i: number) => links + ((B - links - 16) * i) / (MONATE - 1);
  const y = (v: number) => 14 + (H - 14 - 28) * (1 - v / hoechst);
  const linie = werte
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const letzter = werte.length - 1;
  const monate = Array.from({ length: MONATE }, (_, i) =>
    new Date(2000, i, 1).toLocaleDateString(sp, { month: "short" }),
  );
  const unterBudget = budget > 0 ? budget - ende : null;
  const ticks = [0, hoechst / 3, (hoechst * 2) / 3].map((v) => Math.round(v / 1000) * 1000);

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-bold text-text-primary">{t("cockpit.prognose.titel")}</h2>
      <svg
        viewBox={`0 0 ${B} ${H}`}
        role="img"
        aria-label={t("cockpit.prognose.label", {
          bisher: euro(daten.prognose.bisher, sp),
          ende: euro(ende, sp),
          budget: euro(budget, sp),
        })}
        className="h-auto w-full"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={links} x2={B - 16} y1={y(v)} y2={y(v)} className="stroke-text-tertiary/20" />
            <text
              x={links - 6}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-text-tertiary text-[10px]"
            >
              {Math.round(v / 1000)} T€
            </text>
          </g>
        ))}
        {budget > 0 && (
          <>
            <line
              x1={links}
              x2={B - 16}
              y1={y(budget)}
              y2={y(budget)}
              strokeWidth="2"
              strokeDasharray="6 4"
              className="stroke-status-dangerText"
            />
            <text
              x={links + 4}
              y={y(budget) - 5}
              className="fill-status-dangerText text-[10px] font-semibold"
            >
              {t("cockpit.prognose.budget", { betrag: euro(budget, sp) })}
            </text>
          </>
        )}
        {werte.length > 0 && (
          <>
            <path d={linie} fill="none" strokeWidth="2.5" className="stroke-ca" />
            <path
              d={`M${x(letzter)},${y(werte[letzter])} L${x(MONATE - 1)},${y(ende)}`}
              fill="none"
              strokeWidth="2.5"
              strokeDasharray="3 5"
              className="stroke-ca"
            />
            {werte.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="3" className="fill-ca">
                <title>{`${monate[i]}: ${euro(v, sp)}`}</title>
              </circle>
            ))}
            <circle
              cx={x(MONATE - 1)}
              cy={y(ende)}
              r="4.5"
              strokeWidth="2.5"
              className="fill-bg-primary stroke-ca"
            >
              <title>{t("cockpit.prognose.ende", { betrag: euro(ende, sp) })}</title>
            </circle>
          </>
        )}
        {monate.map((m, i) => (
          <text
            key={m}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-text-tertiary text-[10px]"
          >
            {m}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-sm text-text-primary">
        {t("cockpit.prognose.satz", {
          bisher: euro(daten.prognose.bisher, sp),
          ende: euro(ende, sp),
        })}{" "}
        {unterBudget !== null &&
          t(unterBudget >= 0 ? "cockpit.prognose.unter" : "cockpit.prognose.ueber", {
            betrag: euro(Math.abs(unterBudget), sp),
          })}
      </p>
      <HilfeHinweis>{t("cockpit.prognose.hilfe")}</HilfeHinweis>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-text-secondary">
          {t("cockpit.prognose.tabelle")}
        </summary>
        <table className="mt-1 w-full max-w-xs text-xs">
          <tbody>
            {werte.map((v, i) => (
              <tr key={monate[i]} className="border-b border-text-tertiary/10">
                <td className="py-1">{monate[i]}</td>
                <td className="py-1 text-right tabular-nums">{euro(v, sp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export default function CockpitTab({
  modifiable,
  onGoto,
}: {
  modifiable: boolean;
  onGoto: (ziel: PruefZiel) => void;
}) {
  const { t, i18n } = useTranslation("finances");
  const sp = i18n.language;
  const { data, isLoading, isError } = useCockpit();
  const [rolle, setRolle] = useState<CockpitRolle>(modifiable ? "fin" : "pruef");
  const aufgaben = useMemo(
    () => (data?.aufgaben ?? []).filter((a) => a.rollen.includes(rolle)),
    [data, rolle],
  );

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) return <p className="text-sm text-status-dangerText">{t("erreur")}</p>;

  const budgetAmpel: Ampel =
    data.budget.prozent === null
      ? "orange"
      : data.budget.prozent > 100
        ? "rot"
        : data.budget.prozent > data.budget.jahr_prozent + 10
          ? "orange"
          : "gruen";

  const aufgabeText = (a: CockpitAufgabe) => {
    const p = a.params as Record<string, number | string>;
    return {
      titel: t(`cockpit.aufgaben.${a.code}.titel`, {
        ...p,
        betrag: euro(Number(p.betrag ?? 0), sp),
      }),
      text: t(`cockpit.aufgaben.${a.code}.text`),
      knopf: t(`cockpit.aufgaben.${a.code}.knopf`),
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text-primary">
            {t("cockpit.titel", { annee: data.annee })}
          </h2>
          <p className="text-xs text-text-secondary">
            {t("cockpit.untertitel", { rolle: t(`cockpit.rollen.${rolle}`) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <EinfachSchalter />
          <div
            role="group"
            aria-label={t("cockpit.rolle")}
            className="flex rounded-full border border-text-tertiary/20 p-0.5"
          >
            {ROLLEN.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={rolle === r}
                onClick={() => setRolle(r)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  rolle === r ? "bg-ca text-white" : "text-text-secondary hover:bg-bg-tertiary"
                }`}
              >
                {t(`cockpit.rollen.${r}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kachel
          ampel={data.freigaben.anzahl ? "rot" : "gruen"}
          titel={t("cockpit.kacheln.freigaben")}
          wert={String(data.freigaben.anzahl)}
          text={t(
            data.freigaben.anzahl
              ? "cockpit.kacheln.freigaben_text"
              : "cockpit.kacheln.nichts_offen",
          )}
          onClick={() => onGoto("depenses")}
        />
        <Kachel
          ampel={data.belege.anzahl ? "orange" : "gruen"}
          titel={t("cockpit.kacheln.belege")}
          wert={String(data.belege.anzahl)}
          text={
            data.belege.anzahl
              ? t("cockpit.kacheln.belege_text", { betrag: euro(data.belege.betrag, sp) })
              : t("cockpit.kacheln.belege_ok")
          }
          onClick={() => onGoto("pruefung")}
        />
        <Kachel
          ampel={budgetAmpel}
          titel={t("cockpit.kacheln.budget", { annee: data.annee })}
          wert={data.budget.prozent === null ? "–" : `${data.budget.prozent} %`}
          text={
            data.budget.prozent === null
              ? t("cockpit.kacheln.budget_fehlt")
              : t("cockpit.kacheln.budget_text", {
                  verbraucht: euro(data.budget.verbraucht, sp),
                  gesamt: euro(data.budget.gesamt, sp),
                  jahr: data.budget.jahr_prozent,
                })
          }
          onClick={() => onGoto("budget")}
        />
        <Kachel
          ampel={data.beitraege.anzahl ? "orange" : "gruen"}
          titel={t("cockpit.kacheln.beitraege")}
          wert={String(data.beitraege.anzahl)}
          text={
            data.beitraege.anzahl
              ? t("cockpit.kacheln.beitraege_text", { betrag: euro(data.beitraege.betrag, sp) })
              : t("cockpit.kacheln.beitraege_ok")
          }
          onClick={() => onGoto("zahlungen")}
        />
      </div>
      <HilfeHinweis>{t("cockpit.ampel_hilfe")}</HilfeHinweis>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h2 className="mb-2 flex items-center justify-between gap-2 text-sm font-bold text-text-primary">
              {t("cockpit.aufgaben_titel")}
              <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                {t("cockpit.aufgaben_anzahl", { n: aufgaben.length })}
              </span>
            </h2>
            {aufgaben.length === 0 ? (
              <p className="rounded-cid bg-status-successBg px-3 py-2 text-sm text-status-successText">
                {t("cockpit.alles_erledigt")}
              </p>
            ) : (
              <ul className="space-y-2">
                {aufgaben.map((a) => {
                  const x = aufgabeText(a);
                  return (
                    <li
                      key={a.code}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-cid bg-bg-secondary p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">{x.titel}</p>
                        <p className="text-xs text-text-secondary">{x.text}</p>
                        <div className="mt-1">
                          <FristPlakette tage={tageBis(a.faellig, data.stand)} datum={a.faellig} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          to="/hilfe/karten?bereich=finances"
                          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
                        >
                          {t("cockpit.so_gehts")}
                        </Link>
                        <button
                          type="button"
                          onClick={() => onGoto(a.ziel)}
                          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white"
                        >
                          {x.knopf}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-text-tertiary">{t("cockpit.aufgaben_hinweis")}</p>
          </section>
          <Prognose daten={data} />
        </div>
        <div className="min-w-0 space-y-4">
          <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-bold text-text-primary">
              {t("cockpit.rhythmus.titel")}
            </h2>
            <ol className="space-y-2 text-xs">
              {(["nov", "dez", "jan", "feb", "maer", "apr"] as const).map((m) => (
                <li key={m} className="grid grid-cols-[44px_1fr] gap-2">
                  <span className="font-semibold uppercase text-text-tertiary">
                    {t(`cockpit.rhythmus.${m}.monat`)}
                  </span>
                  <span>
                    <b className="block text-text-primary">{t(`cockpit.rhythmus.${m}.titel`)}</b>
                    <span className="text-text-secondary">{t(`cockpit.rhythmus.${m}.text`)}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] text-text-tertiary">{t("cockpit.rhythmus.hinweis")}</p>
          </section>
          <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-bold text-text-primary">{t("cockpit.hilfe_titel")}</h2>
            <p className="text-xs text-text-secondary">
              {t("cockpit.hilfe_text")} <Fachwort begriff="abschluss" />,{" "}
              <Fachwort begriff="vier" />, <Fachwort begriff="budget" />,{" "}
              <Fachwort begriff="ergebnis" />.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
