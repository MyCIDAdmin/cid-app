/**
 * Hilfe-Begleiter : Seitenpanel, das neben der App offen bleibt (Desktop : rechte Spalte, die
 * Seite rückt zusammen ; Handy : Blatt am unteren Rand, auf eine Leiste verkleinerbar). Das Panel
 * blockiert nichts, es gibt keinen abgedunkelten Hintergrund ; Escape oder das Kreuz schließen es.
 *
 * Abläufe werden einzeln geführt : Es steht immer genau ein Schritt groß da („Erledigt – weiter“),
 * die übrigen Schritte sind eingeklappt abrufbar. Der Stand wird je Ablauf im Browser gemerkt und
 * überlebt Seitenwechsel und Neuladen. Das Panel bleibt auch beim Wechsel in ein anderes Modul
 * offen, weil Abläufe oft über mehrere Seiten gehen ; auf einer Seite mit eigener Hilfe erscheint
 * dann ein Hinweis zum Umschalten.
 */
import { IconChevronLeft, IconHelp, IconMinus, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import { useHilfeStore } from "../../store/hilfeStore";
import { ablaufSchluessel, fortschrittLesen, fortschrittSchreiben } from "./hilfeFortschritt";
import { cleHilfe } from "./helpRoutes";
import { liste, type Workflow } from "./hilfeKarten";

export type { Workflow };

/** Ein geführter Ablauf : aktueller Schritt groß, Fortschrittsbalken, Zurück/Weiter. */
export function AblaufBegleiter({
  cle,
  workflow,
  onZurueck,
}: {
  cle: string;
  workflow: Workflow;
  onZurueck: () => void;
}) {
  const { t } = useTranslation("help");
  const schluessel = ablaufSchluessel(cle, workflow.titre);
  const gesamt = workflow.schritte.length;
  const [schritt, setSchritt] = useState(() => Math.min(fortschrittLesen(schluessel), gesamt));
  const [alleOffen, setAlleOffen] = useState(false);
  const fertig = schritt >= gesamt;

  function gehe(neu: number) {
    const wert = Math.max(0, Math.min(neu, gesamt));
    setSchritt(wert);
    fortschrittSchreiben(schluessel, wert);
  }

  return (
    <div className="space-y-3 text-sm">
      <button
        type="button"
        onClick={onZurueck}
        className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
      >
        <IconChevronLeft size={14} />
        {t("alle_ablaeufe")}
      </button>
      <h3 className="text-sm font-bold text-text-primary">{workflow.titre}</h3>
      {workflow.wann && <p className="text-xs text-text-secondary">{workflow.wann}</p>}

      <div>
        <div
          role="progressbar"
          aria-label={workflow.titre}
          aria-valuemin={0}
          aria-valuemax={gesamt}
          aria-valuenow={Math.min(schritt, gesamt)}
          className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary"
        >
          <div
            className="h-full bg-ca transition-all"
            style={{ width: `${gesamt ? Math.round((100 * schritt) / gesamt) : 0}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-text-tertiary">
          {fertig ? t("alle_fertig") : t("schritt_von", { aktuell: schritt + 1, gesamt })}
        </p>
      </div>

      {fertig ? (
        <div className="space-y-2 rounded-cid bg-bg-tertiary/60 p-3">
          <p className="font-semibold text-text-primary">{t("ablauf_fertig")}</p>
          {workflow.danach && (
            <p className="text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">{t("danach")} </span>
              {workflow.danach}
            </p>
          )}
          <button
            type="button"
            onClick={() => gehe(0)}
            className="text-xs font-medium text-text-secondary underline"
          >
            {t("von_vorn")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            aria-live="polite"
            className="rounded-cid border border-ca/40 bg-bg-primary p-3 text-text-primary"
          >
            <span className="mr-1 font-bold text-ca">{schritt + 1}.</span>
            {workflow.schritte[schritt]}
            {workflow.erwartet?.[schritt] && (
              <p className="mt-2 rounded-cid bg-bg-tertiary/60 p-2 text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">{t("karte_erwartet")}: </span>
                {workflow.erwartet[schritt]}
              </p>
            )}
          </div>
          {schritt === 0 && workflow.beispiel && (
            <div className="rounded-cid bg-bg-tertiary/60 p-2.5 text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">{t("beispiel")}: </span>
              {workflow.beispiel}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => gehe(schritt - 1)}
              disabled={schritt === 0}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
            >
              {t("zurueck")}
            </button>
            <button
              type="button"
              onClick={() => gehe(schritt + 1)}
              className="flex-1 rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {schritt === gesamt - 1 ? t("fertig") : t("erledigt_weiter")}
            </button>
          </div>
        </div>
      )}

      {workflow.fehler && workflow.fehler.length > 0 && (
        <div className="space-y-1.5 text-xs">
          <h4 className="font-bold uppercase text-text-tertiary">{t("karte_fehler")}</h4>
          <ul className="space-y-1.5">
            {workflow.fehler.map((f) => (
              <li key={f.problem} className="rounded-cid bg-bg-tertiary/60 p-2 text-text-secondary">
                <span className="font-semibold text-text-primary">{f.problem}</span> — {f.loesung}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        to={`/hilfe/karten?bereich=${encodeURIComponent(cle)}`}
        className="block text-xs font-medium text-text-secondary underline"
      >
        {t("karte_oeffnen")}
      </Link>

      <div>
        <button
          type="button"
          aria-expanded={alleOffen}
          onClick={() => setAlleOffen((o) => !o)}
          className="text-xs font-medium text-text-secondary underline"
        >
          {t("alle_schritte")}
        </button>
        {alleOffen && (
          <ol className="mt-2 space-y-1">
            {workflow.schritte.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => gehe(i)}
                  aria-current={i === schritt && !fertig ? "step" : undefined}
                  className={`w-full rounded-cid px-2 py-1 text-left text-xs hover:bg-bg-tertiary ${
                    i === schritt && !fertig
                      ? "bg-bg-tertiary font-semibold text-text-primary"
                      : i < schritt
                        ? "text-text-tertiary line-through"
                        : "text-text-secondary"
                  }`}
                >
                  <span className="mr-1 font-semibold">{i + 1}.</span>
                  {s}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function HelpPanel() {
  const { t } = useTranslation("help");
  const { pathname, search } = useLocation();
  const { offen, cle, minimiert, oeffnen, schliessen, minimierenUmschalten } = useHilfeStore();
  const [gewaehlt, setGewaehlt] = useState<{ cle: string; titel: string } | null>(null);

  useEscapeSchliessen(schliessen, offen && !minimiert);

  if (!offen || !cle) return null;

  const seitenCle = cleHilfe(pathname, search);
  const workflows = liste<Workflow>(t(`${cle}.workflows`, { returnObjects: true }));
  const schritte = liste<string>(t(`${cle}.schritte`, { returnObjects: true }));
  const tipps = liste<string>(t(`${cle}.tipps`, { returnObjects: true }));
  const aktiv = gewaehlt && gewaehlt.cle === cle ? gewaehlt : null;
  const ablauf = aktiv ? workflows.find((w) => w.titre === aktiv.titel) : undefined;

  if (minimiert) {
    const fortschritt = ablauf
      ? Math.min(fortschrittLesen(ablaufSchluessel(cle, ablauf.titre)), ablauf.schritte.length)
      : 0;
    return (
      <button
        type="button"
        onClick={minimierenUmschalten}
        aria-label={t("vergroessern")}
        className="fixed bottom-4 right-4 z-40 flex max-w-[85vw] items-center gap-2 rounded-full border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-xs font-medium text-text-primary shadow-lg"
      >
        <IconHelp size={16} />
        <span className="truncate">
          {ablauf && fortschritt < ablauf.schritte.length
            ? `${t("schritt_von", { aktuell: fortschritt + 1, gesamt: ablauf.schritte.length })} · ${ablauf.schritte[fortschritt]}`
            : t(`${cle}.titre`)}
        </span>
      </button>
    );
  }

  return (
    <aside
      aria-label={t(`${cle}.titre`)}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[55vh] flex-col border-t border-text-tertiary/20 bg-bg-primary shadow-xl lg:static lg:inset-auto lg:z-auto lg:max-h-none lg:w-[24rem] lg:shrink-0 lg:border-l lg:border-t-0 lg:shadow-none"
    >
      <div className="flex items-start justify-between gap-2 border-b border-text-tertiary/10 px-4 py-3">
        <h2 className="text-sm font-bold text-text-primary">{t(`${cle}.titre`)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={minimierenUmschalten}
            aria-label={t("minimieren")}
            className="rounded-cid p-1 text-text-tertiary hover:bg-bg-tertiary"
          >
            <IconMinus size={16} />
          </button>
          <button
            type="button"
            onClick={schliessen}
            aria-label={t("fermer")}
            className="rounded-cid p-1 text-text-tertiary hover:bg-bg-tertiary"
          >
            <IconX size={16} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {seitenCle && seitenCle !== cle && (
          <div className="flex items-center justify-between gap-2 rounded-cid bg-bg-tertiary/60 p-2.5 text-xs text-text-secondary">
            <span>{t("andere_seite")}</span>
            <button
              type="button"
              onClick={() => oeffnen(seitenCle)}
              className="shrink-0 font-semibold text-text-primary underline"
            >
              {t("zu_dieser_seite")}
            </button>
          </div>
        )}

        {ablauf ? (
          <AblaufBegleiter
            key={`${cle}/${ablauf.titre}`}
            cle={cle}
            workflow={ablauf}
            onZurueck={() => setGewaehlt(null)}
          />
        ) : (
          <>
            <p className="text-sm text-text-secondary">{t(`${cle}.intro`)}</p>
            <p className="text-[11px] text-text-tertiary">{t("begleiter_hinweis")}</p>

            {workflows.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
                  {t("workflows")}
                </h3>
                <ul className="space-y-2">
                  {workflows.map((w) => {
                    const stand = Math.min(
                      fortschrittLesen(ablaufSchluessel(cle, w.titre)),
                      w.schritte.length,
                    );
                    return (
                      <li key={w.titre}>
                        <button
                          type="button"
                          onClick={() => setGewaehlt({ cle, titel: w.titre })}
                          className="w-full rounded-cid border border-text-tertiary/20 px-3 py-2 text-left hover:bg-bg-tertiary"
                        >
                          <span className="block text-sm font-semibold text-text-primary">
                            {w.titre}
                          </span>
                          <span className="block text-[11px] text-text-tertiary">
                            {stand === 0
                              ? t("ablauf_start", { gesamt: w.schritte.length })
                              : stand >= w.schritte.length
                                ? t("alle_fertig")
                                : t("ablauf_weiter", { n: stand + 1, gesamt: w.schritte.length })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {schritte.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
                  {t("ueberblick")}
                </h3>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-primary">
                  {schritte.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </section>
            )}

            {tipps.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-bold uppercase text-text-tertiary">
                  {t("tipps")}
                </h3>
                <ul className="list-disc space-y-1 pl-5 text-xs text-text-secondary">
                  {tipps.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
