/** Auswahl der Zielgruppe (alle oder eine Teilgruppe) und Kennzeichnung „Nur für …“. */
import { useTranslation } from "react-i18next";

import { useTeilgruppen } from "../../hooks/useReisen";
import { FELD } from "./ui";

export default function ZielgruppeWahl({
  reiseId,
  value,
  onChange,
}: {
  reiseId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation("reisen");
  const q = useTeilgruppen(reiseId);
  const gruppen = q.data?.gruppen ?? [];
  if (gruppen.length === 0) return null;
  return (
    <label className="block text-[11px] text-text-tertiary">
      {t("gruppen.zielgruppe")}
      <select
        className={FELD}
        aria-label={t("gruppen.zielgruppe")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("gruppen.alle")}</option>
        {gruppen.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GruppenChip({ name }: { name: string | null }) {
  const { t } = useTranslation("reisen");
  if (!name) return null;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
      {t("gruppen.nur_fuer", { name })}
    </span>
  );
}
