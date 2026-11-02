/**
 * Tab „Überblick" der Shop-Verwaltung: vier Ampel-Kacheln und „Deine Aufgaben". Alles wird im
 * Backend aus den vorhandenen Daten berechnet (GET /boutique/verwaltung/ueberblick/, ohne neue
 * Tabellen); Aufgaben verschwinden von selbst, sobald sie erledigt sind. Jede Aufgabe führt mit
 * einem Klick zur passenden Liste.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useVerwaltungUeberblick } from "../../hooks/useBoutique";
import type { Aufgabe, Kachel as KachelDaten, StapelName, Ton } from "../../types/boutique";
import { EinfachSchalter, Fachwort, HilfeHinweis } from "../ui/Erklaerung";

const NS = "boutique";

/** Ziel eines Klicks: in welchem Tab und mit welchem Filter die Liste geöffnet wird. */
export interface VerwaltungsZiel {
  tab: "bestellungen" | "katalog" | "reservierungen";
  stapel?: StapelName;
  produit?: string;
  filter?: string;
}

const RAND: Record<Ton, string> = {
  gruen: "border-t-status-successText",
  orange: "border-t-status-warningText",
  rot: "border-t-status-dangerText",
};
const BADGE: Record<Ton, string> = {
  gruen: "bg-status-successBg text-status-successText",
  orange: "bg-status-warningBg text-status-warningText",
  rot: "bg-status-dangerBg text-status-dangerText",
};
const SCHWERE_STIL = {
  rot: "bg-status-dangerBg text-status-dangerText",
  orange: "bg-status-warningBg text-status-warningText",
  info: "bg-bg-tertiary text-text-secondary",
} as const;

function Tage({ tage }: { tage: number | null }) {
  const { t } = useTranslation(NS);
  if (tage === null) return null;
  return <>{tage === 0 ? t("ueberblick.heute") : t("ueberblick.seit_tagen", { count: tage })}</>;
}

function KachelKarte({
  titel,
  kachel,
  text,
  onClick,
}: {
  titel: string;
  kachel: KachelDaten;
  text: string;
  onClick: () => void;
}) {
  const { t } = useTranslation(NS);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-cid-lg border-t-4 bg-bg-primary p-3 text-left shadow-sm hover:shadow ${RAND[kachel.ton]}`}
    >
      <span className="flex items-center justify-between gap-2 text-[10px] uppercase text-text-tertiary">
        {titel}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[kachel.ton]}`}>
          {t(`ueberblick.ampel.${kachel.ton}`)}
        </span>
      </span>
      <b className="text-2xl tabular-nums text-text-primary">{kachel.anzahl}</b>
      <small className="text-xs text-text-secondary">{text}</small>
    </button>
  );
}

function AufgabenZeile({ a, onZiel }: { a: Aufgabe; onZiel: (z: VerwaltungsZiel) => void }) {
  const { t } = useTranslation(NS);
  const ziel = a.ziel as VerwaltungsZiel;
  const text =
    a.art === "katalog"
      ? t("ueberblick.aufgaben.katalog.text", { namen: (a.daten.namen ?? []).join(", ") })
      : t(`ueberblick.aufgaben.${a.art}.text`, { count: a.anzahl });
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 rounded-cid bg-bg-secondary p-3 ${
        a.darf ? "" : "opacity-70"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">
          {t(`ueberblick.aufgaben.${a.art}.titel`, {
            count: a.anzahl,
            produkt: a.daten.produkt ?? "",
          })}
        </p>
        <p className="text-xs text-text-secondary">{text}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {a.tage !== null && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SCHWERE_STIL[a.schwere]}`}
            >
              <Tage tage={a.tage} />
            </span>
          )}
          {a.art === "katalog" && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SCHWERE_STIL[a.schwere]}`}
            >
              {t("ueberblick.hinweise")}
            </span>
          )}
          <span className="rounded-full bg-status-infoBg px-2 py-0.5 text-[10px] font-semibold uppercase text-status-infoText">
            {t(`ueberblick.rolle.${a.rolle}`)}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        <Link
          to="/hilfe/karten?bereich=boutique"
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
        >
          {t("ueberblick.so_gehts")}
        </Link>
        <button
          type="button"
          onClick={() => onZiel(ziel)}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white"
        >
          {t(`ueberblick.aufgaben.${a.art}.knopf`)}
        </button>
      </div>
    </li>
  );
}

const ABLAUF = [
  { n: "bestellt", wort: null },
  { n: "bezahlt", wort: "zahlung_bestaetigen" },
  { n: "versandt", wort: "sendungsnummer" },
  { n: "geliefert", wort: null },
  { n: "fertig", wort: "ruecksendung" },
] as const;

export default function UeberblickTab({ onZiel }: { onZiel: (z: VerwaltungsZiel) => void }) {
  const { t } = useTranslation(NS);
  const { data, isLoading, isError } = useVerwaltungUeberblick();
  const [andere, setAndere] = useState(false);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("ueberblick.laden")}</p>;
  if (isError || !data)
    return <p className="text-sm text-status-dangerText">{t("ueberblick.fehler")}</p>;

  const eigene = data.aufgaben.filter((a) => a.darf);
  const fremde = data.aufgaben.filter((a) => !a.darf);
  const k = data.kacheln;
  const alterText = (kachel: KachelDaten) =>
    kachel.anzahl === 0
      ? t("ueberblick.nichts_offen")
      : kachel.aeltest_tage
        ? t("ueberblick.aelteste_tage", { count: kachel.aeltest_tage })
        : t("ueberblick.aelteste_heute");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text-primary">{t("ueberblick.titel")}</h2>
          <p className="text-xs text-text-secondary">{t("ueberblick.untertitel")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <EinfachSchalter ns={NS} />
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              eigene.length ? BADGE.rot : BADGE.gruen
            }`}
          >
            {t("ueberblick.aufgaben_anzahl", { count: eigene.length })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KachelKarte
          titel={t("ueberblick.kacheln.zahlung_offen")}
          kachel={k.zahlung_offen}
          text={alterText(k.zahlung_offen)}
          onClick={() => onZiel({ tab: "bestellungen", stapel: "zahlung_offen" })}
        />
        <KachelKarte
          titel={t("ueberblick.kacheln.zu_versenden")}
          kachel={k.zu_versenden}
          text={alterText(k.zu_versenden)}
          onClick={() => onZiel({ tab: "bestellungen", stapel: "zu_versenden" })}
        />
        <KachelKarte
          titel={t("ueberblick.kacheln.reservierungen")}
          kachel={k.reservierungen_offen}
          text={
            k.reservierungen_offen.anzahl
              ? t("ueberblick.kacheln.reservierungen_text")
              : t("ueberblick.nichts_offen")
          }
          onClick={() => onZiel({ tab: "reservierungen" })}
        />
        <KachelKarte
          titel={t("ueberblick.kacheln.katalog")}
          kachel={k.katalog_hinweise}
          text={
            k.katalog_hinweise.anzahl
              ? t("ueberblick.kacheln.katalog_text")
              : t("ueberblick.nichts_offen")
          }
          onClick={() => onZiel({ tab: "katalog", filter: "hinweise" })}
        />
      </div>
      <HilfeHinweis ns={NS}>{t("ueberblick.ampel_hilfe")}</HilfeHinweis>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <section className="min-w-0 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-text-primary">
            {t("ueberblick.aufgaben_titel")}
          </h2>
          {eigene.length === 0 ? (
            <p className="rounded-cid bg-status-successBg px-3 py-2 text-sm text-status-successText">
              {t("ueberblick.alles_erledigt")}
            </p>
          ) : (
            <ul className="space-y-2">
              {eigene.map((a) => (
                <AufgabenZeile key={a.id} a={a} onZiel={onZiel} />
              ))}
            </ul>
          )}
          {fremde.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={andere}
                onClick={() => setAndere((x) => !x)}
                className="text-xs font-medium text-text-secondary underline underline-offset-2"
              >
                {t(andere ? "ueberblick.andere_aus" : "ueberblick.andere_an", {
                  count: fremde.length,
                })}
              </button>
              {andere && (
                <ul className="mt-2 space-y-2">
                  {fremde.map((a) => (
                    <AufgabenZeile key={a.id} a={a} onZiel={onZiel} />
                  ))}
                </ul>
              )}
            </div>
          )}
          <HilfeHinweis ns={NS}>{t("ueberblick.aufgaben_hilfe")}</HilfeHinweis>
        </section>

        <section className="min-w-0 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-text-primary">
            {t("ueberblick.ablauf.titel")}
          </h2>
          <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ABLAUF.map((s, i) => (
              <li key={s.n} className="rounded-cid bg-bg-secondary p-2 text-xs">
                <span className="mb-1 grid h-5 w-5 place-items-center rounded-full bg-ca text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <b className="block text-text-primary">{t(`ueberblick.ablauf.${s.n}.titel`)}</b>
                <span className="text-text-secondary">
                  {s.wort ? (
                    <>
                      {t(`ueberblick.ablauf.${s.n}.text_vor`)} <Fachwort ns={NS} begriff={s.wort} />
                      {t(`ueberblick.ablauf.${s.n}.text_nach`)}
                    </>
                  ) : (
                    t(`ueberblick.ablauf.${s.n}.text`)
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
