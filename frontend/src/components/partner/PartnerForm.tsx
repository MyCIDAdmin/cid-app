import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  Partner,
  PartnerKategorie,
  PartnerSchreibDaten,
  PartnerTyp,
} from "../../types/partner";
import { kategorieName } from "../../utils/partner";

const FELD =
  "w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm disabled:opacity-60";
const LABEL = "mb-1 block text-[10px] uppercase text-text-tertiary";

interface Props {
  partner?: Partner;
  kategorien: PartnerKategorie[];
  /** Nur-Lese-Ansicht (Rolle RH). */
  readOnly?: boolean;
  pending?: boolean;
  fehler?: string | null;
  onSubmit: (daten: PartnerSchreibDaten) => void;
  onCancel?: () => void;
}

type TextFeld =
  | "nom"
  | "email"
  | "telefon"
  | "website"
  | "adresse"
  | "code_postal"
  | "ville"
  | "pays"
  | "ust_id"
  | "notizen";

export default function PartnerForm({
  partner,
  kategorien,
  readOnly = false,
  pending = false,
  fehler,
  onSubmit,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation("partner");
  const [werte, setWerte] = useState({
    nom: partner?.nom ?? "",
    typ: (partner?.typ ?? "partner") as PartnerTyp,
    bevorzugt: partner?.bevorzugt ?? false,
    kategorien: partner?.kategorien ?? [],
    email: partner?.email ?? "",
    telefon: partner?.telefon ?? "",
    website: partner?.website ?? "",
    adresse: partner?.adresse ?? "",
    code_postal: partner?.code_postal ?? "",
    ville: partner?.ville ?? "",
    pays: partner?.pays ?? "Deutschland",
    ust_id: partner?.ust_id ?? "",
    zahlungsziel_tage: partner?.zahlungsziel_tage?.toString() ?? "",
    notizen: partner?.notizen ?? "",
  });

  function setze<K extends keyof typeof werte>(k: K, v: (typeof werte)[K]) {
    setWerte((alt) => ({ ...alt, [k]: v }));
  }

  function kategorieUmschalten(id: string) {
    setze(
      "kategorien",
      werte.kategorien.includes(id)
        ? werte.kategorien.filter((x) => x !== id)
        : [...werte.kategorien, id],
    );
  }

  function absenden(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      ...werte,
      zahlungsziel_tage: werte.zahlungsziel_tage === "" ? null : Number(werte.zahlungsziel_tage),
    });
  }

  function textFeld(feld: TextFeld, typ = "text", breit = false) {
    return (
      <div className={breit ? "sm:col-span-2" : undefined}>
        <label htmlFor={`partner-${feld}`} className={LABEL}>
          {t(`feld_${feld}`)}
        </label>
        <input
          id={`partner-${feld}`}
          type={typ}
          value={werte[feld]}
          required={feld === "nom"}
          disabled={readOnly}
          onChange={(e) => setze(feld, e.target.value)}
          className={FELD}
        />
      </div>
    );
  }

  const sichtbareKategorien = kategorien.filter((k) => k.actif || werte.kategorien.includes(k.id));

  return (
    <form onSubmit={absenden} className="grid gap-3 sm:grid-cols-2">
      {textFeld("nom", "text", true)}
      <div>
        <label htmlFor="partner-typ" className={LABEL}>
          {t("feld_typ")}
        </label>
        <select
          id="partner-typ"
          value={werte.typ}
          disabled={readOnly}
          onChange={(e) => setze("typ", e.target.value as PartnerTyp)}
          className={FELD}
        >
          <option value="partner">{t("typ_partner")}</option>
          <option value="lieferant">{t("typ_lieferant")}</option>
          <option value="beides">{t("typ_beides")}</option>
        </select>
      </div>
      <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
        <input
          type="checkbox"
          checked={werte.bevorzugt}
          disabled={readOnly}
          onChange={(e) => setze("bevorzugt", e.target.checked)}
        />
        {t("feld_bevorzugt")}
      </label>

      <div className="sm:col-span-2">
        <span className={LABEL}>{t("feld_kategorien")}</span>
        <div className="flex flex-wrap gap-1.5">
          {sichtbareKategorien.map((k) => {
            const aktiv = werte.kategorien.includes(k.id);
            return (
              <button
                key={k.id}
                type="button"
                aria-pressed={aktiv}
                disabled={readOnly}
                onClick={() => kategorieUmschalten(k.id)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  aktiv
                    ? "border-brand-red bg-brand-red/10 font-medium"
                    : "border-text-tertiary/30 text-text-secondary hover:bg-bg-tertiary"
                }`}
              >
                {kategorieName(k, i18n.language)}
              </button>
            );
          })}
        </div>
      </div>

      {textFeld("email", "email")}
      {textFeld("telefon", "tel")}
      {textFeld("website", "url")}
      {textFeld("adresse", "text", true)}
      {textFeld("code_postal")}
      {textFeld("ville")}
      {textFeld("pays")}
      {textFeld("ust_id")}
      <div>
        <label htmlFor="partner-zahlungsziel" className={LABEL}>
          {t("feld_zahlungsziel_tage")}
        </label>
        <input
          id="partner-zahlungsziel"
          type="number"
          min={0}
          max={365}
          value={werte.zahlungsziel_tage}
          disabled={readOnly}
          onChange={(e) => setze("zahlungsziel_tage", e.target.value)}
          className={FELD}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="partner-notizen" className={LABEL}>
          {t("feld_notizen")}
        </label>
        <textarea
          id="partner-notizen"
          rows={3}
          value={werte.notizen}
          disabled={readOnly}
          onChange={(e) => setze("notizen", e.target.value)}
          className={FELD}
        />
        <p className="mt-1 text-[11px] text-text-tertiary">{t("datenschutz_hinweis")}</p>
      </div>

      {fehler && <p className="text-xs text-status-dangerText sm:col-span-2">{fehler}</p>}
      {!readOnly && (
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-cid bg-ca px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {t("speichern")}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-cid border border-text-tertiary/30 px-4 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("abbrechen")}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
