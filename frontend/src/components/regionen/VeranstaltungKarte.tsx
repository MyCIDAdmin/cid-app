import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAnmeldungSetzen,
  useVeranstaltungAktion,
  useVeranstaltungLoeschen,
} from "../../hooks/useRegionen";
import type { Standort, Veranstaltung, VeranstaltungAktion } from "../../types/regionen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { klartext } from "../../utils/formattext";
import { formatDatum } from "../../utils/regionen";
import FormatierterText from "./FormatierterText";
import TeilenPanel from "./TeilenPanel";
import TeilnehmerPanel from "./TeilnehmerPanel";
import VeranstaltungFormular from "./VeranstaltungFormular";

const KNOPF = "rounded-cid px-3 py-1.5 text-xs font-semibold hover:bg-bg-secondary";
const FELD =
  "w-full rounded-cid border border-text-tertiary/20 bg-bg-secondary px-3 py-2 text-sm text-text-primary";

export default function VeranstaltungKarte({
  v,
  standorte,
  mitRegion = false,
}: {
  v: Veranstaltung;
  standorte: Standort[];
  mitRegion?: boolean;
}) {
  const { t, i18n } = useTranslation("regionen");
  const slug = v.region.slug;
  const aktion = useVeranstaltungAktion();
  const anmelden = useAnmeldungSetzen();
  const loeschen = useVeranstaltungLoeschen();

  const [bearbeiten, setBearbeiten] = useState(false);
  const [teilenOffen, setTeilenOffen] = useState(false);
  const [listeOffen, setListeOffen] = useState(false);
  const [grundOffen, setGrundOffen] = useState(false);
  const [absageFrage, setAbsageFrage] = useState(false);
  const [grund, setGrund] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const bei = (err: unknown) => setFehler(extractApiErrorMessage(err, t("fehler_speichern")));

  function ausfuehren(a: VeranstaltungAktion, extra?: { grund: string }) {
    setFehler(null);
    aktion.mutate(
      { slug, id: v.id, aktion: a, ...extra },
      {
        onSuccess: () => {
          setGrundOffen(false);
          setAbsageFrage(false);
          setGrund("");
        },
        onError: bei,
      },
    );
  }

  if (bearbeiten) {
    return (
      <li>
        <VeranstaltungFormular
          slug={slug}
          standorte={standorte}
          bestehend={v}
          onFertig={() => setBearbeiten(false)}
        />
      </li>
    );
  }

  const plaetze =
    v.max_teilnehmer !== null
      ? t("v_plaetze", { zahl: v.teilnehmer_zahl, max: v.max_teilnehmer })
      : t("v_zahl", { count: v.teilnehmer_zahl });

  return (
    <li className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      {v.bild_url && (
        <img src={v.bild_url} alt="" className="max-h-56 w-full rounded-cid object-cover" />
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-primary">{v.titel}</h3>
          <p className="text-sm text-text-secondary">
            {formatDatum(v.datum, i18n.language)}
            {v.uhrzeit ? `, ${v.uhrzeit}` : ""} · {v.ort}
            {v.standort ? ` (${v.standort.name})` : ""}
          </p>
          {mitRegion && <p className="text-xs text-text-tertiary">{v.region.name}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-bg-secondary px-2 py-0.5 text-xs font-semibold text-text-secondary">
          {t(`status_${v.status}`)}
        </span>
      </div>

      {klartext(v.beschreibung) && <FormatierterText text={v.beschreibung} />}
      <p className="text-xs text-text-tertiary">{plaetze}</p>

      {v.status === "zurueckgewiesen" && v.ablehngrund && (
        <p className="rounded-cid bg-status-dangerBg px-3 py-2 text-sm text-status-dangerText">
          {t("v_zurueckgewiesen", { grund: v.ablehngrund })}
        </p>
      )}
      {v.status === "abgeschlossen" && v.anwesende_zahl !== undefined && (
        <p className="text-xs text-text-tertiary">
          {t("v_anwesende", { count: v.anwesende_zahl })}
        </p>
      )}
      {fehler && <p className="text-sm text-status-dangerText">{fehler}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {v.status === "veroeffentlicht" && (v.kann_anmelden || v.angemeldet) && (
          <button
            type="button"
            disabled={anmelden.isPending}
            onClick={() => {
              setFehler(null);
              anmelden.mutate({ slug, id: v.id, aktiv: !v.angemeldet }, { onError: bei });
            }}
            className={
              v.angemeldet
                ? `${KNOPF} border border-text-tertiary/20 text-text-secondary`
                : "rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            }
          >
            {v.angemeldet ? t("v_abmelden") : t("v_anmelden")}
          </button>
        )}
        {v.status === "veroeffentlicht" && !v.kann_anmelden && !v.angemeldet && (
          <span className="text-xs text-text-tertiary">{t("v_nicht_anmeldbar")}</span>
        )}
        {v.darf_einreichen && (
          <button
            type="button"
            onClick={() => ausfuehren("einreichen")}
            disabled={aktion.isPending}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("v_einreichen")}
          </button>
        )}
        {v.darf_freigeben && (
          <>
            <button
              type="button"
              onClick={() => ausfuehren("freigeben")}
              disabled={aktion.isPending}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("v_freigeben")}
            </button>
            <button
              type="button"
              onClick={() => setGrundOffen(true)}
              className={`${KNOPF} text-status-dangerText`}
            >
              {t("v_zurueckweisen")}
            </button>
          </>
        )}
        {v.darf_abschliessen && (
          <button
            type="button"
            onClick={() => ausfuehren("abschliessen")}
            disabled={aktion.isPending}
            className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("v_abschliessen")}
          </button>
        )}
        {v.darf_bearbeiten && (
          <button
            type="button"
            onClick={() => setBearbeiten(true)}
            className={`${KNOPF} text-text-secondary`}
          >
            {t("v_bearbeiten")}
          </button>
        )}
        {v.darf_bearbeiten && (v.status === "entwurf" || v.status === "zurueckgewiesen") && (
          <button
            type="button"
            onClick={() => loeschen.mutate({ slug, id: v.id }, { onError: bei })}
            disabled={loeschen.isPending}
            className={`${KNOPF} text-status-dangerText`}
          >
            {t("v_loeschen")}
          </button>
        )}
        {v.darf_absagen && !absageFrage && (
          <button
            type="button"
            onClick={() => setAbsageFrage(true)}
            className={`${KNOPF} text-status-dangerText`}
          >
            {t("v_absagen")}
          </button>
        )}
        {v.teilen && (
          <button
            type="button"
            aria-expanded={teilenOffen}
            onClick={() => setTeilenOffen((o) => !o)}
            className={`${KNOPF} text-text-secondary`}
          >
            {t("v_teilen")}
          </button>
        )}
        {v.darf_teilnehmer_sehen && (
          <button
            type="button"
            aria-expanded={listeOffen}
            onClick={() => setListeOffen((o) => !o)}
            className={`${KNOPF} text-text-secondary`}
          >
            {t("v_teilnehmer")}
          </button>
        )}
      </div>

      {absageFrage && (
        <div className="flex flex-wrap items-center gap-2 rounded-cid bg-bg-secondary p-3">
          <span className="text-sm text-text-primary">{t("v_absagen_frage")}</span>
          <button
            type="button"
            onClick={() => ausfuehren("absagen")}
            disabled={aktion.isPending}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
          >
            {t("v_absagen_bestaetigen")}
          </button>
          <button
            type="button"
            onClick={() => setAbsageFrage(false)}
            className={`${KNOPF} text-text-secondary`}
          >
            {t("abbrechen")}
          </button>
        </div>
      )}
      {grundOffen && (
        <div className="flex flex-col gap-2">
          <input
            className={FELD}
            aria-label={t("v_grund")}
            placeholder={t("v_grund")}
            value={grund}
            maxLength={200}
            onChange={(e) => setGrund(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!grund.trim() || aktion.isPending}
              onClick={() => ausfuehren("zurueckweisen", { grund: grund.trim() })}
              className="rounded-cid bg-ca px-4 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
            >
              {t("v_zurueckweisen_bestaetigen")}
            </button>
            <button
              type="button"
              onClick={() => setGrundOffen(false)}
              className={`${KNOPF} text-text-secondary`}
            >
              {t("abbrechen")}
            </button>
          </div>
        </div>
      )}
      {teilenOffen && v.teilen && v.oeffentliche_url && (
        <TeilenPanel url={v.oeffentliche_url} texte={v.teilen} />
      )}
      {listeOffen && (
        <TeilnehmerPanel slug={slug} id={v.id} anwesenheitMoeglich={v.darf_anwesenheit} />
      )}
    </li>
  );
}
