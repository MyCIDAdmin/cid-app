/**
 * Formular „Umfrage anlegen/bearbeiten“ (Release 11, Verwaltung): Titel, Beschreibung, Zielgruppe,
 * anonym/namentlich, Ergebnis-Sichtbarkeit, Frist und Fragen (Einzel-/Mehrfachauswahl, Freitext)
 * mit Thema (Gruppierung) und optionalem Kommentarfeld ; Übersetzungen (DeepL) lassen sich korrigieren.
 * Nach der ersten Teilnahme sind Fragen, Zielgruppe und Anonymität gesperrt (Backend-Regel).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  ErgebnisModus,
  FrageTyp,
  Umfrage,
  UmfrageFrage,
  UmfragePayload,
  Zielgruppe,
} from "../../types/umfragen";
import UebersetzungenButton from "../ui/UebersetzungenButton";
import { vonLokalInput, zuLokalInput } from "../../utils/umfragen";

const FELD = "w-full rounded-cid border border-text-tertiary/30 bg-bg-primary px-2 py-1.5 text-sm";

function leereFrage(): UmfrageFrage {
  return {
    text: "",
    thema: "",
    typ: "einzel",
    pflicht: true,
    freitext_zusatz: false,
    optionen: [{ text: "" }, { text: "" }],
  };
}

interface Props {
  umfrage?: Umfrage;
  speichernLaeuft: boolean;
  fehler: string;
  onSpeichern: (payload: UmfragePayload, bild: File | null | undefined) => void;
  onAbbrechen: () => void;
}

export default function UmfrageFormular({
  umfrage,
  speichernLaeuft,
  fehler,
  onSpeichern,
  onAbbrechen,
}: Props) {
  const { t } = useTranslation("umfragen");
  const gesperrt = (umfrage?.anzahl_teilnahmen ?? 0) > 0;
  const [titel, setTitel] = useState(umfrage?.titel ?? "");
  const [beschreibung, setBeschreibung] = useState(umfrage?.beschreibung ?? "");
  const [zielgruppe, setZielgruppe] = useState<Zielgruppe>(umfrage?.zielgruppe ?? "mitglieder");
  const [anonym, setAnonym] = useState(umfrage?.anonym ?? true);
  const [modus, setModus] = useState<ErgebnisModus>(umfrage?.ergebnis_modus ?? "nach_frist");
  const [frist, setFrist] = useState(umfrage ? zuLokalInput(umfrage.frist) : "");
  const [fragen, setFragen] = useState<UmfrageFrage[]>(umfrage?.fragen ?? [leereFrage()]);
  const [bild, setBild] = useState<File | null | undefined>(undefined);

  const aendereFrage = (index: number, teil: Partial<UmfrageFrage>) =>
    setFragen((alt) => alt.map((f, i) => (i === index ? { ...f, ...teil } : f)));
  const aendereOption = (fi: number, oi: number, text: string) =>
    setFragen((alt) =>
      alt.map((f, i) =>
        i === fi
          ? { ...f, optionen: f.optionen.map((o, j) => (j === oi ? { ...o, text } : o)) }
          : f,
      ),
    );

  function aenderTyp(index: number, typ: FrageTyp) {
    aendereFrage(index, {
      typ,
      ...(typ === "freitext" ? { freitext_zusatz: false } : {}),
      optionen:
        typ === "freitext"
          ? []
          : fragen[index].optionen.length >= 2
            ? fragen[index].optionen
            : [{ text: "" }, { text: "" }],
    });
  }

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (!titel.trim() || !frist) return;
    const bereinigt = fragen
      .filter((f) => f.text.trim())
      .map((f) => ({
        ...f,
        text: f.text.trim(),
        thema: (f.thema ?? "").trim(),
        optionen:
          f.typ === "freitext"
            ? []
            : f.optionen
                .filter((o) => o.text.trim())
                .map((o) => ({ ...(o.id ? { id: o.id } : {}), text: o.text.trim() })),
      }));
    onSpeichern(
      {
        titel: titel.trim(),
        beschreibung,
        zielgruppe,
        anonym,
        ergebnis_modus: modus,
        frist: vonLokalInput(frist),
        ...(gesperrt ? {} : { fragen: bereinigt }),
      },
      bild,
    );
  }

  return (
    <form
      onSubmit={absenden}
      className="space-y-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
      data-testid="umfrage-formular"
    >
      <h2 className="text-sm font-bold text-text-primary">
        {t(umfrage ? "admin.bearbeiten" : "admin.neu")}
      </h2>
      {gesperrt && <p className="text-xs text-status-warningText">{t("admin.gesperrt")}</p>}

      <input
        value={titel}
        onChange={(e) => setTitel(e.target.value)}
        maxLength={200}
        aria-label={t("admin.titel")}
        placeholder={t("admin.titel")}
        className={FELD}
      />
      {umfrage && (
        <UebersetzungenButton
          modell="umfragen.umfrage"
          objektId={umfrage.id}
          className="text-xs text-ca underline"
        />
      )}
      <textarea
        value={beschreibung}
        onChange={(e) => setBeschreibung(e.target.value)}
        rows={3}
        aria-label={t("admin.beschreibung")}
        placeholder={t("admin.beschreibung")}
        className={FELD}
      />
      <label className="block text-xs text-text-secondary">
        {t("admin.bild")}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setBild(e.target.files?.[0] ?? undefined)}
          className="mt-1 block w-full text-xs"
        />
      </label>
      {umfrage?.bild && bild === undefined && (
        <button
          type="button"
          onClick={() => setBild(null)}
          className="text-xs text-status-dangerText underline"
        >
          {t("admin.bild_entfernen")}
        </button>
      )}
      {bild === null && (
        <p className="text-xs text-text-tertiary">{t("admin.bild_wird_entfernt")}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-text-secondary">
          {t("admin.zielgruppe")}
          <select
            value={zielgruppe}
            disabled={gesperrt}
            onChange={(e) => setZielgruppe(e.target.value as Zielgruppe)}
            className={FELD}
          >
            <option value="mitglieder">{t("zielgruppe.mitglieder")}</option>
            <option value="konten">{t("zielgruppe.konten")}</option>
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          {t("admin.ergebnis_modus")}
          <select
            value={modus}
            onChange={(e) => setModus(e.target.value as ErgebnisModus)}
            className={FELD}
          >
            <option value="admin">{t("modus.admin")}</option>
            <option value="nach_frist">{t("modus.nach_frist")}</option>
            <option value="live">{t("modus.live")}</option>
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          {t("admin.frist")}
          <input
            type="datetime-local"
            value={frist}
            onChange={(e) => setFrist(e.target.value)}
            className={FELD}
          />
        </label>
        <label className="flex items-center gap-2 pt-5 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={anonym}
            disabled={gesperrt}
            onChange={(e) => setAnonym(e.target.checked)}
          />
          {t("admin.anonym")}
        </label>
      </div>

      {!gesperrt && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase text-text-tertiary">{t("admin.fragen")}</h3>
          <datalist id="umfrage-themen">
            {Array.from(new Set(fragen.map((f) => (f.thema ?? "").trim()).filter(Boolean))).map(
              (thema) => (
                <option key={thema} value={thema} />
              ),
            )}
          </datalist>
          {fragen.map((frage, fi) => (
            <div key={fi} className="space-y-2 rounded-cid border border-text-tertiary/20 p-2">
              <div className="flex flex-wrap gap-2">
                <input
                  value={frage.text}
                  onChange={(e) => aendereFrage(fi, { text: e.target.value })}
                  maxLength={500}
                  aria-label={t("admin.frage_text", { nr: fi + 1 })}
                  placeholder={t("admin.frage_text", { nr: fi + 1 })}
                  className={`${FELD} min-w-0 flex-1`}
                />
                <select
                  value={frage.typ}
                  onChange={(e) => aenderTyp(fi, e.target.value as FrageTyp)}
                  aria-label={t("admin.frage_typ")}
                  className={`${FELD} w-auto`}
                >
                  <option value="einzel">{t("typ.einzel")}</option>
                  <option value="mehrfach">{t("typ.mehrfach")}</option>
                  <option value="freitext">{t("typ.freitext")}</option>
                </select>
              </div>
              <input
                value={frage.thema ?? ""}
                onChange={(e) => aendereFrage(fi, { thema: e.target.value })}
                maxLength={120}
                list="umfrage-themen"
                aria-label={t("admin.thema")}
                placeholder={t("admin.thema")}
                className={FELD}
              />
              {frage.typ !== "freitext" && (
                <div className="space-y-1">
                  {frage.optionen.map((option, oi) => (
                    <div key={oi} className="flex gap-1">
                      <input
                        value={option.text}
                        onChange={(e) => aendereOption(fi, oi, e.target.value)}
                        maxLength={255}
                        aria-label={t("admin.option", { nr: oi + 1 })}
                        placeholder={t("admin.option", { nr: oi + 1 })}
                        className={FELD}
                      />
                      {frage.optionen.length > 2 && (
                        <button
                          type="button"
                          aria-label={t("admin.option_entfernen")}
                          onClick={() =>
                            aendereFrage(fi, {
                              optionen: frage.optionen.filter((_, j) => j !== oi),
                            })
                          }
                          className="px-2 text-text-tertiary"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      aendereFrage(fi, { optionen: [...frage.optionen, { text: "" }] })
                    }
                    className="text-xs text-ca underline"
                  >
                    + {t("admin.option_hinzu")}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1 text-text-secondary">
                    <input
                      type="checkbox"
                      checked={frage.pflicht}
                      onChange={(e) => aendereFrage(fi, { pflicht: e.target.checked })}
                    />
                    {t("admin.pflicht")}
                  </label>
                  {frage.typ !== "freitext" && (
                    <label className="flex items-center gap-1 text-text-secondary">
                      <input
                        type="checkbox"
                        checked={frage.freitext_zusatz ?? false}
                        onChange={(e) => aendereFrage(fi, { freitext_zusatz: e.target.checked })}
                      />
                      {t("admin.freitext_zusatz")}
                    </label>
                  )}
                  {frage.id && (
                    <UebersetzungenButton
                      modell="umfragen.umfragefrage"
                      objektId={frage.id}
                      className="text-ca underline"
                    />
                  )}
                </span>
                {fragen.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setFragen((alt) => alt.filter((_, i) => i !== fi))}
                    className="text-status-dangerText underline"
                  >
                    {t("admin.frage_entfernen")}
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setFragen((alt) => [...alt, leereFrage()])}
            className="rounded-cid border border-ca px-3 py-1 text-xs font-medium text-ca"
          >
            + {t("admin.frage_hinzu")}
          </button>
        </div>
      )}

      {fehler && <p className="text-xs text-status-dangerText">{fehler}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={speichernLaeuft || !titel.trim() || !frist}
          className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("admin.speichern")}
        </button>
        <button
          type="button"
          onClick={onAbbrechen}
          className="rounded-cid px-3 py-1.5 text-sm text-text-secondary"
        >
          {t("admin.abbrechen")}
        </button>
      </div>
    </form>
  );
}
