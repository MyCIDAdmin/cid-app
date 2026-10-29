/** Erste Seite des Reiseraums : Wichtiges und Finales steht immer oben und geht nicht im Chat unter. */
import { useTranslation } from "react-i18next";

import FormatierterText from "../regionen/FormatierterText";
import { useBeitreten, useInfoGelesen, useRegelnBestaetigen } from "../../hooks/useReisen";
import { datumKurz, preisText, zeitraum } from "../../utils/reisen";
import type { Entscheidung, ReiseDetail } from "../../types/reisen";
import AmZiel from "./AmZiel";
import { Countdown, KARTE, KNOPF, KNOPF_LEISE } from "./ui";

const PHASEN = ["interesse", "planung", "buchung", "reise", "rueckblick"] as const;

function BeschlossenKarte({ e }: { e: Entscheidung }) {
  const { t, i18n } = useTranslation("reisen");
  const b = e.beschluss;
  if (!b) return null;
  return (
    <li className={KARTE} data-testid="beschlossen-karte">
      <p className="text-[11px] uppercase tracking-wide text-text-tertiary">
        {t(`baustein.${e.baustein}`)}
      </p>
      <p className="text-sm font-semibold text-text-primary">{b.titel ?? e.titel}</p>
      <p className="text-xs text-text-secondary">
        {[
          b.preis
            ? preisText(
                b.preis,
                b.preis_einheit ? t(`einheit.${b.preis_einheit}`) : "",
                i18n.language,
              )
            : "",
          b.entfernung,
          b.von_datum ? zeitraum(b.von_datum, b.bis_datum, i18n.language) : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {e.typ === "empfehlung" && (
        <p className="text-xs text-ca">{t("entscheidung.empfehlung_folgen", { n: b.folgen })}</p>
      )}
      {b.link && (
        <a
          href={b.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-ca underline"
        >
          {t("entscheidung.link")}
        </a>
      )}
      <p className="text-[10px] text-text-tertiary">
        {t("entscheidung.beschlossen_am", { datum: datumKurz(b.am, i18n.language) })}
      </p>
    </li>
  );
}

export default function AufEinenBlick({
  reise,
  onTab,
}: {
  reise: ReiseDetail;
  onTab: (id: string) => void;
}) {
  const { t } = useTranslation("reisen");
  const beitreten = useBeitreten(reise.id);
  const regeln = useRegelnBestaetigen(reise.id);
  const gelesen = useInfoGelesen(reise.id);
  const phaseIndex = PHASEN.indexOf(reise.phase);
  const jetzt = reise.jetzt_dran ?? [];
  const tabFuer: Record<string, string> = {
    abstimmen: "planung",
    aufgabe_ueberfaellig: "planung",
    info_lesen: "infos",
    hinreise: "meine",
    anfragen: "menschen",
  };

  return (
    <div className="space-y-4">
      <ol className="flex gap-1 text-[11px]" aria-label={t("phase.label")}>
        {PHASEN.map((p, i) => (
          <li
            key={p}
            className={`flex-1 rounded-cid px-1 py-1 text-center ${i === phaseIndex ? "bg-ca text-white" : i < phaseIndex ? "bg-ca/10 text-ca" : "bg-bg-tertiary text-text-tertiary"}`}
          >
            {t(`phase.${p}`)}
          </li>
        ))}
      </ol>

      {reise.abgesagt && (
        <p className="rounded-cid bg-red-50 p-2 text-sm text-red-800">{t("abgesagt_hinweis")}</p>
      )}

      {!reise.mein_status && !reise.abgesagt && (
        <div className={`${KARTE} flex flex-wrap items-center gap-2`}>
          <p className="flex-1 text-sm">{t("beitritt.frage")}</p>
          <button
            type="button"
            className={KNOPF_LEISE}
            onClick={() => beitreten.mutate({ status: "interessiert" })}
          >
            {t("beitritt.interessiert")}
          </button>
          {reise.beitritt !== "einladung" && (
            <button
              type="button"
              className={KNOPF}
              onClick={() => beitreten.mutate({ status: "dabei" })}
            >
              {reise.beitritt === "genehmigung" ? t("beitritt.anfragen") : t("beitritt.dabei")}
            </button>
          )}
        </div>
      )}
      {reise.mein_status === "eingeladen" && (
        <div className={`${KARTE} flex flex-wrap items-center gap-2`}>
          <p className="flex-1 text-sm">{t("beitritt.eingeladen")}</p>
          <button
            type="button"
            className={KNOPF_LEISE}
            onClick={() => beitreten.mutate({ status: "interessiert" })}
          >
            {t("beitritt.interessiert")}
          </button>
          <button
            type="button"
            className={KNOPF}
            onClick={() => beitreten.mutate({ status: "dabei" })}
          >
            {t("beitritt.dabei")}
          </button>
        </div>
      )}
      {reise.mein_status === "interessiert" &&
        reise.beitritt !== "einladung" &&
        !reise.abgesagt && (
          <div className={`${KARTE} flex flex-wrap items-center gap-2`}>
            <p className="flex-1 text-sm">{t("beitritt.interessiert_status")}</p>
            <button
              type="button"
              className={KNOPF}
              onClick={() => beitreten.mutate({ status: "dabei" })}
            >
              {reise.beitritt === "genehmigung" ? t("beitritt.anfragen") : t("beitritt.dabei")}
            </button>
          </div>
        )}
      {reise.mein_status === "angefragt" && (
        <p className="text-sm text-text-secondary">{t("beitritt.angefragt")}</p>
      )}
      {reise.mein_status === "warteliste" && (
        <p className="text-sm text-text-secondary">{t("beitritt.warteliste")}</p>
      )}

      {jetzt.length > 0 && (
        <section aria-label={t("jetzt_dran.titel")}>
          <h2 className="mb-1 text-sm font-semibold">{t("jetzt_dran.titel")}</h2>
          <ul className="space-y-1">
            {jetzt.map((p, i) => (
              <li
                key={`${p.art}-${p.id ?? i}`}
                className="flex items-center justify-between gap-2 rounded-cid bg-amber-50 px-3 py-2 text-sm"
              >
                <span>
                  {t(`jetzt_dran.${p.art}`, { titel: p.titel })}
                  {p.frist && (
                    <span className="ml-2">
                      <Countdown frist={p.frist} />
                    </span>
                  )}
                </span>
                {p.art === "regeln" ? (
                  <button type="button" className={KNOPF} onClick={() => regeln.mutate()}>
                    {t("regeln.bestaetigen")}
                  </button>
                ) : p.art === "info_lesen" && p.id ? (
                  <button
                    type="button"
                    className={KNOPF}
                    onClick={() => gelesen.mutate(p.id as string)}
                  >
                    {t("infos.gelesen")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={KNOPF_LEISE}
                    onClick={() => onTab(tabFuer[p.art] ?? "blick")}
                  >
                    {t("jetzt_dran.oeffnen")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AmZiel reise={reise} />

      {(reise.infos ?? []).length > 0 && (
        <section aria-label={t("infos.wichtig")}>
          <h2 className="mb-1 text-sm font-semibold">{t("infos.wichtig")}</h2>
          <ul className="space-y-2">
            {(reise.infos ?? []).map((i) => (
              <li key={i.id} className="rounded-cid border border-ca/40 bg-ca/5 p-3">
                <p className="text-sm font-semibold">{i.titel}</p>
                <FormatierterText text={i.text} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t("beschlossen_titel")}>
        <h2 className="mb-1 text-sm font-semibold">{t("beschlossen_titel")}</h2>
        {reise.beschlossen.length === 0 ? (
          <p className="text-xs text-text-tertiary">{t("beschlossen_leer")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {reise.beschlossen.map((e) => (
              <BeschlossenKarte key={e.id} e={e} />
            ))}
          </ul>
        )}
      </section>

      {reise.voll && (reise.stadion_infos || reise.laenderinfo || reise.regeln) && (
        <section className="space-y-2" aria-label={t("feste_infos")}>
          <h2 className="text-sm font-semibold">{t("feste_infos")}</h2>
          {reise.stadion_infos && (
            <div className={KARTE}>
              <p className="mb-1 text-xs font-semibold">{t("stadion_infos")}</p>
              <FormatierterText text={reise.stadion_infos} />
            </div>
          )}
          {reise.laenderinfo && (
            <div className={KARTE}>
              <p className="mb-1 text-xs font-semibold">{t("laenderinfo")}</p>
              <FormatierterText text={reise.laenderinfo} />
            </div>
          )}
          {reise.regeln && (
            <div className={KARTE}>
              <p className="mb-1 text-xs font-semibold">{t("regeln.titel")}</p>
              <FormatierterText text={reise.regeln} />
            </div>
          )}
        </section>
      )}

      {reise.beschreibung && (
        <section className={KARTE}>
          <FormatierterText text={reise.beschreibung} />
        </section>
      )}
      {reise.neu && reise.neu.entscheidungen + reise.neu.infos + reise.neu.aufgaben > 0 && (
        <p className="text-xs text-text-tertiary">
          {t("neu_seit", { n: reise.neu.entscheidungen + reise.neu.infos + reise.neu.aufgaben })}
        </p>
      )}
      <p className="text-[11px] text-text-tertiary">{t("haftung")}</p>
    </div>
  );
}
