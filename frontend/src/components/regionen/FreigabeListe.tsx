import { useTranslation } from "react-i18next";

import { useZurFreigabe } from "../../hooks/useRegionen";
import VeranstaltungKarte from "./VeranstaltungKarte";

/** Eingereichte Treffen aller Regionen — nur für das Büro. */
export default function FreigabeListe() {
  const { t } = useTranslation("regionen");
  const { data } = useZurFreigabe(true);
  if (!data || data.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-base font-semibold text-text-primary">
        {t("zur_freigabe", { count: data.length })}
      </h2>
      <ul className="flex flex-col gap-4">
        {data.map((v) => (
          <VeranstaltungKarte key={v.id} v={v} standorte={[]} mitRegion />
        ))}
      </ul>
    </section>
  );
}
