/**
 * Mitteilungen (Ausschuss und Büro) : eine Übersicht aller Nachrichten zur Wahl in zeitlicher
 * Reihenfolge – Bekanntmachungen (Text vom Ausschuss), automatische Erinnerungen und die
 * Mitteilung zur Prüfentscheidung. Bei Erinnerungen lassen sich die Kanäle (App, E-Mail) wählen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMitteilungKanaele, useMitteilungsplan } from "../../hooks/useWahlen";
import type { MitteilungsZeile, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum } from "../../utils/wahlen";

const KANAELE: Array<"app" | "mail"> = ["app", "mail"];

function Zeile({
  zeile,
  zumBekanntmachungstext,
  onFehler,
}: {
  zeile: MitteilungsZeile;
  zumBekanntmachungstext?: () => void;
  onFehler: (e: unknown) => void;
}) {
  const { t } = useTranslation("wahlen");
  const aendern = useMitteilungKanaele();
  const name =
    zeile.typ === "bekanntmachung"
      ? t(`bekanntmachung_art.${zeile.art}`)
      : t(`mitteilungen.art.${zeile.art}`);

  return (
    <li
      className="space-y-1 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
      data-testid={`mitteilung-${zeile.typ}-${zeile.art}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {name}
          {zeile.bezug_name && <span className="font-normal"> – {zeile.bezug_name}</span>}
        </p>
        <span className="rounded-full bg-text-tertiary/10 px-2 py-0.5 text-[11px]">
          {t(`mitteilungen.status.${zeile.status}`)}
        </span>
      </div>
      <p className="text-xs text-text-secondary">
        {zeile.versand_am
          ? t("mitteilungen.wann", { datum: datum(zeile.versand_am, true) })
          : t("mitteilungen.sofort")}
        {" · "}
        {t("mitteilungen.an", { gruppe: t(`mitteilungen.zielgruppe.${zeile.zielgruppe}`) })}
        {zeile.anzahl !== null && ` · ${t("mitteilungen.anzahl", { n: zeile.anzahl })}`}
      </p>
      {zeile.typ === "erinnerung" && (
        <fieldset className="flex flex-wrap items-center gap-3 text-sm">
          <legend className="sr-only">{t("bekanntmachung.kanaele")}</legend>
          {KANAELE.map((k) => (
            <label key={k} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={zeile.kanaele.includes(k)}
                disabled={!zeile.kanaele_aenderbar || aendern.isPending}
                onChange={(e) =>
                  aendern.mutate(
                    {
                      id: zeile.id,
                      kanaele: e.target.checked
                        ? [...zeile.kanaele, k]
                        : zeile.kanaele.filter((x) => x !== k),
                    },
                    { onError: onFehler },
                  )
                }
              />
              {t(`kanal.${k}`)}
            </label>
          ))}
        </fieldset>
      )}
      {zeile.typ !== "erinnerung" && (
        <p className="text-xs text-text-tertiary">
          {zeile.kanaele.map((k) => t(`kanal.${k}`)).join(", ")}
        </p>
      )}
      {zeile.typ === "bekanntmachung" && zumBekanntmachungstext && (
        <button
          type="button"
          className="text-xs text-brand-primary underline"
          onClick={zumBekanntmachungstext}
        >
          {t("mitteilungen.text_bearbeiten")}
        </button>
      )}
      {zeile.typ === "ereignis" && (
        <p className="text-xs text-text-tertiary">{t("mitteilungen.ereignis_hinweis")}</p>
      )}
    </li>
  );
}

export default function MitteilungenTab({
  wahl,
  zuBekanntmachungen,
}: {
  wahl: Wahl;
  zuBekanntmachungen?: () => void;
}) {
  const { t } = useTranslation("wahlen");
  const plan = useMitteilungsplan(wahl.id);
  const [fehler, setFehler] = useState("");

  return (
    <div className="space-y-3" data-testid="mitteilungen-tab">
      <p className="text-sm text-text-secondary">{t("mitteilungen.einleitung")}</p>
      <p className="text-xs text-text-tertiary">{t("mitteilungen.datenschutz")}</p>
      {wahl.status === "entwurf" && (
        <p className="text-xs text-text-tertiary">{t("mitteilungen.entwurf")}</p>
      )}
      {plan.isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {fehler && (
        <p role="alert" className="text-sm text-red-600">
          {fehler}
        </p>
      )}
      <ul className="space-y-2" aria-label={t("tab.mitteilungen")}>
        {(plan.data ?? []).map((z) => (
          <Zeile
            key={`${z.typ}-${z.id || z.art}`}
            zeile={z}
            zumBekanntmachungstext={zuBekanntmachungen}
            onFehler={(e) => setFehler(extractApiErrorMessage(e, t("mitteilungen.fehler")))}
          />
        ))}
      </ul>
    </div>
  );
}
