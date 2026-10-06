/**
 * Tab "Einstellungen" unter "Mein Profil" (Wunsch vom 2026-10-07: die bisherigen
 * "Einstellungen" aus dem Benutzermenü ziehen nach "Mein Profil" um und werden erweitert).
 * Abschnitte: Darstellung (Sprache, Hell/Dunkel, Seitenleiste — werden am Konto gespeichert und
 * bei jeder Anmeldung angewendet, siehe usePraeferenzenSync), Sicherheit (Passwort, Zwei-Faktor)
 * und Geräte & Sitzungen (höchstens 3 aktive Geräte, siehe apps.accounts.services).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  andereGeraeteAbmelden,
  confirmTotp,
  disableTotp,
  fetchGeraete,
  fetchTotpStatus,
  geraetAbmelden,
  passwortAendern,
  startTotpSetup,
  type TotpSetup,
} from "../../api/auth";
import { useUiStore } from "../../store/uiStore";
import { extractApiErrorMessage } from "../../utils/apiError";

const KARTE = "rounded-cid-lg bg-bg-primary p-4 shadow-sm";
const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-sm";
const KNOPF =
  "rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50";
const KNOPF_SEKUNDAER =
  "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50";

function Auswahl<T extends string>({
  wert,
  optionen,
  onWaehlen,
  label,
}: {
  wert: T;
  optionen: { wert: T; label: string }[];
  onWaehlen: (wert: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {optionen.map((o) => (
        <button
          key={o.wert}
          type="button"
          aria-pressed={wert === o.wert}
          onClick={() => onWaehlen(o.wert)}
          className={`rounded-cid px-3 py-1.5 text-sm font-medium ${
            wert === o.wert
              ? "bg-ca text-white"
              : "border border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DarstellungAbschnitt() {
  const { t, i18n } = useTranslation("common");
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const sprache = i18n.language?.toLowerCase().startsWith("de") ? "de" : "fr";

  return (
    <section className={KARTE}>
      <h2 className="text-sm font-bold text-text-primary">
        {t("einstellungen.darstellung.titel")}
      </h2>
      <p className="mb-3 text-xs text-text-tertiary">{t("einstellungen.darstellung.hinweis")}</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-secondary">{t("einstellungen.sprache")}</span>
          <Auswahl
            label={t("einstellungen.sprache")}
            wert={sprache}
            optionen={[
              { wert: "de", label: t("langue.allemand") },
              { wert: "fr", label: t("langue.francais") },
            ]}
            onWaehlen={(code) => void i18n.changeLanguage(code)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-secondary">{t("einstellungen.anzeigemodus")}</span>
          <Auswahl
            label={t("einstellungen.anzeigemodus")}
            wert={theme}
            optionen={[
              { wert: "light", label: t("einstellungen.hell") },
              { wert: "dark", label: t("einstellungen.dunkel") },
            ]}
            onWaehlen={setTheme}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-secondary">{t("einstellungen.seitenleiste")}</span>
          <Auswahl
            label={t("einstellungen.seitenleiste")}
            wert={sidebarCollapsed ? "klein" : "gross"}
            optionen={[
              { wert: "klein", label: t("einstellungen.seitenleiste_klein") },
              { wert: "gross", label: t("einstellungen.seitenleiste_gross") },
            ]}
            onWaehlen={(v) => setSidebarCollapsed(v === "klein")}
          />
        </div>
      </div>
    </section>
  );
}

function PasswortAbschnitt() {
  const { t } = useTranslation("common");
  const [aktuell, setAktuell] = useState("");
  const [neu, setNeu] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState(false);

  const aendern = useMutation({
    mutationFn: () => passwortAendern(aktuell, neu),
    onSuccess: () => {
      setErfolg(true);
      setAktuell("");
      setNeu("");
      setWiederholung("");
    },
    onError: (err) => setFehler(extractApiErrorMessage(err, t("einstellungen.passwort.fehler"))),
  });

  function absenden(e: FormEvent) {
    e.preventDefault();
    setErfolg(false);
    setFehler("");
    if (neu.length < 8) return setFehler(t("einstellungen.passwort.zu_kurz"));
    if (neu !== wiederholung) return setFehler(t("einstellungen.passwort.nicht_gleich"));
    aendern.mutate();
  }

  return (
    <section className={KARTE}>
      <h2 className="text-sm font-bold text-text-primary">{t("einstellungen.passwort.titel")}</h2>
      <form onSubmit={absenden} className="mt-3 flex max-w-sm flex-col gap-2">
        <input
          type="password"
          autoComplete="current-password"
          aria-label={t("einstellungen.passwort.aktuell")}
          placeholder={t("einstellungen.passwort.aktuell") ?? ""}
          value={aktuell}
          onChange={(e) => setAktuell(e.target.value)}
          className={FELD}
        />
        <input
          type="password"
          autoComplete="new-password"
          aria-label={t("einstellungen.passwort.neu")}
          placeholder={t("einstellungen.passwort.neu") ?? ""}
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
          className={FELD}
        />
        <input
          type="password"
          autoComplete="new-password"
          aria-label={t("einstellungen.passwort.wiederholung")}
          placeholder={t("einstellungen.passwort.wiederholung") ?? ""}
          value={wiederholung}
          onChange={(e) => setWiederholung(e.target.value)}
          className={FELD}
        />
        {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
        {erfolg && (
          <p className="text-xs text-status-successText">{t("einstellungen.passwort.erfolg")}</p>
        )}
        <div>
          <button type="submit" disabled={aendern.isPending || !aktuell || !neu} className={KNOPF}>
            {t("einstellungen.passwort.speichern")}
          </button>
        </div>
      </form>
    </section>
  );
}

function ZweiFaktorAbschnitt() {
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["totp-status"], queryFn: fetchTotpStatus });
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [fehler, setFehler] = useState("");

  const starten = useMutation({
    mutationFn: startTotpSetup,
    onSuccess: setSetup,
    onError: (err) => setFehler(extractApiErrorMessage(err, t("einstellungen.zwei_faktor.fehler"))),
  });
  const bestaetigen = useMutation({
    mutationFn: () => confirmTotp(code),
    onSuccess: () => {
      setSetup(null);
      setCode("");
      void qc.invalidateQueries({ queryKey: ["totp-status"] });
    },
    onError: (err) => setFehler(extractApiErrorMessage(err, t("einstellungen.zwei_faktor.fehler"))),
  });
  const deaktivieren = useMutation({
    mutationFn: disableTotp,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["totp-status"] }),
    onError: (err) => setFehler(extractApiErrorMessage(err, t("einstellungen.zwei_faktor.fehler"))),
  });

  const aktiv = status.data?.totp_enabled === true;

  return (
    <section className={KARTE}>
      <h2 className="text-sm font-bold text-text-primary">
        {t("einstellungen.zwei_faktor.titel")}
      </h2>
      <p className="mb-3 text-xs text-text-tertiary">{t("einstellungen.zwei_faktor.hinweis")}</p>
      {status.isLoading && <p className="text-sm text-text-tertiary">{t("einstellungen.laden")}</p>}
      {status.data && !setup && (
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              aktiv
                ? "bg-status-successBg text-status-successText"
                : "bg-bg-tertiary text-text-secondary"
            }`}
          >
            {aktiv ? t("einstellungen.zwei_faktor.aktiv") : t("einstellungen.zwei_faktor.inaktiv")}
          </span>
          {aktiv ? (
            <button
              type="button"
              disabled={deaktivieren.isPending}
              onClick={() => deaktivieren.mutate()}
              className={KNOPF_SEKUNDAER}
            >
              {t("einstellungen.zwei_faktor.deaktivieren")}
            </button>
          ) : (
            <button
              type="button"
              disabled={starten.isPending}
              onClick={() => {
                setFehler("");
                starten.mutate();
              }}
              className={KNOPF}
            >
              {t("einstellungen.zwei_faktor.aktivieren")}
            </button>
          )}
        </div>
      )}
      {setup && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-text-secondary">{t("einstellungen.zwei_faktor.scannen")}</p>
          <img
            alt={t("einstellungen.zwei_faktor.qr_alt") ?? ""}
            src={`data:image/png;base64,${setup.qr_code_base64}`}
            className="h-40 w-40 rounded-cid bg-white p-1"
          />
          <input
            inputMode="numeric"
            maxLength={6}
            aria-label={t("einstellungen.zwei_faktor.code")}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${FELD} max-w-[10rem]`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={bestaetigen.isPending || code.length !== 6}
              onClick={() => bestaetigen.mutate()}
              className={KNOPF}
            >
              {t("einstellungen.zwei_faktor.bestaetigen")}
            </button>
            <button type="button" onClick={() => setSetup(null)} className={KNOPF_SEKUNDAER}>
              {t("einstellungen.abbrechen")}
            </button>
          </div>
        </div>
      )}
      {fehler && <p className="mt-2 text-xs text-status-dangerText">{fehler}</p>}
    </section>
  );
}

function GeraeteAbschnitt() {
  const { t } = useTranslation("common");
  const qc = useQueryClient();
  const geraete = useQuery({ queryKey: ["geraete"], queryFn: fetchGeraete });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["geraete"] });
  const abmelden = useMutation({
    mutationFn: (id: string) => geraetAbmelden(id),
    onSuccess: refresh,
  });
  const alleAnderen = useMutation({
    mutationFn: () => andereGeraeteAbmelden(),
    onSuccess: refresh,
  });

  const liste = geraete.data?.results ?? [];
  const andere = liste.filter((g) => !g.is_current).length;

  return (
    <section className={KARTE}>
      <h2 className="text-sm font-bold text-text-primary">{t("einstellungen.geraete.titel")}</h2>
      <p className="mb-3 text-xs text-text-tertiary">
        {t("einstellungen.geraete.hinweis", { max: geraete.data?.max_devices ?? 3 })}
      </p>
      {geraete.isLoading && (
        <p className="text-sm text-text-tertiary">{t("einstellungen.laden")}</p>
      )}
      {geraete.isError && (
        <p className="text-sm text-status-dangerText">{t("einstellungen.geraete.fehler")}</p>
      )}
      {geraete.data && liste.length === 0 && (
        <p className="text-sm text-text-tertiary">{t("einstellungen.geraete.leer")}</p>
      )}
      <ul className="flex flex-col divide-y divide-text-tertiary/10">
        {liste.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {[g.browser, g.os].filter(Boolean).join(" · ") ||
                  t("einstellungen.geraete.unbekannt")}
                {g.is_current && (
                  <span className="ml-2 rounded-full bg-cal px-2 py-0.5 text-[10px] font-semibold text-ca">
                    {t("einstellungen.geraete.dieses")}
                  </span>
                )}
              </p>
              <p className="text-xs text-text-tertiary">
                {t("einstellungen.geraete.zuletzt", {
                  datum: new Date(g.last_seen_at).toLocaleString(),
                })}
                {g.ip_address ? ` · ${g.ip_address}` : ""}
              </p>
            </div>
            {!g.is_current && (
              <button
                type="button"
                disabled={abmelden.isPending}
                onClick={() => abmelden.mutate(g.id)}
                className={KNOPF_SEKUNDAER}
              >
                {t("einstellungen.geraete.abmelden")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {andere > 0 && (
        <button
          type="button"
          disabled={alleAnderen.isPending}
          onClick={() => alleAnderen.mutate()}
          className={`${KNOPF_SEKUNDAER} mt-3`}
        >
          {t("einstellungen.geraete.alle_anderen")}
        </button>
      )}
    </section>
  );
}

export default function EinstellungenTab() {
  return (
    <div className="flex flex-col gap-4">
      <DarstellungAbschnitt />
      <PasswortAbschnitt />
      <ZweiFaktorAbschnitt />
      <GeraeteAbschnitt />
    </div>
  );
}
