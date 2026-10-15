/** Erfassung aller Personen eines Familienpakets beim Buchen (R35): weitere Erwachsene mit Name,
 * E-Mail und Beziehung, Kinder mit Name, Geburtsjahr und Beziehung. Die Zahlung folgt erst, wenn
 * alles eingetragen ist. Der Preis ist eine Vorschau aus den zugewiesenen Angeboten. */
import { useTranslation } from "react-i18next";

import {
  BEZIEHUNGEN,
  KIND_BEZIEHUNGEN,
  type Beziehung,
  type CampagneAdhesion,
  type OffreAdhesion,
} from "../../types/adhesion";
import {
  berechnePaket,
  formatEuro,
  type ErwachsenerEingabe,
  type FamilienEingabe,
  type KindEingabe,
} from "./familienpreis";

export type { ErwachsenerEingabe, FamilienEingabe, KindEingabe };

const FELD =
  "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm bg-bg-primary text-text-primary";
const LABEL = "mb-1 block text-[11px] text-text-tertiary";

export default function FamilienErfassung({
  offre,
  campagne,
  wert,
  onChange,
}: {
  offre: OffreAdhesion;
  campagne: CampagneAdhesion;
  wert: FamilienEingabe;
  onChange: (w: FamilienEingabe) => void;
}) {
  const { t } = useTranslation("adhesions");
  const paket = berechnePaket(offre, campagne.offres, wert.erwachsene.length, wert.kinder.length);
  const minJahr = campagne.annee - campagne.familie_max_alter_kind;

  function erwAendern(i: number, teil: Partial<ErwachsenerEingabe>) {
    onChange({
      ...wert,
      erwachsene: wert.erwachsene.map((e, n) => (n === i ? { ...e, ...teil } : e)),
    });
  }
  function kindAendern(i: number, teil: Partial<KindEingabe>) {
    onChange({ ...wert, kinder: wert.kinder.map((k, n) => (n === i ? { ...k, ...teil } : k)) });
  }

  return (
    <div className="mb-3 space-y-3 rounded-cid bg-bg-tertiary/40 p-3">
      <p className="text-xs text-text-secondary">{t("familie.erfassung_hinweis")}</p>

      <section aria-label={t("familie.erwachsene_titel")}>
        <h3 className="text-xs font-semibold uppercase text-text-tertiary">
          {t("familie.erwachsene_titel")} ({wert.erwachsene.length}/{offre.max_erwachsene})
        </h3>
        {wert.erwachsene.map((e, i) => (
          <div
            key={i}
            className="mt-2 grid gap-2 rounded-cid border border-text-tertiary/15 p-2 sm:grid-cols-2"
          >
            <div>
              <label className={LABEL} htmlFor={`erw-vorname-${i}`}>
                {t("familie.vorname")}
              </label>
              <input
                id={`erw-vorname-${i}`}
                className={FELD}
                maxLength={100}
                value={e.vorname}
                onChange={(ev) => erwAendern(i, { vorname: ev.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`erw-nachname-${i}`}>
                {t("familie.nachname")}
              </label>
              <input
                id={`erw-nachname-${i}`}
                className={FELD}
                maxLength={100}
                value={e.nachname}
                onChange={(ev) => erwAendern(i, { nachname: ev.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`erw-email-${i}`}>
                {t("familie.email")}
              </label>
              <input
                id={`erw-email-${i}`}
                type="email"
                className={FELD}
                value={e.email}
                onChange={(ev) => erwAendern(i, { email: ev.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`erw-beziehung-${i}`}>
                {t("familie.beziehung")}
              </label>
              <select
                id={`erw-beziehung-${i}`}
                className={FELD}
                value={e.beziehung}
                onChange={(ev) => erwAendern(i, { beziehung: ev.target.value as Beziehung })}
              >
                <option value="">{t("familie.beziehung_waehlen")}</option>
                {BEZIEHUNGEN.map((b) => (
                  <option key={b} value={b}>
                    {t(`familie.beziehung_${b}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() =>
                  onChange({ ...wert, erwachsene: wert.erwachsene.filter((_, n) => n !== i) })
                }
                className="text-xs text-status-dangerText hover:underline"
              >
                {t("familie.person_entfernen")}
              </button>
            </div>
          </div>
        ))}
        {wert.erwachsene.length < offre.max_erwachsene && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...wert,
                erwachsene: [
                  ...wert.erwachsene,
                  { vorname: "", nachname: "", email: "", beziehung: "" },
                ],
              })
            }
            className="mt-2 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs hover:bg-bg-tertiary"
          >
            {t("familie.erwachsenen_hinzufuegen")}
          </button>
        )}
        {wert.erwachsene.length > 0 && (
          <p className="mt-1 text-[11px] text-text-tertiary">{t("familie.erwachsene_hinweis")}</p>
        )}
      </section>

      <section aria-label={t("familie.kinder_titel_kurz")}>
        <h3 className="text-xs font-semibold uppercase text-text-tertiary">
          {t("familie.kinder_titel_kurz")} ({wert.kinder.length}/{offre.max_kinder})
        </h3>
        <p className="text-[11px] text-text-tertiary">
          {t("familie.kinder_alter_hinweis", { alter: campagne.familie_max_alter_kind })}
        </p>
        {wert.kinder.map((k, i) => (
          <div
            key={i}
            className="mt-2 grid gap-2 rounded-cid border border-text-tertiary/15 p-2 sm:grid-cols-2"
          >
            <div>
              <label className={LABEL} htmlFor={`kind-vorname-${i}`}>
                {t("familie.vorname")}
              </label>
              <input
                id={`kind-vorname-${i}`}
                className={FELD}
                maxLength={100}
                value={k.vorname}
                onChange={(ev) => kindAendern(i, { vorname: ev.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`kind-nachname-${i}`}>
                {t("familie.nachname")}
              </label>
              <input
                id={`kind-nachname-${i}`}
                className={FELD}
                maxLength={100}
                value={k.nachname}
                onChange={(ev) => kindAendern(i, { nachname: ev.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`kind-jahr-${i}`}>
                {t("familie.geburtsjahr")}
              </label>
              <input
                id={`kind-jahr-${i}`}
                type="number"
                min={minJahr}
                max={campagne.annee}
                className={FELD}
                value={k.geburtsjahr}
                onChange={(ev) => kindAendern(i, { geburtsjahr: ev.target.value })}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor={`kind-beziehung-${i}`}>
                {t("familie.beziehung")}
              </label>
              <select
                id={`kind-beziehung-${i}`}
                className={FELD}
                value={k.beziehung}
                onChange={(ev) => kindAendern(i, { beziehung: ev.target.value as Beziehung })}
              >
                {KIND_BEZIEHUNGEN.map((b) => (
                  <option key={b} value={b}>
                    {t(`familie.beziehung_${b}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => onChange({ ...wert, kinder: wert.kinder.filter((_, n) => n !== i) })}
                className="text-xs text-status-dangerText hover:underline"
              >
                {t("familie.person_entfernen")}
              </button>
            </div>
          </div>
        ))}
        {wert.kinder.length < offre.max_kinder && (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...wert,
                kinder: [
                  ...wert.kinder,
                  { vorname: "", nachname: "", geburtsjahr: "", beziehung: "kind" },
                ],
              })
            }
            className="mt-2 rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs hover:bg-bg-tertiary"
          >
            {t("familie.kind_hinzufuegen")}
          </button>
        )}
        {wert.kinder.length > 0 && (
          <label className="mt-2 flex items-start gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={wert.einwilligung}
              onChange={(ev) => onChange({ ...wert, einwilligung: ev.target.checked })}
              className="mt-0.5"
            />
            <span>{t("familie.einwilligung")}</span>
          </label>
        )}
      </section>

      {paket ? (
        <div className="border-t border-text-tertiary/10 pt-2 text-sm">
          <ul className="space-y-0.5 text-xs text-text-secondary">
            {paket.positionen.map((p, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>
                  {t(`familie.rolle_${p.rolle}`)} · {p.angebot.nom}
                </span>
                <span className="tabular-nums">{formatEuro(p.anteil)}</span>
              </li>
            ))}
          </ul>
          {paket.rabattPct > 0 && (
            <p className="mt-1 text-xs text-text-tertiary">
              {t("familie.rabatt_zeile", {
                pct: paket.rabattPct,
                liste: formatEuro(paket.liste),
              })}
            </p>
          )}
          <p className="mt-1 font-semibold text-text-primary">
            {t("familie.gesamtpreis", { preis: formatEuro(paket.gesamt) })}
          </p>
        </div>
      ) : (
        <p className="text-xs text-status-dangerText">{t("familie.nicht_konfiguriert")}</p>
      )}
    </div>
  );
}
