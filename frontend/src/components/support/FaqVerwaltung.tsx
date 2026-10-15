/** Büro : häufige Fragen anlegen, ändern, ein-/ausblenden und löschen (Deutsch, Französisch). */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useFaqAendern,
  useFaqAnlegen,
  useFaqLoeschen,
  useFaqVerwaltung,
} from "../../hooks/useSupport";
import { TICKET_KATEGORIEN, type FaqEingabe, type FaqEintrag } from "../../types/support";
import { FELD, KNOPF, KNOPF_LEISE } from "./gemeinsam";

const LEER: FaqEingabe = {
  frage_de: "",
  frage_fr: "",
  antwort_de: "",
  antwort_fr: "",
  kategorie: "sonstiges",
  reihenfolge: 100,
  aktiv: true,
};

function Formular({
  start,
  onSpeichern,
  onAbbruch,
  laeuft,
  fehler,
}: {
  start: FaqEingabe;
  onSpeichern: (e: FaqEingabe) => void;
  onAbbruch: () => void;
  laeuft: boolean;
  fehler: boolean;
}) {
  const { t } = useTranslation("support");
  const [e, setE] = useState<FaqEingabe>(start);
  const feld = (name: keyof FaqEingabe, label: string, lang = false) => (
    <label className="text-xs font-semibold text-text-tertiary">
      {label}
      {lang ? (
        <textarea
          className={`${FELD} mt-1 min-h-24`}
          maxLength={3000}
          value={String(e[name] ?? "")}
          onChange={(ev) => setE({ ...e, [name]: ev.target.value })}
        />
      ) : (
        <input
          className={`${FELD} mt-1`}
          maxLength={200}
          value={String(e[name] ?? "")}
          onChange={(ev) => setE({ ...e, [name]: ev.target.value })}
        />
      )}
    </label>
  );
  return (
    <form
      className="flex flex-col gap-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
      onSubmit={(ev) => {
        ev.preventDefault();
        onSpeichern(e);
      }}
    >
      {feld("frage_de", t("faqv.frage_de"))}
      {feld("antwort_de", t("faqv.antwort_de"), true)}
      {feld("frage_fr", t("faqv.frage_fr"))}
      {feld("antwort_fr", t("faqv.antwort_fr"), true)}
      <p className="text-xs text-text-tertiary">{t("faqv.fr_hinweis")}</p>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-semibold text-text-tertiary">
          {t("ticket.kategorie")}
          <select
            className={`${FELD} mt-1`}
            value={e.kategorie}
            onChange={(ev) => setE({ ...e, kategorie: ev.target.value as FaqEintrag["kategorie"] })}
          >
            {TICKET_KATEGORIEN.map((k) => (
              <option key={k} value={k}>
                {t(`kategorie.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-text-tertiary">
          {t("faqv.reihenfolge")}
          <input
            type="number"
            className={`${FELD} mt-1 w-28`}
            value={e.reihenfolge ?? 100}
            onChange={(ev) => setE({ ...e, reihenfolge: Number(ev.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={e.aktiv ?? true}
            onChange={(ev) => setE({ ...e, aktiv: ev.target.checked })}
          />
          {t("faqv.aktiv")}
        </label>
      </div>
      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {t("ticket.fehler")}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className={KNOPF}
          disabled={laeuft || !e.frage_de?.trim() || !e.antwort_de?.trim()}
        >
          {t("faqv.speichern")}
        </button>
        <button type="button" className={KNOPF_LEISE} onClick={onAbbruch}>
          {t("abbrechen")}
        </button>
      </div>
    </form>
  );
}

export default function FaqVerwaltung() {
  const { t } = useTranslation("support");
  const { data, isLoading, isError } = useFaqVerwaltung(true);
  const anlegen = useFaqAnlegen();
  const aendern = useFaqAendern();
  const loeschen = useFaqLoeschen();
  const [bearbeite, setBearbeite] = useState<FaqEintrag | "neu" | null>(null);
  const [loeschId, setLoeschId] = useState<number | null>(null);

  if (bearbeite !== null) {
    const neu = bearbeite === "neu";
    return (
      <Formular
        start={neu ? LEER : bearbeite}
        laeuft={anlegen.isPending || aendern.isPending}
        fehler={anlegen.isError || aendern.isError}
        onAbbruch={() => setBearbeite(null)}
        onSpeichern={(eingabe) => {
          const fertig = { onSuccess: () => setBearbeite(null) };
          if (neu) anlegen.mutate(eingabe, fertig);
          else aendern.mutate({ id: bearbeite.id, eingabe }, fertig);
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-text-primary">{t("tab.faq_verwalten")}</h2>
        <button type="button" className={KNOPF} onClick={() => setBearbeite("neu")}>
          {t("faqv.neu")}
        </button>
      </div>
      {isLoading && <p className="text-sm text-text-tertiary">{t("laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("fehler_laden")}</p>}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((f) => (
          <li
            key={f.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-cid border border-text-tertiary/15 bg-bg-primary p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">{f.frage_de}</p>
              <p className="text-xs text-text-tertiary">
                {t(`kategorie.${f.kategorie}`)} · {f.frage_fr ? "DE · FR" : "DE"} ·{" "}
                {f.aktiv ? t("faqv.sichtbar") : t("faqv.ausgeblendet")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={KNOPF_LEISE}
                onClick={() => aendern.mutate({ id: f.id, eingabe: { aktiv: !f.aktiv } })}
              >
                {f.aktiv ? t("faqv.ausblenden") : t("faqv.einblenden")}
              </button>
              <button type="button" className={KNOPF_LEISE} onClick={() => setBearbeite(f)}>
                {t("faqv.bearbeiten")}
              </button>
              {loeschId === f.id ? (
                <button
                  type="button"
                  className="rounded-cid bg-status-dangerText px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => loeschen.mutate(f.id, { onSuccess: () => setLoeschId(null) })}
                >
                  {t("faqv.wirklich")}
                </button>
              ) : (
                <button type="button" className={KNOPF_LEISE} onClick={() => setLoeschId(f.id)}>
                  {t("faqv.loeschen")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
