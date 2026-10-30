/**
 * „Mein Reiseplan“ : Hinreise, Unterkunft und Rückreise als Zeitleiste. Was noch fehlt, hat einen
 * „Eintragen“-Knopf. Nur für die Person selbst (und die Organisation) sichtbar.
 */
import { useTranslation } from "react-i18next";

import type { Etappe, ReiseDetail } from "../../types/reisen";
import { zeitKurz } from "../../utils/reisen";
import { KARTE, KNOPF } from "./ui";

type Zustand = "gebucht" | "geplant" | "fehlt";

const PUNKT: Record<Zustand, string> = {
  gebucht: "bg-status-successBg text-status-successText",
  geplant: "bg-amber-100 text-amber-800",
  fehlt: "bg-bg-tertiary text-text-tertiary",
};

function zustandVon(e: Etappe | undefined): Zustand {
  if (!e) return "fehlt";
  return e.status === "gebucht" || e.status === "selbst" ? "gebucht" : "geplant";
}

export default function MeinReiseplan({
  reise,
  onTab,
}: {
  reise: ReiseDetail;
  onTab: (tab: string) => void;
}) {
  const { t, i18n } = useTranslation("reisen");
  const meine = reise.meine;
  if (!meine || meine.status !== "dabei") return null;

  const hin = meine.etappen.find((e) => e.richtung === "hin");
  const rueck = meine.etappen.find((e) => e.richtung === "rueck");
  const hatUnterkunft = Boolean(meine.unterkunft || meine.unterkunft_eigen);
  const zeilen: { id: string; titel: string; zeile: string; zustand: Zustand }[] = [
    {
      id: "hin",
      titel: t("heute.hinreise"),
      zeile: hin
        ? `${hin.von_ort} → ${hin.nach_ort}${hin.abfahrt ? ` · ${zeitKurz(hin.abfahrt, i18n.language)}` : ""}`
        : t("heute.fehlt_noch"),
      zustand: zustandVon(hin),
    },
    {
      id: "unterkunft",
      titel: t("heute.unterkunft"),
      zeile: hatUnterkunft
        ? meine.unterkunft_eigen || t("heute.unterkunft_gewaehlt")
        : t("heute.fehlt_noch"),
      zustand: !hatUnterkunft ? "fehlt" : meine.unterkunft_gebucht ? "gebucht" : "geplant",
    },
    {
      id: "rueck",
      titel: t("heute.rueckreise"),
      zeile: rueck
        ? `${rueck.von_ort} → ${rueck.nach_ort}${rueck.abfahrt ? ` · ${zeitKurz(rueck.abfahrt, i18n.language)}` : ""}`
        : t("heute.fehlt_noch"),
      zustand: zustandVon(rueck),
    },
  ];

  return (
    <section aria-label={t("heute.reiseplan")} className={`${KARTE} space-y-1`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("heute.reiseplan")}</h2>
        <p className="text-[11px] text-text-tertiary">{t("heute.nur_fuer_dich")}</p>
      </div>
      <ol className="divide-y divide-text-tertiary/15">
        {zeilen.map((z) => (
          <li key={z.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{z.titel}</p>
              <p className="truncate text-xs text-text-secondary">{z.zeile}</p>
            </div>
            {z.zustand === "fehlt" ? (
              <button type="button" className={KNOPF} onClick={() => onTab("meine")}>
                {t("heute.eintragen")}
              </button>
            ) : (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${PUNKT[z.zustand]}`}>
                {t(`heute.${z.zustand}`)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
