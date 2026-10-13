import { useTranslation } from "react-i18next";

/**
 * Anzeigename einer Fähigkeit. Standardeinträge der Fähigkeiten-Datenbank sind in der DB
 * deutsch gespeichert und werden hier über `membres:faehigkeiten.standard.<Name>` übersetzt;
 * selbst angelegte Einträge (keine Übersetzung) bleiben unverändert.
 */
export function useFaehigkeitLabel(): (bezeichnung: string) => string {
  const { t } = useTranslation("membres");
  return (bezeichnung) =>
    /[.:]/.test(bezeichnung)
      ? bezeichnung
      : t(`faehigkeiten.standard.${bezeichnung}`, { defaultValue: bezeichnung });
}
