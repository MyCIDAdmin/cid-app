/**
 * Reglement-Bibliothek : Wahlordnung, Satzungsauszug, Fairness-Kodex, Datenschutz, Geschäftsordnung.
 * Deutsch ist verbindlich; Französisch und Arabisch sind maschinell übersetzt, bis ein Mensch sie
 * als geprüft markiert. Mitglieder bestätigen, dass sie die aktuelle Fassung gelesen haben.
 */
import DOMPurify from "dompurify";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useReglementAktionen, useReglementAnlegen, useReglemente } from "../../hooks/useWahlen";
import type { Reglement, ReglementArt, Sprache, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum } from "../../utils/wahlen";
import RichTextEditor from "../ui/RichTextEditor";

const ARTEN: ReglementArt[] = [
  "wahlordnung",
  "satzung",
  "fairness",
  "datenschutz",
  "geschaeftsordnung",
];
const SPRACHEN: Sprache[] = ["de", "fr", "ar"];

function Dokument({ r, intern }: { r: Reglement; intern: boolean }) {
  const { t } = useTranslation("wahlen");
  const aktionen = useReglementAktionen(r.id);
  const [sprache, setSprache] = useState<Sprache>("de");
  const [bearbeiten, setBearbeiten] = useState(false);
  const [html, setHtml] = useState(r.texte[sprache] ?? "");
  const [version, setVersion] = useState(r.version);
  const [fehler, setFehler] = useState("");
  const merken = (e: unknown) => setFehler(extractApiErrorMessage(e, t("reglement.fehler")));
  const text = r.texte[sprache] ?? "";

  useEffect(() => {
    setHtml(r.texte[sprache] ?? "");
    setVersion(r.version);
  }, [r.texte, r.version, sprache]);

  return (
    <article
      className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      data-testid={`reglement-${r.schluessel}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t(`reglement.art.${r.schluessel}`)}</h3>
        <span className="text-xs text-text-secondary">
          {t("reglement.version", { v: r.version })}
          {r.gueltig_ab ? ` · ${t("reglement.gueltig_ab", { datum: datum(r.gueltig_ab) })}` : ""}
        </span>
      </header>

      <div role="tablist" className="flex gap-1">
        {SPRACHEN.filter((s) => s === "de" || r.texte[s]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={s === sprache}
            onClick={() => setSprache(s)}
            className={`rounded-cid px-3 py-1 text-xs ${
              s === sprache ? "bg-ca text-white" : "border border-text-tertiary/30"
            }`}
          >
            {t(`sprache.${s}`)}
          </button>
        ))}
        {intern &&
          SPRACHEN.filter((s) => s !== "de" && !r.texte[s]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSprache(s)}
              className="rounded-cid border border-dashed border-text-tertiary/30 px-3 py-1 text-xs text-text-tertiary"
            >
              + {t(`sprache.${s}`)}
            </button>
          ))}
      </div>

      {sprache !== "de" && (
        <p className="rounded-cid bg-status-warningBg p-2 text-xs text-status-warningText">
          {r.geprueft[sprache] ? t("reglement.geprueft_hinweis") : t("reglement.maschinell")}
        </p>
      )}

      {bearbeiten && intern ? (
        <div className="space-y-2" dir={sprache === "ar" ? "rtl" : "ltr"}>
          <RichTextEditor value={html} onChange={setHtml} ariaLabel={t("reglement.text")} />
          <label className="block text-xs">
            {t("reglement.version_feld")}
            <input
              value={version}
              maxLength={20}
              onChange={(e) => setVersion(e.target.value)}
              className="ml-2 w-24 rounded-cid border border-text-tertiary/30 p-1 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                aktionen.aendern.mutate(
                  { sprache, html, version },
                  { onSuccess: () => setBearbeiten(false), onError: merken },
                )
              }
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white"
            >
              {t("reglement.speichern")}
            </button>
            {sprache !== "de" && r.uebersetzung_moeglich && (
              <button
                type="button"
                disabled={aktionen.uebersetzen.isPending}
                onClick={() => aktionen.uebersetzen.mutate(sprache, { onError: merken })}
                className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm"
              >
                {t("reglement.uebersetzen")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setBearbeiten(false)}
              className="text-xs text-text-secondary underline"
            >
              {t("reglement.abbrechen")}
            </button>
          </div>
        </div>
      ) : text ? (
        <div
          className="prose prose-sm max-w-none text-sm"
          dir={sprache === "ar" ? "rtl" : "ltr"}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }}
        />
      ) : (
        <p className="text-sm text-text-tertiary">{t("reglement.kein_text")}</p>
      )}

      <footer className="flex flex-wrap items-center gap-3">
        {!intern && r.texte.de && !r.gelesen && (
          <button
            type="button"
            onClick={() => aktionen.gelesen.mutate(undefined, { onError: merken })}
            className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white"
          >
            {t("reglement.gelesen_bestaetigen")}
          </button>
        )}
        {r.gelesen && (
          <span className="text-xs text-status-successText">{t("reglement.gelesen_ja")}</span>
        )}
        {intern && !bearbeiten && (
          <button
            type="button"
            onClick={() => setBearbeiten(true)}
            className="text-xs text-ca underline"
          >
            {t("reglement.bearbeiten")}
          </button>
        )}
        {intern && sprache !== "de" && r.texte[sprache] && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={r.geprueft[sprache as "fr" | "ar"]}
              onChange={(e) =>
                aktionen.geprueft.mutate({ sprache, wert: e.target.checked }, { onError: merken })
              }
            />
            {t("reglement.geprueft")}
          </label>
        )}
        {intern && (
          <span className="text-xs text-text-tertiary">
            {t("reglement.gelesen_anzahl", { n: r.gelesen_anzahl ?? 0 })}
          </span>
        )}
      </footer>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </article>
  );
}

export default function ReglementTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const intern = wahl.ist_ausschuss || wahl.kann_verwalten;
  const reglemente = useReglemente(wahl.id);
  const anlegen = useReglementAnlegen(wahl.id);
  const [fehler, setFehler] = useState("");
  const liste = reglemente.data ?? [];
  const fehlend = ARTEN.filter((a) => !liste.some((r) => r.schluessel === a));

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">{t("reglement.intro")}</p>
      {liste.length === 0 && !reglemente.isLoading && (
        <p className="text-sm text-text-tertiary">{t("reglement.leer")}</p>
      )}
      {liste.map((r) => (
        <Dokument key={r.id} r={r} intern={intern} />
      ))}
      {intern && fehlend.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary">{t("reglement.hinzufuegen")}</span>
          {fehlend.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() =>
                anlegen.mutate(a, {
                  onError: (e) => setFehler(extractApiErrorMessage(e, t("reglement.fehler"))),
                })
              }
              className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs"
            >
              + {t(`reglement.art.${a}`)}
            </button>
          ))}
        </div>
      )}
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </div>
  );
}
