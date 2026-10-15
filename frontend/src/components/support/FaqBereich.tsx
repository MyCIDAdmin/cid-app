/**
 * Hilfe und häufige Fragen (Release 33) : Suche über die vom Büro gepflegten Fragen und eine
 * Auswahl der Anleitungen aus dem Hilfe-Button (nur Themen, die für alle Konten gelten).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useFaq } from "../../hooks/useSupport";
import type { FaqEintrag } from "../../types/support";
import { FELD, istFranzoesisch } from "./gemeinsam";

/** Schlüssel in help.json, die für jedes angemeldete Konto sinnvoll sind. */
export const ANLEITUNGEN = ["regionen", "regionen_wettbewerb"] as const;

function Absaetze({ text }: { text: string }) {
  return (
    <>
      {text
        .split("\n")
        .filter((z) => z.trim())
        .map((zeile, i) => (
          <p key={i} className="mt-1 text-sm text-text-secondary">
            {zeile}
          </p>
        ))}
    </>
  );
}

function Frage({ frage, antwort }: { frage: string; antwort: string }) {
  return (
    <details className="rounded-cid border border-text-tertiary/15 bg-bg-primary p-3">
      <summary className="cursor-pointer text-sm font-semibold text-text-primary">{frage}</summary>
      <div className="mt-2">
        <Absaetze text={antwort} />
      </div>
    </details>
  );
}

function Anleitung({ schluessel }: { schluessel: string }) {
  const { t } = useTranslation("help");
  const schritte = t(`${schluessel}.schritte`, { returnObjects: true }) as unknown;
  const liste = Array.isArray(schritte) ? (schritte as string[]) : [];
  return (
    <details className="rounded-cid border border-text-tertiary/15 bg-bg-primary p-3">
      <summary className="cursor-pointer text-sm font-semibold text-text-primary">
        {t(`${schluessel}.titre`)}
      </summary>
      <p className="mt-2 text-sm text-text-secondary">{t(`${schluessel}.intro`)}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-secondary">
        {liste.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

function treffer(f: FaqEintrag, sprache: string, suche: string): boolean {
  if (!suche) return true;
  const fr = istFranzoesisch(sprache);
  const text = `${fr && f.frage_fr ? f.frage_fr : f.frage_de} ${
    fr && f.antwort_fr ? f.antwort_fr : f.antwort_de
  }`.toLowerCase();
  return text.includes(suche.toLowerCase());
}

export default function FaqBereich({ onTicket }: { onTicket: () => void }) {
  const { t, i18n } = useTranslation("support");
  const [suche, setSuche] = useState("");
  const { data, isLoading, isError } = useFaq();
  const fr = istFranzoesisch(i18n.language);
  const liste = (data ?? []).filter((f) => treffer(f, i18n.language, suche.trim()));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-text-primary">{t("faq.titel")}</h2>
        <input
          type="search"
          className={FELD}
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder={t("faq.suche")}
          aria-label={t("faq.suche")}
        />
        {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
        {isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
        {!isLoading && !isError && liste.length === 0 && (
          <p className="text-sm text-text-tertiary">{t("faq.keine")}</p>
        )}
        <div className="flex flex-col gap-2">
          {liste.map((f) => (
            <Frage
              key={f.id}
              frage={fr && f.frage_fr ? f.frage_fr : f.frage_de}
              antwort={fr && f.antwort_fr ? f.antwort_fr : f.antwort_de}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-text-primary">{t("anleitungen.titel")}</h2>
        <div className="flex flex-col gap-2">
          {ANLEITUNGEN.map((s) => (
            <Anleitung key={s} schluessel={s} />
          ))}
        </div>
      </section>

      <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="text-base font-bold text-text-primary">{t("faq.nichts_gefunden")}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t("faq.nichts_gefunden_text")}</p>
        <button
          type="button"
          onClick={onTicket}
          className="mt-3 rounded-cid bg-ca px-3 py-2 text-sm font-semibold text-white"
        >
          {t("ticket.neu")}
        </button>
      </section>
    </div>
  );
}
