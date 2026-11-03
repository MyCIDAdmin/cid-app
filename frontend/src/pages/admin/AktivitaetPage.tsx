/**
 * Seite „Aktivität“ (Verwaltung › System), seit Release 36 eigene Seite statt vierter Reiter der
 * Rollenverwaltung. Nur für App-Admins (Backend: IsSuperAdmin). `?ansicht=auffaelligkeiten` ist
 * das Ziel der Alarm-, Bericht- und Prüfungs-Meldungen.
 */
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import AktivitaetTab from "../../components/aktivitaet/AktivitaetTab";
import { ANSICHTEN, type Ansicht } from "../../types/aktivitaet";

export default function AktivitaetPage() {
  const { t } = useTranslation("aktivitaet");
  const [params] = useSearchParams();
  const gewuenscht = params.get("ansicht");
  const startAnsicht: Ansicht = ANSICHTEN.find((a) => a === gewuenscht) ?? "uebersicht";

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-text-primary">{t("seite.titel")}</h1>
      <AktivitaetTab key={startAnsicht} startAnsicht={startAnsicht} />
    </div>
  );
}
