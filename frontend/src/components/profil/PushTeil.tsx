/**
 * Block „Push auf diesem Gerät“ unter Mein Profil › Einstellungen › Benachrichtigungen
 * (Release 2026.11). Kurze Hinweise (Titel und Link, nie der Inhalt) kommen als Push-Meldung aufs
 * Handy, auch wenn die App geschlossen ist. Der Block erscheint nur, wenn der Server Push
 * eingerichtet hat ; sonst bleibt er unsichtbar.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  getPush,
  pushAbmelden,
  pushAnmelden,
  pushKategorien,
  pushTest,
  type PushZustand,
} from "../../api/push";
import { extractApiErrorMessage } from "../../utils/apiError";
import { lokaleSprache } from "../../utils/datum";
import {
  aktuelleAnmeldung,
  alsAboDaten,
  anmeldungErzeugen,
  pushLage,
  type PushLage,
} from "../../utils/push";

const KEY = ["push"];
const KNOPF =
  "rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50";
const KNOPF_SEKUNDAER =
  "rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-50";

export default function PushTeil() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [lage, setLage] = useState<PushLage>(() => pushLage());
  const [dieserEndpoint, setDieserEndpoint] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);

  const { data } = useQuery({ queryKey: KEY, queryFn: getPush });

  // Welche Anmeldung hat dieses Gerät ? Nur lesen, nichts registrieren.
  useEffect(() => {
    let aktuell = true;
    aktuelleAnmeldung()
      .then((sub) => aktuell && setDieserEndpoint(sub?.endpoint ?? null))
      .catch(() => aktuell && setDieserEndpoint(null));
    return () => {
      aktuell = false;
    };
  }, []);

  const neuLaden = () => queryClient.invalidateQueries({ queryKey: KEY });
  const fehler = (err: unknown) =>
    setMeldung({
      art: "fehler",
      text: extractApiErrorMessage(err, t("einstellungen.push.fehler")),
    });

  const einschalten = useMutation({
    mutationFn: async (schluessel: string) => {
      const sub = await anmeldungErzeugen(schluessel);
      const zustand = await pushAnmelden(alsAboDaten(sub));
      return { sub, zustand };
    },
    onSuccess: ({ sub, zustand }) => {
      setMeldung(null);
      setDieserEndpoint(sub.endpoint);
      queryClient.setQueryData<PushZustand>(KEY, zustand);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "permission") {
        setLage(pushLage());
        setMeldung({ art: "fehler", text: t("einstellungen.push.erlaubnis_fehlt") });
        return;
      }
      fehler(err);
    },
  });

  const abmelden = useMutation({
    mutationFn: async (endpoint: string) => {
      await pushAbmelden(endpoint);
      if (endpoint === dieserEndpoint) {
        const sub = await aktuelleAnmeldung();
        await sub?.unsubscribe();
      }
      return endpoint;
    },
    onSuccess: (endpoint) => {
      setMeldung(null);
      if (endpoint === dieserEndpoint) setDieserEndpoint(null);
      return neuLaden();
    },
    onError: fehler,
  });

  const kategorien = useMutation({
    mutationFn: pushKategorien,
    onSuccess: (zustand) => queryClient.setQueryData<PushZustand>(KEY, zustand),
    onError: fehler,
  });

  const test = useMutation({
    mutationFn: pushTest,
    onSuccess: () => setMeldung({ art: "ok", text: t("einstellungen.push.test_gesendet") }),
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setMeldung({
        art: "fehler",
        text:
          status === 502
            ? t("einstellungen.push.test_nicht_zugestellt")
            : extractApiErrorMessage(err, t("einstellungen.push.fehler")),
      });
    },
  });

  if (!data?.aktiv) return null;

  const dieseAnmeldung = data.geraete.find((g) => g.endpoint === dieserEndpoint) ?? null;
  const weitere = data.geraete.filter((g) => g.endpoint !== dieserEndpoint);

  function umschalten(name: string) {
    if (!data) return;
    const neu = data.kategorien.includes(name)
      ? data.kategorien.filter((k) => k !== name)
      : [...data.kategorien, name];
    kategorien.mutate(neu);
  }

  return (
    <div className="flex flex-col gap-2 border-b border-text-tertiary/10 pb-4">
      <h3 className="text-sm font-semibold text-text-primary">{t("einstellungen.push.titel")}</h3>
      <p className="text-xs text-text-tertiary">{t("einstellungen.push.hinweis")}</p>

      {lage === "ios_installieren" && (
        <p className="text-sm text-text-secondary">{t("einstellungen.push.ios_installieren")}</p>
      )}
      {lage === "nicht_unterstuetzt" && (
        <p className="text-sm text-text-secondary">{t("einstellungen.push.nicht_unterstuetzt")}</p>
      )}
      {lage === "abgelehnt" && (
        <p className="text-sm text-text-secondary">{t("einstellungen.push.abgelehnt")}</p>
      )}

      {lage === "bereit" && !dieseAnmeldung && (
        <div>
          <button
            type="button"
            className={KNOPF}
            disabled={einschalten.isPending}
            onClick={() => einschalten.mutate(data.schluessel)}
          >
            {t("einstellungen.push.einschalten")}
          </button>
        </div>
      )}

      {dieseAnmeldung && (
        <>
          <p className="text-sm text-status-successText">{t("einstellungen.push.an")}</p>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold text-text-tertiary">
              {t("einstellungen.push.arten")}
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
              {t("einstellungen.push.test")}
            </button>
            <button
              type="button"
              className={KNOPF_SEKUNDAER}
              disabled={abmelden.isPending}
              onClick={() => abmelden.mutate(dieseAnmeldung.endpoint)}
            >
              {t("einstellungen.push.ausschalten")}
            </button>
          </div>
        </>
      )}

      {weitere.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-tertiary">
            {t("einstellungen.push.weitere_geraete")}
          </p>
          <ul className="flex flex-col gap-1">
            {weitere.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{g.geraet}</span>
                <span className="text-xs text-text-tertiary">
                  {t("einstellungen.push.angemeldet_am", {
                    datum: new Date(g.created_at).toLocaleDateString(lokaleSprache()),
                  })}
                </span>
                <button
                  type="button"
                  className="text-xs text-status-dangerText hover:underline disabled:opacity-50"
                  disabled={abmelden.isPending}
                  onClick={() => abmelden.mutate(g.endpoint)}
                >
                  {t("einstellungen.push.entfernen")}
                </button>
              </li>
            ))}
          </ul>
        </div>
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
