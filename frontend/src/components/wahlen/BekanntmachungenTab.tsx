/**
 * Bekanntmachungen : der Ausschuss schreibt die fünf Mitteilungen selbst (Word-ähnlicher Editor,
 * Deutsch verbindlich, Französisch/Arabisch maschinell übersetzt und von Hand zu prüfen), legt sie
 * zur Freigabe vor (zwei Freigaben) und der Server versendet sie zum geplanten Zeitpunkt.
 */
import DOMPurify from "dompurify";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { bekanntmachungAushang } from "../../api/wahlen";
import { useBekanntmachungAktionen, useBekanntmachungen } from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import type { Bekanntmachung, Kanal, Sprache, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum } from "../../utils/wahlen";
import RichTextEditor from "../ui/RichTextEditor";

const SPRACHEN: Sprache[] = ["de", "fr", "ar"];
const KANAELE: Kanal[] = ["mail", "app", "print"];

function platzhalter(text: string, wahl: Wahl): string {
  return text
    .split("{Wahl}")
    .join(wahl.titel)
    .split("{Frist}")
    .join(datum(wahl.termine.kandidatur_bis))
    .split("{Datum}")
    .join(datum(wahl.termine.wahl_bis));
}

function Editor({ wahl, bk }: { wahl: Wahl; bk: Bekanntmachung }) {
  const { t } = useTranslation("wahlen");
  const userId = String(useAuthStore((s) => s.user?.id ?? ""));
  const aktionen = useBekanntmachungAktionen(bk.id);
  const [sprache, setSprache] = useState<Sprache>("de");
  const aktuell = bk.texte?.[sprache];
  const [betreff, setBetreff] = useState(aktuell?.betreff ?? "");
  const [html, setHtml] = useState(aktuell?.html ?? "");
  const [fehler, setFehler] = useState("");
  const bearbeitbar = bk.status === "entwurf";
  const merken = (e: unknown) => setFehler(extractApiErrorMessage(e, t("bekanntmachung.fehler")));

  // Beim Wechsel der Sprache oder nach einer Antwort des Servers die Felder neu füllen.
  useEffect(() => {
    setBetreff(aktuell?.betreff ?? "");
    setHtml(aktuell?.html ?? "");
  }, [aktuell?.betreff, aktuell?.html, sprache, bk.id]);

  async function aushang() {
    try {
      const blob = await bekanntmachungAushang(bk.id, sprache);
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch (e) {
      merken(e);
    }
  }

  const freigegeben = (bk.freigaben ?? []).map(String);
  const vorschau = DOMPurify.sanitize(platzhalter(html, wahl));

  return (
    <div className="space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm" data-testid="bk-editor">
      <div role="tablist" className="flex gap-1">
        {SPRACHEN.map((s) => (
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
            {s !== "de" && bk.texte?.[s] && !bk.geprueft?.[s as "fr" | "ar"] ? " •" : ""}
          </button>
        ))}
      </div>

      {sprache !== "de" && (
        <p className="rounded-cid bg-status-warningBg p-2 text-xs text-status-warningText">
          {t("bekanntmachung.maschinell")}
          {bk.veraltet?.includes(sprache) && ` ${t("bekanntmachung.veraltet")}`}
        </p>
      )}

      <input
        value={betreff}
        maxLength={200}
        disabled={!bearbeitbar}
        onChange={(e) => setBetreff(e.target.value)}
        aria-label={t("bekanntmachung.betreff")}
        placeholder={t("bekanntmachung.betreff")}
        dir={sprache === "ar" ? "rtl" : "ltr"}
        className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
      />
      <div dir={sprache === "ar" ? "rtl" : "ltr"}>
        <RichTextEditor
          value={html}
          onChange={setHtml}
          readOnly={!bearbeitbar}
          ariaLabel={t("bekanntmachung.text")}
        />
      </div>
      <p className="text-[11px] text-text-tertiary">{t("bekanntmachung.platzhalter")}</p>

      {bearbeitbar && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => aktionen.aendern.mutate({ sprache, betreff, html }, { onError: merken })}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white"
          >
            {t("bekanntmachung.speichern")}
          </button>
          {sprache === "de" && (
            <button
              type="button"
              onClick={() => aktionen.aktion.mutate("mustertext", { onError: merken })}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm"
            >
              {t("bekanntmachung.muster")}
            </button>
          )}
          {sprache !== "de" && bk.uebersetzung_moeglich && (
            <button
              type="button"
              onClick={() => aktionen.uebersetzen.mutate(sprache, { onError: merken })}
              disabled={aktionen.uebersetzen.isPending}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm"
            >
              {t("bekanntmachung.uebersetzen")}
            </button>
          )}
          {sprache !== "de" && bk.texte?.[sprache] && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(bk.geprueft?.[sprache as "fr" | "ar"])}
                onChange={(e) =>
                  aktionen.geprueft.mutate({ sprache, wert: e.target.checked }, { onError: merken })
                }
              />
              {t("bekanntmachung.geprueft")}
            </label>
          )}
        </div>
      )}

      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="mb-1 text-xs font-semibold uppercase text-text-tertiary">
          {t("bekanntmachung.kanaele")}
        </legend>
        {KANAELE.map((k) => (
          <label key={k} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={bk.kanaele.includes(k)}
              disabled={!bearbeitbar}
              onChange={(e) =>
                aktionen.aendern.mutate(
                  {
                    kanaele: e.target.checked
                      ? [...bk.kanaele, k]
                      : bk.kanaele.filter((x) => x !== k),
                  },
                  { onError: merken },
                )
              }
            />
            {t(`kanal.${k}`)}
          </label>
        ))}
        <span className="text-xs text-text-secondary">
          {t("bekanntmachung.versand", { datum: datum(bk.versand_am, true) })}
        </span>
      </fieldset>

      <details className="rounded-cid border border-text-tertiary/20 p-2">
        <summary className="cursor-pointer text-sm font-medium">
          {t("bekanntmachung.vorschau")}
        </summary>
        <div
          className="prose prose-sm mt-2 max-w-none"
          dir={sprache === "ar" ? "rtl" : "ltr"}
          dangerouslySetInnerHTML={{ __html: vorschau }}
        />
        <p className="mt-2 border-t border-text-tertiary/20 pt-2 text-[11px] text-text-tertiary">
          {t("bekanntmachung.fusszeile")}
        </p>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs">
          {t(`bekanntmachung_status.${bk.status}`)}
          {bk.status === "wartet" &&
            ` (${freigegeben.length}/${bk.freigaben_noetig ?? wahl.zustimmungen_noetig})`}
        </span>
        {bk.status === "entwurf" && (
          <button
            type="button"
            onClick={() => aktionen.aktion.mutate("vorlegen", { onError: merken })}
            className="rounded-cid border border-ca px-3 py-1.5 text-sm font-semibold text-ca"
          >
            {t("bekanntmachung.vorlegen")}
          </button>
        )}
        {bk.status === "wartet" && wahl.ist_ausschuss && !freigegeben.includes(userId) && (
          <button
            type="button"
            onClick={() => aktionen.aktion.mutate("freigeben", { onError: merken })}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-semibold text-white"
          >
            {t("bekanntmachung.freigeben")}
          </button>
        )}
        {(bk.status === "wartet" || bk.status === "freigegeben") && (
          <button
            type="button"
            onClick={() => aktionen.aktion.mutate("zurueck", { onError: merken })}
            className="text-xs underline"
          >
            {t("bekanntmachung.zurueck")}
          </button>
        )}
        {bk.kanaele.includes("print") && (
          <button type="button" onClick={aushang} className="text-xs text-ca underline">
            {t("bekanntmachung.aushang")}
          </button>
        )}
      </div>
      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {fehler}
        </p>
      )}
    </div>
  );
}

export default function BekanntmachungenTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const liste = useBekanntmachungen(wahl.id);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const aktiv = liste.data?.find((b) => b.id === gewaehlt) ?? liste.data?.[0];

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">{t("bekanntmachung.einleitung")}</p>
      {liste.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      <ul className="flex flex-wrap gap-2" aria-label={t("bekanntmachung.liste")}>
        {liste.data?.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setGewaehlt(b.id)}
              aria-pressed={aktiv?.id === b.id}
              className={`rounded-cid px-3 py-1.5 text-sm ${
                aktiv?.id === b.id ? "bg-ca text-white" : "border border-text-tertiary/30"
              }`}
            >
              {t(`bekanntmachung_art.${b.schluessel}`)} · {t(`bekanntmachung_status.${b.status}`)}
            </button>
          </li>
        ))}
      </ul>
      {aktiv && <Editor key={aktiv.id} wahl={wahl} bk={aktiv} />}
    </div>
  );
}
