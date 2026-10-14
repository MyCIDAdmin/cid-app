/**
 * Aktivität — Nutzung (Release 23) : Welche Module werden genutzt, und von wie vielen Personen?
 * Nur Summen (Personen und 5-Minuten-Nutzungsfenster), nie einzelne Personen oder Seitenaufrufe.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useNutzung } from "../../hooks/useAktivitaet";
import { textIn } from "../../utils/aktivitaet";
import AnimatedKpiTile from "../stats/AnimatedKpiTile";

const ZEITRAEUME = [7, 30, 90] as const;

export default function NutzungPanel() {
  const { t, i18n } = useTranslation("aktivitaet");
  const [tage, setTage] = useState<number>(30);
  const { data, isLoading, isError } = useNutzung(tage);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }

  const maxNutzer = Math.max(1, ...data.module.map((m) => m.nutzer));
  const maxTag = Math.max(1, ...data.verlauf.map((d) => d.nutzer));
  const breite = 100 / data.verlauf.length;
  const nichtGenutzt = data.module.filter((m) => data.ungenutzt.includes(m.modul));

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">{t("nutzung.hinweis")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-secondary">{t("uebersicht.zeitraum")}</span>
        {ZEITRAEUME.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setTage(z)}
            aria-pressed={tage === z}
            className={`rounded-cid-lg px-3 py-1 text-xs font-medium ${
              tage === z ? "bg-ca text-white" : "bg-bg-tertiary text-text-secondary"
            }`}
          >
            {t("uebersicht.tage", { count: z })}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AnimatedKpiTile label={t("nutzung.kacheln.d1")} value={data.aktiv.d1} />
        <AnimatedKpiTile label={t("nutzung.kacheln.d7")} value={data.aktiv.d7} />
        <AnimatedKpiTile label={t("nutzung.kacheln.d30")} value={data.aktiv.d30} />
        <AnimatedKpiTile
          label={t("nutzung.kacheln.anteil")}
          value={data.aktiv.konten ? Math.round((data.aktiv.d30 / data.aktiv.konten) * 100) : 0}
          suffix=" %"
        />
      </div>

      <figure className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <figcaption className="mb-2 text-xs font-medium text-text-primary">
          {t("nutzung.verlauf")}
        </figcaption>
        <svg
          role="img"
          aria-label={t("nutzung.verlauf")}
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="h-28 w-full"
        >
          {data.verlauf.map((d, i) => {
            const hoehe = (d.nutzer / maxTag) * 38;
            return (
              <g key={d.tag}>
                <title>{`${d.tag}: ${d.nutzer}`}</title>
                <rect
                  x={i * breite + breite * 0.15}
                  y={40 - hoehe}
                  width={breite * 0.7}
                  height={hoehe}
                  fill="var(--color-status-successText)"
                />
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-[10px] text-text-tertiary">
          <span>{data.verlauf[0]?.tag}</span>
          <span>{data.verlauf[data.verlauf.length - 1]?.tag}</span>
        </div>
      </figure>

      <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <h3 className="mb-2 text-xs font-medium text-text-primary">{t("nutzung.module")}</h3>
        <ul className="space-y-1.5">
          {data.module.map((m) => (
            <li key={m.modul} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate text-text-primary">{textIn(i18n.language, m.label)}</span>
              <span className="h-2 rounded-full bg-bg-tertiary">
                <span
                  className="block h-2 rounded-full"
                  style={{
                    width: `${(m.nutzer / maxNutzer) * 100}%`,
                    background: "var(--color-status-successText)",
                  }}
                />
              </span>
              <span className="text-text-tertiary">
                {t("nutzung.personen", { count: m.nutzer })} ·{" "}
                {t("nutzung.fenster", { count: m.fenster })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {nichtGenutzt.length > 0 && (
        <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <h3 className="mb-1 text-xs font-medium text-text-primary">{t("nutzung.ungenutzt")}</h3>
          <p className="text-xs text-text-tertiary">
            {nichtGenutzt.map((m) => textIn(i18n.language, m.label)).join(", ")}
          </p>
        </section>
      )}
    </div>
  );
}
