/**
 * Büro-Ansicht der Übersicht : was heute zu erledigen ist (Nachweise, Zahlungen, Support) und
 * die Kennzahlen des Vereins. Nur für Bureau Admin und höher ; der Server prüft die Rechte
 * ohnehin (apps.stats, Support, Adhesions).
 */
import { IconCreditCard, IconHelp, IconId, IconTrophy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useJustificatifsEnAttente } from "../../hooks/useAdhesions";
import { useTippspielTeilnahmen } from "../../hooks/useCommunaute";
import { useCountUp } from "../../hooks/useCountUp";
import { useStatsFinancier, useStatsMembres } from "../../hooks/useStats";
import { useAlleTickets } from "../../hooks/useSupport";

type Farbe = "red" | "amber" | "blue" | "green";

const ZAHL_FARBE: Record<Farbe, string> = {
  red: "bg-status-dangerBg text-status-dangerText",
  amber: "bg-status-warningBg text-status-warningText",
  blue: "bg-status-infoBg text-status-infoText",
  green: "bg-status-successBg text-status-successText",
};

function betrag(wert: string | number): string {
  return `${Number(wert).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function Kennzahl({
  label,
  wert,
  zeile,
}: {
  label: string;
  wert: number | string;
  zeile?: string;
}) {
  const animiert = useCountUp(typeof wert === "number" ? wert : undefined);
  const text =
    typeof wert === "number" ? Math.round(animiert ?? wert).toLocaleString("de-DE") : wert;
  return (
    <div className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-text-primary">{text}</p>
      {zeile && <p className="text-[11px] text-text-tertiary">{zeile}</p>}
    </div>
  );
}

export default function BueroZuErledigen() {
  const { t } = useTranslation("dashboard");
  const nachweise = useJustificatifsEnAttente().data?.results.length ?? 0;
  const tickets = useAlleTickets({ status: "aktiv", q: "" }, true).data?.length ?? 0;
  const tippZahlungen =
    useTippspielTeilnahmen({ statutPaiement: "en_attente" }).data?.results.length ?? 0;
  const mitglieder = useStatsMembres({}, { enabled: true }).data;
  const finanzen = useStatsFinancier({}, { enabled: true }).data;

  const zeilen: {
    id: string;
    n: number;
    farbe: Farbe;
    icon: typeof IconId;
    link: string;
    zeile?: string;
  }[] = [
    { id: "nachweise", n: nachweise, farbe: "amber", icon: IconId, link: "/admin/justificatifs" },
    {
      id: "zahlungen",
      n: finanzen ? (Number(finanzen.cotisations_en_attente) > 0 ? 1 : 0) : 0,
      farbe: "amber",
      icon: IconCreditCard,
      link: "/cotisations/en-attente",
      zeile: finanzen ? betrag(finanzen.cotisations_en_attente) : undefined,
    },
    { id: "tippzahlungen", n: tippZahlungen, farbe: "blue", icon: IconTrophy, link: "/live" },
    { id: "support", n: tickets, farbe: "blue", icon: IconHelp, link: "/support" },
  ];
  const offen = zeilen.filter((z) => z.n > 0);

  return (
    <>
      <section
        aria-label={t("uebersicht.buero.titel")}
        className="rounded-cid-lg bg-bg-primary p-4 shadow-sm"
        data-testid="buero-zu-erledigen"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {t("uebersicht.buero.titel")}
          </h2>
          {offen.length > 0 && (
            <span className="rounded-full bg-status-dangerBg px-2 py-0.5 text-[11px] font-bold text-status-dangerText">
              {t("uebersicht.buero.punkte", { count: offen.length })}
            </span>
          )}
        </div>
        {offen.length === 0 ? (
          <p className="py-2 text-sm text-text-secondary">{t("uebersicht.buero.nichts")}</p>
        ) : (
          <ul>
            {offen.map((z) => (
              <li
                key={z.id}
                className="flex flex-wrap items-center gap-3 border-t border-bg-tertiary py-3 first:border-0 first:pt-0"
              >
                <span
                  className={`flex h-11 min-w-[2.75rem] items-center justify-center rounded-cid px-2 text-xl font-semibold tabular-nums ${ZAHL_FARBE[z.farbe]}`}
                >
                  {z.id === "zahlungen" ? <z.icon size={22} aria-hidden="true" /> : z.n}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold text-text-primary">
                    {t(`uebersicht.buero.${z.id}.titel`, { count: z.n })}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {t(`uebersicht.buero.${z.id}.zeile`, { betrag: z.zeile })}
                  </p>
                </div>
                <Link
                  to={z.link}
                  className="inline-flex min-h-[36px] items-center rounded-cid bg-ca px-3 text-xs font-semibold text-white hover:bg-cad"
                >
                  {t(`uebersicht.buero.${z.id}.knopf`)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label={t("uebersicht.buero.kennzahlen")}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Kennzahl label={t("kpi.membres_actifs")} wert={mitglieder?.actifs ?? "—"} />
        <Kennzahl
          label={t("kpi.taux_collecte")}
          wert={finanzen ? `${finanzen.taux_collecte} %` : "—"}
          zeile={
            finanzen
              ? t("kpi.cotisations_en_attente", {
                  montant: betrag(finanzen.cotisations_en_attente),
                })
              : undefined
          }
        />
      </section>
    </>
  );
}
