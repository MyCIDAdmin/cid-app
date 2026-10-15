/**
 * Abschnitt „Benachrichtigungen“ unter Mein Profil › Einstellungen (Release 32) :
 * Telegram verbinden (einmaliger Link in den Bot), Arten wählen, Testnachricht, Trennen, und der
 * Schalter für den Geburtstagsgruß per E-Mail. Der Telegram-Teil erscheint nur, wenn der Bot auf
 * dem Server eingerichtet ist.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { speicherePraeferenzen } from "../../api/auth";
import {
  getTelegram,
  telegramKategorien,
  telegramTest,
  telegramTrennen,
  telegramVerbinden,
} from "../../api/telegram";
import { useAuthStore } from "../../store/authStore";
import { extractApiErrorMessage } from "../../utils/apiError";

const KEY = ["telegram"];
const KARTE = "rounded-cid-lg bg-bg-primary p-4 shadow-sm";
const KNOPF =
  "rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50";
const KNOPF_SEKUNDAER =
  "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50";

function TelegramTeil() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: getTelegram,
    // Solange der Link offen ist, alle 3 Sekunden prüfen, ob die Verbindung bestätigt wurde.
    refetchInterval: (query) => (link && !query.state.data?.verbunden ? 3000 : false),
  });
  const neuLaden = () => queryClient.invalidateQueries({ queryKey: KEY });
  const fehler = (err: unknown) =>
    setMeldung({
      art: "fehler",
      text: extractApiErrorMessage(err, t("einstellungen.telegram.fehler")),
    });

  const verbinden = useMutation({
    mutationFn: telegramVerbinden,
    onSuccess: (r) => {
      setMeldung(null);
      setLink(r.link);
    },
    onError: fehler,
  });
  const kategorien = useMutation({
    mutationFn: telegramKategorien,
    onSuccess: neuLaden,
    onError: fehler,
  });
  const trennen = useMutation({
    mutationFn: telegramTrennen,
    onSuccess: () => {
      setLink(null);
      setMeldung(null);
      return neuLaden();
    },
    onError: fehler,
  });
  const test = useMutation({
    mutationFn: telegramTest,
    onSuccess: () => setMeldung({ art: "ok", text: t("einstellungen.telegram.test_gesendet") }),
    onError: fehler,
  });

  if (!data?.aktiv) return null;

  function umschalten(name: string) {
    if (!data) return;
    const neu = data.kategorien.includes(name)
      ? data.kategorien.filter((k) => k !== name)
      : [...data.kategorien, name];
    kategorien.mutate(neu);
  }

  return (
    <div className="flex flex-col gap-2 border-b border-text-tertiary/10 pb-4">
      <h3 className="text-sm font-semibold text-text-primary">
        {t("einstellungen.telegram.titel")}
      </h3>
      <p className="text-xs text-text-tertiary">{t("einstellungen.telegram.hinweis")}</p>

      {!data.verbunden && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={KNOPF}
            disabled={verbinden.isPending}
            onClick={() => verbinden.mutate()}
          >
            {t("einstellungen.telegram.verbinden")}
          </button>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-ca hover:underline"
            >
              {t("einstellungen.telegram.oeffnen")}
            </a>
          )}
        </div>
      )}
      {!data.verbunden && link && (
        <p className="text-xs text-text-tertiary">{t("einstellungen.telegram.warten")}</p>
      )}

      {data.verbunden && (
        <>
          <p className="text-sm text-status-successText">{t("einstellungen.telegram.verbunden")}</p>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold text-text-tertiary">
              {t("einstellungen.telegram.arten")}
            </legend>
            {data.verfuegbar.map((name) => (
              <label key={name} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data.kategorien.includes(name)}
                  disabled={kategorien.isPending}
                  onChange={() => umschalten(name)}
                />
                <span>{t(`einstellungen.telegram.art.${name}`)}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={KNOPF_SEKUNDAER}
              disabled={test.isPending}
              onClick={() => test.mutate()}
            >
              {t("einstellungen.telegram.test")}
            </button>
            <button
              type="button"
              className={KNOPF_SEKUNDAER}
              disabled={trennen.isPending}
              onClick={() => trennen.mutate()}
            >
              {t("einstellungen.telegram.trennen")}
            </button>
          </div>
        </>
      )}

      {meldung && (
        <p
          role={meldung.art === "fehler" ? "alert" : "status"}
          className={`text-xs ${
            meldung.art === "fehler" ? "text-status-dangerText" : "text-status-successText"
          }`}
        >
          {meldung.text}
        </p>
      )}
    </div>
  );
}

function GeburtstagTeil() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(false);
  // Nur Mitglieder haben ein Geburtsdatum in der App ; Fan-Konten sehen den Schalter nicht.
  if (!user || user.ist_fan) return null;
  const an = user.ui_praeferenzen?.geburtstagsgruss !== false;

  async function umschalten() {
    setLaeuft(true);
    setFehler(false);
    try {
      setUser(await speicherePraeferenzen({ ui_praeferenzen: { geburtstagsgruss: !an } }));
    } catch {
      setFehler(true);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={an} disabled={laeuft} onChange={umschalten} />
        <span>{t("einstellungen.geburtstag.titel")}</span>
      </label>
      <p className="text-xs text-text-tertiary">{t("einstellungen.geburtstag.hinweis")}</p>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {t("einstellungen.geburtstag.fehler")}
        </p>
      )}
    </div>
  );
}

export default function BenachrichtigungenAbschnitt() {
  const { t } = useTranslation("common");
  return (
    <section className={`${KARTE} flex flex-col gap-4`}>
      <h2 className="text-sm font-bold text-text-primary">
        {t("einstellungen.benachrichtigungen.titel")}
      </h2>
      <TelegramTeil />
      <GeburtstagTeil />
    </section>
  );
}
