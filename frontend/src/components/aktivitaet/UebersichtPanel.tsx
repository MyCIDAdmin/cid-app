/**
 * Aktivität — Übersicht (Release 20) : Kacheln, Verlauf, Heatmap der Anmeldezeiten,
 * auffällige IP-Adressen und die Konten mit erweiterten Rechten. Nur für den App-Admin.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useUebersicht } from "../../hooks/useAktivitaet";
import type { JournalFilter, Uebersicht } from "../../types/aktivitaet";
import { zeitpunkt } from "../../utils/aktivitaet";
import AnimatedKpiTile from "../stats/AnimatedKpiTile";

const ZEITRAEUME = [7, 30, 90] as const;
const WOCHENTAGE = ["mo", "di", "mi", "do", "fr", "sa", "so"] as const;

function Verlauf({ daten }: { daten: Uebersicht["verlauf"] }) {
  const { t } = useTranslation("aktivitaet");
  const maximum = Math.max(1, ...daten.map((d) => d.logins + d.fehlversuche));
  const breite = 100 / daten.length;
  return (
    <figure className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <figcaption className="mb-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <span className="font-medium text-text-primary">{t("uebersicht.verlauf")}</span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: "var(--color-status-successText)" }}
          />
          {t("uebersicht.logins")}
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: "var(--color-status-dangerText)" }}
          />
          {t("uebersicht.fehlversuche")}
        </span>
      </figcaption>
      <svg
        role="img"
        aria-label={t("uebersicht.verlauf")}
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-32 w-full"
      >
        {daten.map((d, i) => {
          const hoeheLogins = (d.logins / maximum) * 38;
          const hoeheFehler = (d.fehlversuche / maximum) * 38;
          return (
            <g key={d.tag}>
              <title>{`${d.tag}: ${d.logins} / ${d.fehlversuche}`}</title>
              <rect
                x={i * breite + breite * 0.15}
                y={40 - hoeheLogins}
                width={breite * 0.7}
                height={hoeheLogins}
                fill="var(--color-status-successText)"
              />
              <rect
                x={i * breite + breite * 0.15}
                y={40 - hoeheLogins - hoeheFehler}
                width={breite * 0.7}
                height={hoeheFehler}
                fill="var(--color-status-dangerText)"
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-text-tertiary">
        <span>{daten[0]?.tag}</span>
        <span>{daten[daten.length - 1]?.tag}</span>
      </div>
    </figure>
  );
}

function Heatmap({ daten }: { daten: number[][] }) {
  const { t } = useTranslation("aktivitaet");
  const maximum = Math.max(1, ...daten.flat());
  return (
    <figure className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <figcaption className="mb-2 text-xs font-medium text-text-primary">
        {t("uebersicht.heatmap")}
      </figcaption>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px] text-text-tertiary">
          <tbody>
            {daten.map((zeile, wochentag) => (
              <tr key={WOCHENTAGE[wochentag]}>
                <th scope="row" className="pr-1 text-right font-normal">
                  {t(`uebersicht.tage_kurz.${WOCHENTAGE[wochentag]}`)}
                </th>
                {zeile.map((n, stunde) => (
                  <td
                    key={stunde}
                    title={`${t(`uebersicht.tage_kurz.${WOCHENTAGE[wochentag]}`)} ${stunde}:00 – ${n}`}
                    className="h-3 w-3 min-w-3 rounded-sm"
                    style={{
                      background: "var(--color-status-successText)",
                      opacity: n === 0 ? 0.08 : 0.2 + 0.8 * (n / maximum),
                    }}
                  />
                ))}
              </tr>
            ))}
            <tr>
              <td />
              {Array.from({ length: 24 }, (_, stunde) => (
                <td key={stunde} className="text-center">
                  {stunde % 6 === 0 ? stunde : ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export default function UebersichtPanel({
  imJournalOeffnen,
  auffaelligkeitenOeffnen,
}: {
  imJournalOeffnen: (filter: JournalFilter) => void;
  auffaelligkeitenOeffnen: () => void;
}) {
  const { t, i18n } = useTranslation("aktivitaet");
  const [tage, setTage] = useState<number>(30);
  const { data, isLoading, isError } = useUebersicht(tage);

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }
  const k = data.kacheln;
  const kachel = (schluessel: string, wert: number, filter?: JournalFilter, akzent = false) => {
    const inhalt = (
      <AnimatedKpiTile label={t(`uebersicht.kacheln.${schluessel}`)} value={wert} accent={akzent} />
    );
    return filter ? (
      <button
        key={schluessel}
        type="button"
        onClick={() => imJournalOeffnen(filter)}
        className="text-left"
        aria-label={t(`uebersicht.kacheln.${schluessel}`)}
      >
        {inhalt}
      </button>
    ) : (
      <div key={schluessel}>{inhalt}</div>
    );
  };

  return (
    <div className="space-y-4">
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
        <span className="text-xs text-text-tertiary">
          {t("uebersicht.aktiv", { h24: k.aktiv_24h, d7: k.aktiv_7d, d30: k.aktiv_30d })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kachel("logins", k.logins, { aktion: "login_success,login_2fa_success" })}
        {kachel("aktive_nutzer", k.aktive_nutzer)}
        {kachel("fehlversuche", k.fehlversuche, { aktion: "login_failed,login_2fa_failed" })}
        {kachel("sperren", k.sperren, { aktion: "login_locked_out" })}
        {kachel("registrierungen", k.registrierungen, { aktion: "register" })}
        {kachel("freigaben", k.freigaben, {
          aktion: "registration_approved,registration_refused",
        })}
        {kachel("rollenaenderungen", k.rollenaenderungen, { kategorie: "rollen" })}
        {kachel("geraete_limit", k.geraete_limit, { aktion: "device_limit_reached" })}
        <button
          type="button"
          onClick={auffaelligkeitenOeffnen}
          className="text-left"
          aria-label={t("uebersicht.kacheln.auffaelligkeiten_offen")}
        >
          <AnimatedKpiTile
            label={t("uebersicht.kacheln.auffaelligkeiten_offen")}
            value={k.auffaelligkeiten_offen}
            accent={k.auffaelligkeiten_offen > 0}
          />
        </button>
        {kachel("server_fehler", k.server_fehler, { kategorie: "betrieb" })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Verlauf daten={data.verlauf} />
        <Heatmap daten={data.heatmap} />
      </div>

      <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <h3 className="mb-2 text-xs font-medium text-text-primary">{t("uebersicht.top_ips")}</h3>
        {data.top_ips.length === 0 ? (
          <p className="text-xs text-text-tertiary">{t("uebersicht.keine_fehlversuche")}</p>
        ) : (
          <ul className="divide-y divide-text-tertiary/10 text-sm">
            {data.top_ips.map((z) => (
              <li key={z.ip} className="flex items-center justify-between gap-2 py-1.5">
                <span className="font-mono text-xs">{z.ip}</span>
                <span className="text-xs text-text-tertiary">
                  {t("uebersicht.versuche", { count: z.anzahl })} ·{" "}
                  {zeitpunkt(z.zuletzt, i18n.language)}
                </span>
                <button
                  type="button"
                  onClick={() => imJournalOeffnen({ ip: z.ip })}
                  className="text-xs font-medium text-ca"
                >
                  {t("uebersicht.im_journal")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <h3 className="mb-1 text-xs font-medium text-text-primary">{t("uebersicht.konten")}</h3>
        <p className="mb-2 text-xs text-text-tertiary">
          {t("uebersicht.konten_zahlen", {
            aktiv: data.konten.aktiv,
            inaktiv: data.konten.inaktiv_90d,
            nie: data.konten.nie_angemeldet,
          })}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-text-tertiary">
              <tr>
                <th className="py-1 pr-2 font-normal">{t("uebersicht.spalten.person")}</th>
                <th className="py-1 pr-2 font-normal">{t("uebersicht.spalten.rolle")}</th>
                <th className="py-1 pr-2 font-normal">{t("uebersicht.spalten.letzte")}</th>
                <th className="py-1 font-normal">{t("uebersicht.spalten.totp")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-text-tertiary/10">
              {data.privilegiert.map((u) => (
                <tr key={u.id}>
                  <td className="py-1.5 pr-2">
                    <div className="text-text-primary">{u.name}</div>
                    <div className="text-text-tertiary">{u.email}</div>
                  </td>
                  <td className="py-1.5 pr-2">{u.rolle}</td>
                  <td className="py-1.5 pr-2">{zeitpunkt(u.letzte_anmeldung, i18n.language)}</td>
                  <td className="py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 ${
                        u.totp
                          ? "bg-status-successBg text-status-successText"
                          : "bg-status-warningBg text-status-warningText"
                      }`}
                    >
                      {u.totp ? t("uebersicht.totp_ja") : t("uebersicht.totp_nein")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
