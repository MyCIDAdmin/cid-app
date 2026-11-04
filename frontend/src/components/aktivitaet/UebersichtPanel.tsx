/**
 * Aktivität — Cockpit (Release 20, als Startansicht der eigenen Seite umgebaut) : Sicherheitslage
 * mit Wert, „Jetzt zu tun“-Liste mit Schnellaktionen, Kacheln mit Vergleich zur Vorperiode,
 * Verlauf, Heatmap der Anmeldezeiten, auffällige IP-Adressen, Konten mit erweiterten Rechten
 * (mit Erinnerung an die Authenticator-App), Nutzung je Modul und der Live-Verlauf „Gerade
 * passiert“. Nur für den App-Admin.
 */
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  useBerichtErzeugen,
  useBerichtSenden,
  useJournalLive,
  useNutzung,
  useTotpErinnerung,
  useUebersicht,
} from "../../hooks/useAktivitaet";
import type {
  Ansicht,
  JournalFilter,
  Kacheln,
  Lage,
  LageFaktor,
  Uebersicht,
  Vorperiode,
} from "../../types/aktivitaet";
import { rollenText, textIn, zeitpunkt } from "../../utils/aktivitaet";
import AnimatedKpiTile from "../stats/AnimatedKpiTile";

const ZEITRAEUME = [7, 30, 90] as const;
const WOCHENTAGE = ["mo", "di", "mi", "do", "fr", "sa", "so"] as const;
const REGELN = [
  "bruteforce",
  "angriff_erfolg",
  "export_haeufung",
  "massen_loeschung",
  "neuer_app_admin",
  "abschluss_geoeffnet",
  "totp_deaktiviert",
  "server_fehler",
  "review_offen",
  "task_fehler",
] as const;
/** Kennzahlen, bei denen ein Anstieg ein Warnzeichen ist (rot hervorgehoben). */
const ANSTIEG_IST_SCHLECHT: ReadonlySet<keyof Vorperiode> = new Set([
  "fehlversuche",
  "sperren",
  "geraete_limit",
  "server_fehler",
]);
const FAKTOREN: LageFaktor[] = ["totp", "auffaelligkeiten", "review"];

/** Mindestanzahl Tage, die der Verlauf zeigt, auch wenn der Anfang des Zeitraums leer ist. */
const MIN_TAGE_VERLAUF = 14;

function Verlauf({ daten: alleTage }: { daten: Uebersicht["verlauf"] }) {
  const { t } = useTranslation("aktivitaet");
  // Tage vor dem ersten Ereignis weglassen: sonst bleibt links ein leerer Streifen.
  const ersterMitDaten = alleTage.findIndex((d) => d.logins + d.fehlversuche > 0);
  const start =
    ersterMitDaten < 0
      ? 0
      : Math.min(ersterMitDaten, Math.max(0, alleTage.length - MIN_TAGE_VERLAUF));
  const daten = alleTage.slice(start);
  const maximum = Math.max(1, ...daten.map((d) => d.logins + d.fehlversuche));
  const breite = 100 / daten.length;
  return (
    <figure className="flex h-full flex-col rounded-cid-lg bg-bg-primary p-3 shadow-sm">
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
        className="h-44 w-full"
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
      <div className="mt-1 flex justify-between text-[10px] text-text-tertiary">
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
    <figure className="flex h-full flex-col rounded-cid-lg bg-bg-primary p-3 shadow-sm">
      <figcaption className="mb-2 text-xs font-medium text-text-primary">
        {t("uebersicht.heatmap")}
      </figcaption>
      {/* Spalten teilen die ganze Kachelbreite; die Zeilen wachsen mit der Kachelhöhe. */}
      <div
        className="grid h-44 gap-0.5 text-[10px] text-text-tertiary"
        style={{
          gridTemplateColumns: "1.5rem repeat(24, minmax(0, 1fr))",
          gridTemplateRows: "repeat(7, minmax(0.75rem, 1fr)) auto",
        }}
      >
        {daten.map((zeile, wochentag) => (
          <Fragment key={WOCHENTAGE[wochentag]}>
            <span className="flex items-center justify-end pr-1">
              {t(`uebersicht.tage_kurz.${WOCHENTAGE[wochentag]}`)}
            </span>
            {zeile.map((n, stunde) => (
              <span
                key={stunde}
                title={`${t(`uebersicht.tage_kurz.${WOCHENTAGE[wochentag]}`)} ${stunde}:00 – ${n}`}
                className="rounded-sm"
                style={{
                  background: "var(--color-status-successText)",
                  opacity: n === 0 ? 0.08 : 0.2 + 0.8 * (n / maximum),
                }}
              />
            ))}
          </Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, stunde) => (
          <span key={stunde} className="relative h-3">
            {stunde % 6 === 0 && <span className="absolute left-0 top-0">{stunde}</span>}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Ring mit dem Sicherheitswert und drei Fortschrittsbalken (je Faktor). */
function LageKarte({ lage }: { lage: Lage }) {
  const { t } = useTranslation("aktivitaet");
  const farbe =
    lage.stufe === "gut"
      ? "var(--color-status-successText)"
      : lage.stufe === "achtung"
        ? "var(--color-status-warningText)"
        : "var(--color-status-dangerText)";
  return (
    <section
      aria-labelledby="cockpit-lage"
      className="flex flex-col gap-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-4">
        <div
          role="img"
          aria-label={t("cockpit.lage.wert_aria", { wert: lage.wert })}
          className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${farbe} 0 ${lage.wert}%, rgba(0,0,0,0.08) 0)` }}
        >
          <div className="flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full bg-bg-primary">
            <span className="text-3xl font-bold leading-none tabular-nums text-text-primary">
              {lage.wert}
            </span>
            <span className="text-[11px] text-text-tertiary">{t("cockpit.lage.von_100")}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1" style={{ minWidth: "12rem" }}>
          <h3
            id="cockpit-lage"
            className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary"
          >
            {t("cockpit.lage.titel")}
          </h3>
          <p className="text-lg font-semibold text-text-primary">
            {t(`cockpit.lage.stufe.${lage.stufe}`)}
          </p>
          <p className="text-xs text-text-secondary">{t("cockpit.lage.erklaerung")}</p>
        </div>
      </div>
      <div className="space-y-3">
        {FAKTOREN.map((f) => {
          const { ist, soll } = lage.faktoren[f];
          const anteil = soll === 0 ? 100 : Math.round((ist / soll) * 100);
          return (
            <div key={f}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-text-secondary">{t(`cockpit.lage.faktoren.${f}`)}</span>
                <span className="font-medium tabular-nums text-text-primary">
                  {soll === 0
                    ? t(`cockpit.lage.leer.${f}`)
                    : t("cockpit.lage.faktor_zahl", { ist, soll })}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t(`cockpit.lage.faktoren.${f}`)}
                aria-valuenow={anteil}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-1 h-2 rounded-full bg-text-tertiary/15"
              >
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${anteil}%`,
                    background:
                      anteil >= 90
                        ? "var(--color-status-successText)"
                        : anteil >= 50
                          ? "var(--color-status-warningText)"
                          : "var(--color-status-dangerText)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface Aufgabe {
  key: string;
  ton: "danger" | "warning" | "info";
  titel: string;
  text: string;
  knopf: string;
  aktion: () => void;
  beschaeftigt?: boolean;
}

export default function UebersichtPanel({
  imJournalOeffnen,
  ansichtOeffnen,
}: {
  imJournalOeffnen: (filter: JournalFilter) => void;
  ansichtOeffnen: (ansicht: Ansicht) => void;
}) {
  const { t, i18n } = useTranslation(["aktivitaet", "utilisateurs"]);
  const [tage, setTage] = useState<number>(30);
  const [alarmOffen, setAlarmOffen] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  const { data, isLoading, isError } = useUebersicht(tage);
  const nutzung = useNutzung(tage);
  const live = useJournalLive();
  const erinnerung = useTotpErinnerung();
  const berichtErzeugen = useBerichtErzeugen();
  const berichtSenden = useBerichtSenden();

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }
  const k = data.kacheln;
  const lage = data.lage;
  const rolle = (roh: string) => rollenText(roh, (key, opts) => t(key as never, opts as never));

  function erinnern(user?: string) {
    setMeldung(null);
    erinnerung.mutate(user, {
      onSuccess: (r) =>
        setMeldung({
          fehler: false,
          text: r.mail_aus
            ? t("cockpit.erinnerung.mail_aus")
            : r.gesendet > 0
              ? t("cockpit.erinnerung.gesendet", { count: r.gesendet })
              : t("cockpit.erinnerung.keine"),
        }),
      onError: () => setMeldung({ fehler: true, text: t("cockpit.erinnerung.fehler") }),
    });
  }

  async function berichtAnMichSenden() {
    setMeldung(null);
    const { jahr, monat } = lage.bericht;
    const bezeichnung = `${String(monat).padStart(2, "0")}/${jahr}`;
    try {
      if (!lage.bericht.erstellt) await berichtErzeugen.mutateAsync({ jahr, monat });
      await berichtSenden.mutateAsync({ jahr, monat });
      setMeldung({ fehler: false, text: t("cockpit.bericht.gesendet", { monat: bezeichnung }) });
    } catch {
      setMeldung({ fehler: true, text: t("cockpit.bericht.fehler") });
    }
  }

  const delta = (schluessel: keyof Vorperiode) => {
    const d = k[schluessel] - data.vorperiode[schluessel];
    const text =
      d === 0
        ? t("cockpit.vergleich.gleich")
        : d > 0
          ? t("cockpit.vergleich.plus", { n: d.toLocaleString("de-DE") })
          : t("cockpit.vergleich.minus", { n: Math.abs(d).toLocaleString("de-DE") });
    return {
      hint: text,
      hintTone:
        d > 0 && ANSTIEG_IST_SCHLECHT.has(schluessel) ? ("danger" as const) : ("neutral" as const),
    };
  };

  const kachel = (
    schluessel: keyof Kacheln & keyof Vorperiode,
    filter?: JournalFilter,
    akzent = false,
  ) => {
    const inhalt = (
      <AnimatedKpiTile
        label={t(`uebersicht.kacheln.${schluessel}`)}
        value={k[schluessel]}
        accent={akzent}
        {...delta(schluessel)}
      />
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

  const aufgaben: Aufgabe[] = [];
  if (k.auffaelligkeiten_offen > 0) {
    aufgaben.push({
      key: "auffaelligkeiten",
      ton: "danger",
      titel: t("cockpit.aufgaben.auffaelligkeiten_titel", { count: k.auffaelligkeiten_offen }),
      text: t("cockpit.aufgaben.auffaelligkeiten_text"),
      knopf: t("cockpit.aufgaben.pruefen"),
      aktion: () => ansichtOeffnen("auffaelligkeiten"),
    });
  }
  if (lage.ohne_totp > 0) {
    aufgaben.push({
      key: "totp",
      ton: "danger",
      titel: t("cockpit.aufgaben.totp_titel", { count: lage.ohne_totp }),
      text: t("cockpit.aufgaben.totp_text"),
      knopf: t("cockpit.aufgaben.alle_erinnern"),
      aktion: () => erinnern(),
      beschaeftigt: erinnerung.isPending,
    });
  }
  if (lage.review && lage.review.status === "offen") {
    aufgaben.push({
      key: "review",
      ton: "warning",
      titel: t("cockpit.aufgaben.review_titel", {
        quartal: lage.review.quartal,
        offen: lage.review.anzahl - lage.review.entschieden,
      }),
      text: t("cockpit.aufgaben.review_text"),
      knopf: t("cockpit.aufgaben.fortsetzen"),
      aktion: () => ansichtOeffnen("review"),
    });
  }
  if (lage.bericht.erstellt && !lage.bericht.versendet) {
    aufgaben.push({
      key: "bericht",
      ton: "info",
      titel: t("cockpit.aufgaben.bericht_titel", {
        monat: `${String(lage.bericht.monat).padStart(2, "0")}/${lage.bericht.jahr}`,
      }),
      text: t("cockpit.aufgaben.bericht_text"),
      knopf: t("cockpit.aufgaben.oeffnen"),
      aktion: () => ansichtOeffnen("berichte"),
    });
  }
  const tonFarbe = {
    danger: "var(--color-status-dangerText)",
    warning: "var(--color-status-warningText)",
    info: "var(--color-status-infoText, #2a78d6)",
  } as const;
  const maxNutzer = Math.max(1, ...(nutzung.data?.module ?? []).map((m) => m.nutzer));

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
        <span className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            aria-expanded={alarmOffen}
            onClick={() => setAlarmOffen((v) => !v)}
            className="rounded-cid-lg border border-text-tertiary/30 px-3 py-1 text-xs font-medium text-text-secondary"
          >
            {t("cockpit.alarmregeln.knopf")}
          </button>
          <button
            type="button"
            onClick={() => void berichtAnMichSenden()}
            disabled={berichtErzeugen.isPending || berichtSenden.isPending}
            className="rounded-cid-lg bg-ca px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {t("cockpit.bericht.knopf")}
          </button>
        </span>
      </div>

      {meldung && (
        <p
          role="status"
          className={`rounded-cid-lg px-3 py-2 text-xs ${
            meldung.fehler
              ? "bg-status-dangerBg text-status-dangerText"
              : "bg-status-successBg text-status-successText"
          }`}
        >
          {meldung.text}
        </p>
      )}

      {alarmOffen && (
        <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-text-primary">
            {t("cockpit.alarmregeln.titel")}
          </h3>
          <p className="mb-2 text-xs text-text-tertiary">{t("cockpit.alarmregeln.hinweis")}</p>
          <ul className="grid gap-1 text-xs text-text-secondary sm:grid-cols-2">
            {REGELN.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{t(`cockpit.alarmregeln.regeln.${r}`)}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/admin/notifications"
            className="mt-2 inline-block text-xs font-medium text-ca hover:underline"
          >
            {t("cockpit.alarmregeln.mail_einstellung")}
          </Link>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <LageKarte lage={lage} />
        <section
          aria-labelledby="cockpit-aufgaben"
          className="rounded-cid-lg bg-bg-primary p-4 shadow-sm"
        >
          <div className="mb-1 flex items-baseline justify-between">
            <h3 id="cockpit-aufgaben" className="text-sm font-semibold text-text-primary">
              {t("cockpit.aufgaben.titel")}
            </h3>
            <span className="text-xs text-text-tertiary">
              {t("cockpit.aufgaben.anzahl", { count: aufgaben.length })}
            </span>
          </div>
          {aufgaben.length === 0 ? (
            <p className="py-6 text-center text-sm text-status-successText">
              {t("cockpit.aufgaben.keine")}
            </p>
          ) : (
            <ul className="divide-y divide-text-tertiary/10">
              {aufgaben.map((a) => (
                <li key={a.key} className="flex flex-wrap items-center gap-3 py-3">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: tonFarbe[a.ton] }}
                  />
                  <div className="min-w-0 flex-1" style={{ minWidth: "12rem" }}>
                    <div className="text-sm font-medium text-text-primary">{a.titel}</div>
                    <div className="text-xs text-text-secondary">{a.text}</div>
                  </div>
                  <button
                    type="button"
                    onClick={a.aktion}
                    disabled={a.beschaeftigt}
                    className="rounded-cid-lg border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-primary disabled:opacity-50"
                  >
                    {a.knopf}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {kachel("logins", { aktion: "login_success,login_2fa_success" })}
        {kachel("aktive_nutzer")}
        {kachel("fehlversuche", { aktion: "login_failed,login_2fa_failed" })}
        {kachel("sperren", { aktion: "login_locked_out" })}
        {kachel("registrierungen", { aktion: "register" })}
        {kachel("freigaben", { aktion: "registration_approved,registration_refused" })}
        {kachel("rollenaenderungen", { kategorie: "rollen" })}
        {kachel("geraete_limit", { aktion: "device_limit_reached" })}
        <button
          type="button"
          onClick={() => ansichtOeffnen("auffaelligkeiten")}
          className="text-left"
          aria-label={t("uebersicht.kacheln.auffaelligkeiten_offen")}
        >
          <AnimatedKpiTile
            label={t("uebersicht.kacheln.auffaelligkeiten_offen")}
            value={k.auffaelligkeiten_offen}
            accent={k.auffaelligkeiten_offen > 0}
            hint={t("cockpit.vergleich.stand_heute")}
          />
        </button>
        {kachel("server_fehler", { kategorie: "betrieb" })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Verlauf daten={data.verlauf} />
        <Heatmap daten={data.heatmap} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
          <h3 className="mb-2 text-xs font-medium text-text-primary">{t("uebersicht.top_ips")}</h3>
          {data.top_ips.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t("uebersicht.keine_fehlversuche")}</p>
          ) : (
            <ul className="divide-y divide-text-tertiary/10 text-sm">
              {data.top_ips.map((z) => (
                <li key={z.ip} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
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
                    <td className="py-1.5 pr-2">{rolle(u.rolle)}</td>
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
                      {!u.totp && (
                        <button
                          type="button"
                          onClick={() => erinnern(u.id)}
                          disabled={erinnerung.isPending}
                          aria-label={t("cockpit.erinnerung.einzeln_aria", { name: u.name })}
                          className="ml-2 rounded-cid border border-text-tertiary/30 px-2 py-0.5 text-[11px] text-text-secondary disabled:opacity-50"
                        >
                          {t("cockpit.erinnerung.einzeln")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lage.ohne_totp > 0 && (
            <p className="mt-2 text-[11px] text-text-tertiary">{t("cockpit.erinnerung.hinweis")}</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            {t("cockpit.module.titel")}
          </h3>
          {nutzung.isLoading ? (
            <p className="text-xs text-text-tertiary">{t("chargement")}</p>
          ) : (
            <ul className="space-y-2">
              {(nutzung.data?.module ?? [])
                .filter((m) => m.nutzer > 0)
                .map((m) => (
                  <li key={m.modul} className="flex items-center gap-3 text-xs">
                    <span className="w-32 shrink-0 truncate text-text-secondary">
                      {textIn(i18n.language, m.label)}
                    </span>
                    <span className="h-3 flex-1 rounded-full bg-text-tertiary/15">
                      <span
                        className="block h-3 rounded-full bg-ca"
                        style={{ width: `${Math.max(4, (m.nutzer / maxNutzer) * 100)}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right text-text-tertiary">
                      {t("cockpit.module.personen", { count: m.nutzer })}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          {nutzung.data && nutzung.data.ungenutzt.length > 0 && (
            <p className="mt-3 text-xs text-text-tertiary">
              {t("cockpit.module.ungenutzt")}{" "}
              {nutzung.data.module
                .filter((m) => nutzung.data?.ungenutzt.includes(m.modul))
                .map((m) => textIn(i18n.language, m.label))
                .join(", ")}
            </p>
          )}
          <button
            type="button"
            onClick={() => ansichtOeffnen("nutzung")}
            className="mt-2 text-xs font-medium text-ca"
          >
            {t("cockpit.module.alle")}
          </button>
        </section>

        <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">{t("cockpit.feed.titel")}</h3>
            <span className="rounded-full bg-status-successBg px-2 py-0.5 text-[11px] text-status-successText">
              {t("cockpit.feed.live")}
            </span>
          </div>
          {live.data && live.data.ergebnisse.length > 0 ? (
            <ul className="mt-2 divide-y divide-text-tertiary/10 text-xs">
              {live.data.ergebnisse.slice(0, 6).map((e) => (
                <li key={e.id} className="flex gap-3 py-2">
                  <span className="w-12 shrink-0 text-text-tertiary">
                    {new Date(e.zeit).toLocaleTimeString(
                      i18n.language.startsWith("fr") ? "fr-FR" : "de-DE",
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                  <span className="min-w-0 text-text-primary">
                    {textIn(i18n.language, e.label)}
                    {e.user ? ` · ${e.user.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-text-tertiary">{t("cockpit.feed.leer")}</p>
          )}
          <button
            type="button"
            onClick={() => ansichtOeffnen("journal")}
            className="mt-2 text-xs font-medium text-ca"
          >
            {t("cockpit.feed.alles")}
          </button>
        </section>
      </div>
    </div>
  );
}
