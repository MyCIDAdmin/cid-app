/**
 * Zusatzzeilen unter einem Seitentipp, die vom Konto abhängen : nur Leserechte auf einer
 * Verwaltungsseite (Zugriffsstufe aus der Rollenverwaltung), Fans auf „Meine Mitgliedschaft“ und
 * auf der Sektoren-Seite die Zuordnung (eigener Sektor, Verantwortliche, Freigabe). Sichtbarkeit
 * der Seite selbst entscheidet schon die Seitenleiste ; hier kommt nur Erklärung dazu.
 */
import { useTranslation } from "react-i18next";

import { usePageAccess } from "../../hooks/useRbac";
import { useRegionen } from "../../hooks/useRegionen";
import { useAuthStore } from "../../store/authStore";

function Zeile({ textKey }: { textKey: string }) {
  const { t } = useTranslation("tour");
  return <p className="mt-1 text-text-secondary">{t(textKey)}</p>;
}

function LeseZeile({ pageSlug }: { pageSlug: string }) {
  const { accessible, modifiable, isLoading } = usePageAccess(pageSlug);
  if (isLoading || !accessible || modifiable) return null;
  return <Zeile textKey="hinweise_zusatz.nur_lesen" />;
}

function RegionenZeilen() {
  const { data } = useRegionen();
  if (!data) return null;
  const meine = data.ergebnisse.some((r) => r.meine_region);
  const verantwortlich = data.ergebnisse.some((r) => r.verantwortliche.some((v) => v.eigene));
  return (
    <>
      {data.ohne_region && <Zeile textKey="hinweise_zusatz.region_keine" />}
      {meine && <Zeile textKey="hinweise_zusatz.region_meine" />}
      {verantwortlich && <Zeile textKey="hinweise_zusatz.region_verantwortlich" />}
      {data.darf_freigeben && <Zeile textKey="hinweise_zusatz.region_freigeben" />}
    </>
  );
}

export default function HinweisZusatz({
  hinweisKey,
  pageSlug,
}: {
  hinweisKey: string;
  pageSlug?: string;
}) {
  const istFan = useAuthStore((s) => Boolean(s.user?.ist_fan));
  return (
    <>
      {pageSlug && <LeseZeile pageSlug={pageSlug} />}
      {hinweisKey === "regionen" && <RegionenZeilen />}
      {hinweisKey === "mitgliedschaft" && istFan && (
        <Zeile textKey="hinweise_zusatz.fan_mitglied" />
      )}
    </>
  );
}
