import { useTranslation } from "react-i18next";

import type { Hinweis, Probelauf, ProbelaufKostenart } from "../../../types/finances";
import { euro } from "../../../utils/finanzen";
import { kategorieName } from "../../../utils/kategorie";
import { Fachwort, HilfeHinweis } from "../Erklaerung";

const AMPEL = {
  gruen: "border-status-successText bg-status-successBg text-status-successText",
  orange: "border-status-warningText bg-status-warningBg text-status-warningText",
  rot: "border-status-dangerText bg-status-dangerBg text-status-dangerText",
} as const;

const STUFE_PUNKT = {
  gut: "bg-status-successBg text-status-successText",
  achtung: "bg-status-warningBg text-status-warningText",
  kritisch: "bg-status-dangerBg text-status-dangerText",
} as const;
const STUFE_ZEICHEN = { gut: "✓", achtung: "!", kritisch: "✕" } as const;

const BALKEN = {
  ok: "bg-status-successText",
  attention: "bg-status-warningText",
  depasse: "bg-ca",
  aucun: "bg-text-tertiary",
} as const;

/** Schritt 3: Gesamtbewertung, Sätze in einfacher Sprache und Plan gegen Wirklichkeit je Kostenart. */
export default function BewertungSchritt({
  daten,
  begruendungen,
  onBegruendung,
}: {
  daten: Probelauf;
  begruendungen: Record<string, string>;
  onBegruendung: (id: string, text: string) => void;
}) {
  const { t, i18n } = useTranslation("finances");
  const sp = i18n.language;
  const name = (k: ProbelaufKostenart) => kategorieName(k.namen, k.nom, sp);
  const liste = (status: ProbelaufKostenart["status"]) =>
    daten.kostenarten
      .filter((k) => k.status === status)
      .map(name)
      .join(", ");

  function satz(h: Hinweis): string {
    const p = h.params as Record<string, number | string>;
    switch (h.code) {
      case "ergebnis":
        return t(
          h.stufe === "gut"
            ? "assistent.hinweis.ergebnis_gut"
            : "assistent.hinweis.ergebnis_kritisch",
          {
            betrag: euro(Math.abs(Number(p.betrag)), sp),
            vorjahr: euro(p.vorjahr, sp),
          },
        );
      case "gesamtbudget":
        return t("assistent.hinweis.gesamtbudget", {
          prozent: p.prozent,
          ausgaben: euro(p.ausgaben, sp),
          budget: euro(p.budget, sp),
        });
      case "einnahmen_vorjahr":
        return t(
          Number(p.prozent) >= 0
            ? "assistent.hinweis.einnahmen_plus"
            : "assistent.hinweis.einnahmen_minus",
          { prozent: Math.abs(Number(p.prozent)) },
        );
      case "ueber_budget":
        return t("assistent.hinweis.ueber_budget", { anzahl: p.anzahl, namen: liste("depasse") });
      case "fast_ausgeschoepft":
        return t("assistent.hinweis.fast_ausgeschoepft", { namen: liste("attention") });
      case "pruefliste":
        return t(
          h.stufe === "gut"
            ? "assistent.hinweis.pruefliste_gut"
            : "assistent.hinweis.pruefliste_offen",
          { offen: p.offen },
        );
    }
  }

  const maximum = Math.max(
    ...daten.kostenarten.map((k) => Math.max(Number(k.montant), Number(k.budget))),
    1,
  );
  const ueber = daten.kostenarten.filter((k) => k.status === "depasse");
  const ampel = daten.bewertung.ampel;

  return (
    <section aria-label={t("assistent.schritte.bewerten")} className="space-y-3">
      <div className={`rounded-cid-lg border-l-4 p-4 ${AMPEL[ampel]}`}>
        <h2 className="text-lg font-bold">{t(`assistent.ampel.${ampel}.titel`)}</h2>
        <p className="text-sm">{t(`assistent.ampel.${ampel}.text`)}</p>
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold text-text-primary">
          {t("assistent.bewertung.titel")}
        </h2>
        <ul className="space-y-2 text-sm">
          {daten.bewertung.hinweise.map((h) => (
            <li key={h.code} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold ${STUFE_PUNKT[h.stufe]}`}
              >
                {STUFE_ZEICHEN[h.stufe]}
              </span>
              <span className="text-text-primary">{satz(h)}</span>
            </li>
          ))}
        </ul>
        <HilfeHinweis>
          {t("assistent.bewertung.hilfe_a")} <Fachwort begriff="pruefung" />
          {t("assistent.bewertung.hilfe_b")}
        </HilfeHinweis>
      </div>

      <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-text-primary">
          {t("assistent.bewertung.plan_titel_a")} <Fachwort begriff="kosten" />
        </h2>
        <ul className="space-y-2">
          {daten.kostenarten.map((k) => (
            <li
              key={k.categorie_id}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-xs md:grid-cols-[170px_1fr_190px]"
            >
              <span className="text-text-primary">{name(k)}</span>
              <span className="flex items-center justify-end gap-2 whitespace-nowrap tabular-nums md:order-3">
                <span>
                  {euro(k.montant, sp)}{" "}
                  <span className="text-text-tertiary">/ {euro(k.budget, sp)}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    k.status === "depasse"
                      ? "bg-status-dangerBg text-status-dangerText"
                      : k.status === "attention"
                        ? "bg-status-warningBg text-status-warningText"
                        : "bg-status-successBg text-status-successText"
                  }`}
                >
                  {t(`assistent.kostenart.${k.status}`)}
                </span>
              </span>
              <div
                role="img"
                aria-label={t("assistent.bewertung.balken_label", {
                  name: name(k),
                  ist: euro(k.montant, sp),
                  budget: euro(k.budget, sp),
                  prozent: k.prozent ?? 0,
                })}
                className="relative col-span-2 h-3.5 rounded bg-bg-tertiary md:order-2 md:col-span-1"
              >
                <div
                  className={`absolute inset-y-0 left-0 rounded ${BALKEN[k.status]}`}
                  style={{ width: `${(Number(k.montant) / maximum) * 100}%` }}
                />
                {Number(k.budget) > 0 && (
                  <div
                    className="absolute -inset-y-1 w-0.5 bg-text-primary/70"
                    style={{ left: `${(Number(k.budget) / maximum) * 100}%` }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-text-tertiary">{t("assistent.bewertung.legende")}</p>
        <HilfeHinweis>{t("assistent.bewertung.plan_hilfe")}</HilfeHinweis>

        {ueber.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-semibold text-text-primary">
              {t("assistent.bewertung.begruendung_titel")}
            </p>
            {ueber.map((k) => (
              <div key={k.categorie_id}>
                <label
                  htmlFor={`beg-${k.categorie_id}`}
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  {t("assistent.bewertung.begruendung_label", {
                    name: name(k),
                    prozent: k.prozent,
                  })}
                </label>
                <textarea
                  id={`beg-${k.categorie_id}`}
                  rows={2}
                  maxLength={500}
                  value={begruendungen[k.categorie_id] ?? ""}
                  onChange={(e) => onBegruendung(k.categorie_id, e.target.value)}
                  placeholder={t("assistent.bewertung.begruendung_platzhalter")}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1 text-sm"
                />
              </div>
            ))}
            <p className="text-[11px] text-text-tertiary">
              {t("assistent.bewertung.begruendung_hinweis")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
