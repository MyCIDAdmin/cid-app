/** Auswahl der Plätze (weitere Erwachsene, Kinder) beim Buchen eines Familienpakets (R34). */
import { useTranslation } from "react-i18next";

import type { OffreAdhesion } from "../../types/adhesion";
import { familienPreis, formatEuro } from "./familienpreis";

function Auswahl({
  id,
  label,
  wert,
  max,
  onChange,
}: {
  id: string;
  label: string;
  wert: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </label>
      <select
        id={id}
        value={wert}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
      >
        {Array.from({ length: max + 1 }, (_, n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function FamilienPlaetze({
  offre,
  erwachsene,
  kinder,
  onChange,
}: {
  offre: OffreAdhesion;
  erwachsene: number;
  kinder: number;
  onChange: (erwachsene: number, kinder: number) => void;
}) {
  const { t } = useTranslation("adhesions");
  return (
    <div className="mb-3 rounded-cid bg-bg-tertiary/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Auswahl
          id={`plaetze-e-${offre.id}`}
          label={t("familie.plaetze_erwachsene")}
          wert={erwachsene}
          max={offre.max_erwachsene}
          onChange={(n) => onChange(n, kinder)}
        />
        <Auswahl
          id={`plaetze-k-${offre.id}`}
          label={t("familie.plaetze_kinder")}
          wert={kinder}
          max={offre.max_kinder}
          onChange={(n) => onChange(erwachsene, n)}
        />
      </div>
      <p className="mt-2 text-sm font-semibold text-text-primary">
        {t("familie.gesamtpreis", { preis: formatEuro(familienPreis(offre, erwachsene, kinder)) })}
      </p>
    </div>
  );
}
