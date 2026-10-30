/**
 * „Reise planen“ in zwei Taps : aus der Spielkarte öffnet sich ein Fenster, in dem Spiel, Ort und
 * Datum schon feststehen. Man wählt nur noch, wer mitdarf, wie man beitritt und welche Vorlage
 * gilt. Danach kommt sofort das Einladen. Die ausführliche Einrichtung bleibt im Reiseraum.
 */
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { hintergrundKlick, useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import { useReiseAnlegen, useStadionVorschlag } from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import type { Beitritt, Sichtbarkeit } from "../../types/reisen";
import ShareButton from "../ui/ShareButton";
import { Fehler, KNOPF, KNOPF_LEISE } from "./ui";

export interface PlanSpiel {
  rencontre: string;
  gegner: string;
  heim: boolean;
  datum: string;
}

function Auswahl<T extends string>({
  label,
  wert,
  optionen,
  onChange,
}: {
  label: string;
  wert: T;
  optionen: { id: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {optionen.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={o.id === wert}
            onClick={() => onChange(o.id)}
            className={`min-h-[44px] rounded-cid border px-3 text-sm font-medium transition-colors ${o.id === wert ? "border-ca bg-ca/10 text-ca" : "border-text-tertiary/30 bg-bg-secondary text-text-primary hover:bg-bg-tertiary"}`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReisePlanenSheet({
  spiel,
  onClose,
}: {
  spiel: PlanSpiel;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("reisen");
  const titelId = useId();
  const vorschlag = useStadionVorschlag(spiel.rencontre).data;
  const anlegen = useReiseAnlegen();
  const [sichtbarkeit, setSichtbarkeit] = useState<Sichtbarkeit>("mitglieder");
  const [beitritt, setBeitritt] = useState<Beitritt>("offen");
  const [vorlage, setVorlage] = useState(spiel.heim ? "wochenende" : "auswaerts_ausland");
  const [angelegt, setAngelegt] = useState<string | null>(null);
  const [fehler, setFehler] = useState("");
  useEscapeSchliessen(onClose);

  const ort = vorschlag?.stadt || spiel.gegner;
  const datum = new Date(spiel.datum).toLocaleDateString(i18n.language, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  function starten() {
    setFehler("");
    anlegen.mutate(
      { rencontre: spiel.rencontre, sichtbarkeit, beitritt, vorlage },
      {
        onSuccess: (r) => setAngelegt((r as { id: string }).id),
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      {...hintergrundKlick(onClose)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        className="max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-[22px] bg-bg-primary p-5 shadow-xl sm:rounded-[22px]"
      >
        {angelegt ? (
          <>
            <p
              role="status"
              className="rounded-cid bg-status-successBg px-3 py-2 text-sm font-semibold text-status-successText"
            >
              ✓ {t("planen.angelegt")}
            </p>
            <h2 id={titelId} className="text-lg font-semibold">
              {t("planen.einladen_titel")}
            </h2>
            {sichtbarkeit === "mitglieder" && (
              <ShareButton
                path={`/reisen/${angelegt}`}
                titre={t("planen.teilen_titel", { ort })}
                className="w-full"
              />
            )}
            <p className="text-xs text-text-secondary">{t("planen.vorbereitet")}</p>
            <div className="flex flex-wrap gap-2">
              <Link to={`/reisen/${angelegt}?tab=einstellungen`} className={KNOPF}>
                {t("planen.zum_raum")}
              </Link>
              <button type="button" className={KNOPF_LEISE} onClick={onClose}>
                {t("planen.schliessen")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titelId} className="text-lg font-semibold">
              {t("planen.titel", { ort })}
            </h2>
            <div className="rounded-cid bg-bg-secondary p-3 text-sm" data-testid="plan-spiel">
              <p className="text-[11px] text-text-tertiary">{t("planen.uebernommen")}</p>
              <p className="font-semibold">
                {spiel.heim
                  ? t("start.paarung_heim", { gegner: spiel.gegner })
                  : t("start.paarung_auswaerts", { gegner: spiel.gegner })}
              </p>
              <p className="text-xs text-text-secondary">
                {datum}
                {vorschlag?.stadion ? ` · ${vorschlag.stadion}` : ""}
              </p>
            </div>
            <Auswahl
              label={t("planen.wer")}
              wert={sichtbarkeit}
              onChange={setSichtbarkeit}
              optionen={[
                { id: "mitglieder", text: t("planen.wer_mitglieder") },
                { id: "eingeladen", text: t("planen.wer_eingeladen") },
              ]}
            />
            <Auswahl
              label={t("planen.beitritt")}
              wert={beitritt}
              onChange={setBeitritt}
              optionen={[
                { id: "offen", text: t("planen.beitritt_offen") },
                { id: "genehmigung", text: t("planen.beitritt_genehmigung") },
              ]}
            />
            <Auswahl
              label={t("planen.vorlage")}
              wert={vorlage}
              onChange={setVorlage}
              optionen={[
                {
                  id: spiel.heim ? "wochenende" : "auswaerts_ausland",
                  text: t(spiel.heim ? "vorlage.wochenende" : "vorlage.auswaerts_ausland"),
                },
                { id: "leer", text: t("vorlage.leer") },
              ]}
            />
            <Fehler text={fehler} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${KNOPF} min-h-[44px] flex-1`}
                disabled={anlegen.isPending}
                onClick={starten}
              >
                {t("planen.starten")}
              </button>
              <button type="button" className={`${KNOPF_LEISE} min-h-[44px]`} onClick={onClose}>
                {t("planen.schliessen")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
