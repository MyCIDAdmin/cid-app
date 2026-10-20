/**
 * Zentrale Einstellungen (2026-10-20) — App-Administrator ändert hier Werte, die sonst im Code
 * stünden: Dauer der Warenkorb-Reservierung u. a. Backend: ZentraleEinstellungenPermission
 * (Lesen: angemeldet, Ändern: nur super_admin) ; die Route ist ebenfalls auf super_admin begrenzt.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAendereZentraleEinstellungen, useZentraleEinstellungen } from "../../hooks/useZentral";
import type { ZentraleEinstellungen } from "../../types/zentral";
import { extractApiErrorMessage } from "../../utils/apiError";

type FeldSchluessel =
  | "warenkorb_reservierung_minuten"
  | "warenkorb_max_erneuerungen"
  | "event_zahlungsfrist_tage"
  | "hinweis_tage_vorher"
  | "hinweis_plaetze_absolut"
  | "hinweis_plaetze_prozent"
  | "hinweis_lager_menge"
  | "hinweis_max_anzahl";

interface FeldDefinition {
  schluessel: FeldSchluessel;
  min: number;
  max: number;
}

interface Gruppe {
  schluessel: string;
  felder: FeldDefinition[];
}

// Grenzen spiegeln die Validatoren im Backend (models.ZentraleEinstellungen).
const GRUPPEN: Gruppe[] = [
  {
    schluessel: "shop",
    felder: [
      { schluessel: "warenkorb_reservierung_minuten", min: 1, max: 1440 },
      { schluessel: "warenkorb_max_erneuerungen", min: 0, max: 10 },
    ],
  },
  {
    schluessel: "events",
    felder: [{ schluessel: "event_zahlungsfrist_tage", min: 1, max: 30 }],
  },
  {
    schluessel: "hinweise",
    felder: [
      { schluessel: "hinweis_tage_vorher", min: 1, max: 60 },
      { schluessel: "hinweis_plaetze_absolut", min: 1, max: 100 },
      { schluessel: "hinweis_plaetze_prozent", min: 1, max: 100 },
      { schluessel: "hinweis_lager_menge", min: 1, max: 100 },
      { schluessel: "hinweis_max_anzahl", min: 1, max: 10 },
    ],
  },
];

type Entwurf = Record<FeldSchluessel, string>;

function zuEntwurf(daten: ZentraleEinstellungen): Entwurf {
  return {
    warenkorb_reservierung_minuten: String(daten.warenkorb_reservierung_minuten),
    warenkorb_max_erneuerungen: String(daten.warenkorb_max_erneuerungen),
    event_zahlungsfrist_tage: String(daten.event_zahlungsfrist_tage),
    hinweis_tage_vorher: String(daten.hinweis_tage_vorher),
    hinweis_plaetze_absolut: String(daten.hinweis_plaetze_absolut),
    hinweis_plaetze_prozent: String(daten.hinweis_plaetze_prozent),
    hinweis_lager_menge: String(daten.hinweis_lager_menge),
    hinweis_max_anzahl: String(daten.hinweis_max_anzahl),
  };
}

export default function ZentraleEinstellungenPage() {
  const { t } = useTranslation("zentral");
  const { data, isLoading, isError } = useZentraleEinstellungen();
  const speichern = useAendereZentraleEinstellungen();
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    if (data) setEntwurf(zuEntwurf(data));
  }, [data]);

  const alleFelder = GRUPPEN.flatMap((g) => g.felder);
  const gueltig =
    entwurf !== null &&
    alleFelder.every((f) => {
      const wert = Number(entwurf[f.schluessel]);
      return Number.isInteger(wert) && wert >= f.min && wert <= f.max;
    });

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (!entwurf || !gueltig) return;
    setGespeichert(false);
    const payload = Object.fromEntries(
      alleFelder.map((f) => [f.schluessel, Number(entwurf[f.schluessel])]),
    );
    speichern.mutate(payload, { onSuccess: () => setGespeichert(true) });
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("titel")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("beschreibung")}</p>

      {isLoading && <p className="text-sm text-text-tertiary">{t("laedt")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}

      {entwurf && (
        <form onSubmit={absenden} className="space-y-5">
          {GRUPPEN.map((gruppe) => (
            <section key={gruppe.schluessel} className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-text-primary">
                {t(`gruppe.${gruppe.schluessel}`)}
              </h2>
              <div className="space-y-4">
                {gruppe.felder.map((feld) => (
                  <div key={feld.schluessel}>
                    <label
                      htmlFor={`zentral-${feld.schluessel}`}
                      className="mb-1 block text-sm font-medium text-text-primary"
                    >
                      {t(`feld.${feld.schluessel}.label`)}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`zentral-${feld.schluessel}`}
                        type="number"
                        inputMode="numeric"
                        min={feld.min}
                        max={feld.max}
                        value={entwurf[feld.schluessel]}
                        onChange={(e) => {
                          setGespeichert(false);
                          setEntwurf({
                            ...entwurf,
                            [feld.schluessel]: e.target.value,
                          });
                        }}
                        className="w-28 rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-sm text-text-primary"
                      />
                      <span className="text-sm text-text-secondary">
                        {t(`feld.${feld.schluessel}.einheit`)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {t(`feld.${feld.schluessel}.hilfe`, {
                        min: feld.min,
                        max: feld.max,
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {speichern.isError && (
            <p className="text-sm text-status-dangerText">
              {extractApiErrorMessage(speichern.error, t("fehler_speichern"))}
            </p>
          )}
          {gespeichert && (
            <p role="status" className="text-sm text-status-successText">
              {t("gespeichert")}
            </p>
          )}

          <button
            type="submit"
            disabled={!gueltig || speichern.isPending}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("speichern")}
          </button>
        </form>
      )}
    </div>
  );
}
