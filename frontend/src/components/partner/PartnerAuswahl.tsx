/** Auswahl eines Business Partners bei Ausgaben/Kosten (optional). Wer Partner nicht lesen darf
 * (unter Rolle RH, z. B. Projektverantwortliche), sieht das Feld nicht — der Lieferant bleibt
 * dann Freitext. Bei Auswahl wird der Lieferantenname übernommen (Server tut dasselbe). */
import { useTranslation } from "react-i18next";

import { usePartnerListe } from "../../hooks/usePartner";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";

const FILTER = {} as const;

export default function PartnerAuswahl({
  id,
  value,
  aktuellerName,
  onChange,
  className,
  labelClassName,
}: {
  id: string;
  value: string;
  /** Name des bereits gewählten Partners (falls er nicht mehr in der Liste steht, z. B. archiviert). */
  aktuellerName?: string | null;
  onChange: (partnerId: string, name: string | null) => void;
  className: string;
  labelClassName: string;
}) {
  const { t } = useTranslation("partner");
  const darfLesen = hasRoleAtLeast(
    useAuthStore((s) => s.user),
    ROLE_LEVELS.rh,
  );
  const liste = usePartnerListe(FILTER, darfLesen);
  if (!darfLesen) return null;

  return (
    <div className="sm:col-span-2">
      <label htmlFor={id} className={labelClassName}>
        {t("auswahl_label")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const partner = (liste.data ?? []).find((p) => p.id === e.target.value);
          onChange(e.target.value, partner?.nom ?? null);
        }}
        className={className}
      >
        <option value="">{t("auswahl_keiner")}</option>
        {value && aktuellerName && !(liste.data ?? []).some((p) => p.id === value) && (
          <option value={value}>{aktuellerName}</option>
        )}
        {(liste.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom}
          </option>
        ))}
      </select>
    </div>
  );
}
