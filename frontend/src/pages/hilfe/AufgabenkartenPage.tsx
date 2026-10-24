/**
 * Aufgabenkarten : alle Abläufe der Verwaltung als Karten (Konzept_Aufgabenkarten.md). Die Texte
 * kommen aus help.json (dieselbe Quelle wie der Hilfe-Begleiter). Suche, Filter nach Rolle und
 * Bereich ; „Drucken / PDF“ je Karte oder für die Auswahl über den Druckdialog des Browsers
 * („Als PDF speichern“) : Beim Drucken wird nur der Kartenbereich ausgegeben (siehe index.css).
 */
import { IconPrinter } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import {
  KARTEN_BEREICHE,
  KARTEN_ROLLEN,
  kartenSchluessel,
  liste,
  passtZurRolle,
  passtZurSuche,
  type KartenBereich,
  type Workflow,
} from "../../components/layout/hilfeKarten";

function KartenAnsicht({
  bereich,
  karte,
  druck = false,
  onDrucken,
}: {
  bereich: string;
  karte: Workflow;
  druck?: boolean;
  onDrucken?: () => void;
}) {
  const { t } = useTranslation("help");
  return (
    <article
      id={druck ? undefined : `karte-${kartenSchluessel("", karte).replace(/[^\w-]+/g, "-")}`}
      className="karte rounded-lg border border-text-tertiary/20 bg-bg-secondary p-4 text-sm"
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-text-tertiary">
            {t(`${bereich}.titre`)}
            {karte.id ? ` · ${karte.id}` : ""}
          </p>
          <h3 className="text-base font-bold text-text-primary">{karte.titre}</h3>
        </div>
        {!druck && onDrucken && (
          <button
            type="button"
            onClick={onDrucken}
            className="no-print flex shrink-0 items-center gap-1 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
          >
            <IconPrinter size={14} />
            {t("karten_drucken")}
          </button>
        )}
      </header>

      {karte.rollen && karte.rollen.length > 0 && (
        <p className="mb-2 flex flex-wrap items-center gap-1 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">{t("karten_rollen_label")}:</span>
          {karte.rollen.map((r) => (
            <span key={r} className="rounded-full bg-bg-tertiary px-2 py-0.5">
              {t(`rollen.${r}`, { defaultValue: r })}
            </span>
          ))}
        </p>
      )}
      {karte.wann && <p className="mb-2 text-text-secondary">{karte.wann}</p>}
      {karte.vorher && (
        <p className="mb-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">{t("karte_vorher")}: </span>
          {karte.vorher}
        </p>
      )}

      <ol className="space-y-2">
        {karte.schritte.map((s, i) => (
          <li key={i} className="schritt">
            <div>
              <span className="mr-1 font-bold text-ca">{i + 1}.</span>
              {s}
            </div>
            {karte.erwartet?.[i] && (
              <p className="mt-1 rounded-cid bg-bg-tertiary/60 p-1.5 text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">{t("karte_erwartet")}: </span>
                {karte.erwartet[i]}
              </p>
            )}
            {(karte.bilder ?? [])
              .filter((b) => b.schritt === i + 1)
              .map((b) => (
                <img
                  key={b.datei}
                  src={`/hilfe/bilder/${b.datei}`}
                  alt={b.alt}
                  loading="lazy"
                  className="mt-1 max-h-64 rounded-cid border border-text-tertiary/20"
                />
              ))}
          </li>
        ))}
      </ol>

      {karte.beispiel && (
        <p className="mt-3 rounded-cid bg-bg-tertiary/60 p-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">{t("beispiel")}: </span>
          {karte.beispiel}
        </p>
      )}
      {karte.danach && (
        <p className="mt-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">{t("danach")} </span>
          {karte.danach}
        </p>
      )}
      {karte.fehler && karte.fehler.length > 0 && (
        <section className="mt-3">
          <h4 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
            {t("karte_fehler")}
          </h4>
          <ul className="space-y-1 text-xs text-text-secondary">
            {karte.fehler.map((f) => (
              <li key={f.problem}>
                <span className="font-semibold text-text-primary">{f.problem}</span> — {f.loesung}
              </li>
            ))}
          </ul>
        </section>
      )}
      {karte.uebung && (
        <section className="mt-3 rounded-cid border border-dashed border-text-tertiary/40 p-2 text-xs text-text-secondary">
          <h4 className="mb-1 font-bold uppercase text-text-tertiary">{t("karte_uebung")}</h4>
          <p className="mb-1 font-semibold text-text-primary">{t("karte_uebung_hinweis")}</p>
          <p>{karte.uebung}</p>
        </section>
      )}
    </article>
  );
}

export default function AufgabenkartenPage() {
  const { t } = useTranslation("help");
  const [params, setParams] = useSearchParams();
  const [suche, setSuche] = useState("");
  const [rolle, setRolle] = useState("");
  const [druck, setDruck] = useState<{ bereich: string; karte: Workflow }[] | null>(null);
  const bereichFilter = params.get("bereich") ?? "";

  const bereiche: KartenBereich[] = KARTEN_BEREICHE.map((cle) => ({
    cle,
    titel: t(`${cle}.titre`),
    karten: liste<Workflow>(t(`${cle}.workflows`, { returnObjects: true })),
  })).filter((b) => b.karten.length > 0);

  const sichtbar = bereiche
    .filter((b) => !bereichFilter || b.cle === bereichFilter)
    .map((b) => ({
      ...b,
      karten: b.karten.filter((k) => passtZurRolle(k, rolle) && passtZurSuche(k, suche)),
    }))
    .filter((b) => b.karten.length > 0);
  const anzahl = sichtbar.reduce((n, b) => n + b.karten.length, 0);

  // Drucken : erst den Druckbereich rendern, dann den Dialog öffnen ; danach wieder aufräumen.
  useEffect(() => {
    if (!druck) return;
    document.body.classList.add("karten-druck");
    const aufraeumen = () => {
      document.body.classList.remove("karten-druck");
      setDruck(null);
    };
    window.addEventListener("afterprint", aufraeumen, { once: true });
    window.print();
    return () => {
      window.removeEventListener("afterprint", aufraeumen);
      document.body.classList.remove("karten-druck");
    };
  }, [druck]);

  const alleKarten = sichtbar.flatMap((b) => b.karten.map((karte) => ({ bereich: b.cle, karte })));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="no-print space-y-1">
        <h1 className="text-xl font-bold text-text-primary">{t("karten_titel")}</h1>
        <p className="text-sm text-text-secondary">{t("karten_intro")}</p>
      </header>

      <div className="no-print flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-text-secondary">
          {t("karten_suche")}
          <input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
          {t("karten_rolle")}
          <select
            value={rolle}
            onChange={(e) => setRolle(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm"
          >
            <option value="">{t("karten_alle_rollen")}</option>
            {KARTEN_ROLLEN.map((r) => (
              <option key={r} value={r}>
                {t(`rollen.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
          {t("karten_bereich")}
          <select
            value={bereichFilter}
            onChange={(e) => {
              const neu = new URLSearchParams(params);
              if (e.target.value) neu.set("bereich", e.target.value);
              else neu.delete("bereich");
              setParams(neu, { replace: true });
            }}
            className="rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm"
          >
            <option value="">{t("karten_alle_bereiche")}</option>
            {bereiche.map((b) => (
              <option key={b.cle} value={b.cle}>
                {b.titel}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={alleKarten.length === 0}
          onClick={() => setDruck(alleKarten)}
          className="flex items-center gap-1 rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          <IconPrinter size={16} />
          {t("karten_alle_drucken")}
        </button>
      </div>

      <p className="no-print text-xs text-text-tertiary" aria-live="polite">
        {t("karten_anzahl", { count: anzahl })}
      </p>

      {sichtbar.length === 0 && (
        <p className="no-print rounded-cid bg-bg-tertiary/60 p-3 text-sm text-text-secondary">
          {t("karten_keine")}
        </p>
      )}

      {sichtbar.map((b) => (
        <section key={b.cle} className="no-print space-y-3">
          <h2 className="text-sm font-bold uppercase text-text-tertiary">{b.titel}</h2>
          {b.karten.map((karte) => (
            <KartenAnsicht
              key={kartenSchluessel(b.cle, karte)}
              bereich={b.cle}
              karte={karte}
              onDrucken={() => setDruck([{ bereich: b.cle, karte }])}
            />
          ))}
        </section>
      ))}

      {druck &&
        createPortal(
          <div id="druckbereich">
            {druck.map(({ bereich, karte }) => (
              <KartenAnsicht
                key={kartenSchluessel(bereich, karte)}
                bereich={bereich}
                karte={karte}
                druck
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
