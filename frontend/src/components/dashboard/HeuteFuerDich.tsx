/**
 * „Heute für dich“ : eine einzige Liste mit dem, was für dich gerade offen ist (Abstimmung,
 * Tipp, Reise, Beitrag, Zahlung). Sie ersetzt die vielen einzelnen Hinweisleisten. Mit „Später“
 * blendest du einen Eintrag bis morgen aus; verschwinden tut er erst, wenn die Sache erledigt ist.
 */
import {
  IconCalendarEvent,
  IconCheck,
  IconChecklist,
  IconCreditCard,
  IconPlane,
  IconTrophy,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAufgaben } from "../../hooks/useAufgaben";
import { useAuthStore } from "../../store/authStore";
import type { AufgabeArt, AufgabeFarbe } from "../../utils/uebersicht";

const SYMBOL: Record<AufgabeArt, typeof IconCheck> = {
  abstimmung: IconChecklist,
  reise: IconPlane,
  beitrag: IconCreditCard,
  tipp: IconTrophy,
  anmeldung: IconCalendarEvent,
};

const FARBE: Record<AufgabeFarbe, string> = {
  red: "bg-status-dangerBg text-status-dangerText",
  amber: "bg-status-warningBg text-status-warningText",
  blue: "bg-status-infoBg text-status-infoText",
  green: "bg-status-successBg text-status-successText",
};

function heute(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Merkt sich pro Konto, was bis zu welchem Tag ausgeblendet ist. Nur im Browser. */
function ausgeblendetLesen(schluessel: string): Record<string, string> {
  try {
    const roh = window.localStorage.getItem(schluessel);
    return roh ? (JSON.parse(roh) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function ausgeblendetSchreiben(schluessel: string, wert: Record<string, string>) {
  try {
    window.localStorage.setItem(schluessel, JSON.stringify(wert));
  } catch {
    /* Speicher gesperrt : der Eintrag kommt beim nächsten Besuch wieder, das ist unkritisch. */
  }
}

export default function HeuteFuerDich() {
  const { t } = useTranslation("dashboard");
  const user = useAuthStore((s) => s.user);
  const { aufgaben, laedt } = useAufgaben();
  const speicher = `uebersicht:spaeter:${user?.id ?? "anonym"}`;
  const [spaeter, setSpaeter] = useState<Record<string, string>>(() => ausgeblendetLesen(speicher));

  const sichtbar = aufgaben.filter((a) => spaeter[a.id] !== heute());
  const verschieben = (id: string) => {
    const neu = { ...spaeter, [id]: heute() };
    setSpaeter(neu);
    ausgeblendetSchreiben(speicher, neu);
  };

  return (
    <section
      aria-label={t("uebersicht.heute.titel")}
      className="rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid="heute-fuer-dich"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {t("uebersicht.heute.titel")}
        </h2>
        {sichtbar.length > 0 && (
          <span className="rounded-full bg-status-infoBg px-2 py-0.5 text-[11px] font-bold text-status-infoText">
            {t("uebersicht.heute.offen", { count: sichtbar.length })}
          </span>
        )}
      </div>
      {sichtbar.length === 0 ? (
        !laedt && (
          <div className="py-3 text-center text-sm text-text-secondary">
            <IconCheck
              size={32}
              className="mx-auto mb-1 text-status-successText"
              aria-hidden="true"
            />
            <p className="font-semibold text-text-primary">
              {t("uebersicht.heute.alles_erledigt")}
            </p>
            <p>{t("uebersicht.heute.nichts_offen")}</p>
          </div>
        )
      ) : (
        <ul>
          {sichtbar.map((a) => {
            const Symbol = SYMBOL[a.art];
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 border-t border-bg-tertiary py-3 first:border-0 first:pt-0"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-cid ${FARBE[a.farbe]}`}
                >
                  <Symbol size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold text-text-primary">
                    {t(`uebersicht.aufgaben.${a.schluessel}.titel`, a.werte)}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {t(`uebersicht.aufgaben.${a.schluessel}.zeile`, a.werte)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={a.link}
                    className="inline-flex min-h-[36px] items-center rounded-cid bg-ca px-3 text-xs font-semibold text-white hover:bg-cad"
                  >
                    {t(`uebersicht.aufgaben.${a.schluessel}.knopf`)}
                  </Link>
                  <button
                    type="button"
                    onClick={() => verschieben(a.id)}
                    className="inline-flex min-h-[36px] items-center rounded-cid border border-bg-tertiary px-3 text-xs text-text-secondary hover:bg-bg-tertiary"
                  >
                    {t("uebersicht.heute.spaeter")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
