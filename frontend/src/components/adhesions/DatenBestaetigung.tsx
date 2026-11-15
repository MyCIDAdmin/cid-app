/**
 * Bestätigung der persönlichen Daten bei der Anmeldung in einer Mitgliedschaftskampagne
 * (Wunsch Ghazi, 2026-11-15): Vor dem Beitritt sieht das Mitglied seine Angaben aus dem Profil
 * (Name, Geburtsdatum, Kontakt, Adresse) und bestätigt per Häkchen, dass sie stimmen. Änderungen
 * macht es im Profil („Daten ändern“) ; die Anmeldung speichert den Zeitpunkt der Bestätigung
 * (Souscription.daten_bestaetigt_am), das Backend lehnt die erste Anmeldung ohne Bestätigung ab.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useMembreMoi } from "../../hooks/useMembres";

interface Props {
  bestaetigt: boolean;
  onAendern: (bestaetigt: boolean) => void;
}

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="min-w-0 break-words text-text-primary">{wert || "–"}</dd>
    </>
  );
}

export default function DatenBestaetigung({ bestaetigt, onAendern }: Props) {
  const { t, i18n } = useTranslation("adhesions");
  const { t: tMitglieder } = useTranslation("membres");
  const membre = useMembreMoi();

  if (membre.isLoading) {
    return <p className="mt-3 text-xs text-text-tertiary">{t("daten.laedt")}</p>;
  }
  const m = membre.data;
  if (!m) return null;

  const geburtsdatum = m.date_naissance
    ? new Date(`${m.date_naissance}T00:00:00`).toLocaleDateString(i18n.language)
    : "";
  const ort = [m.code_postal_de, m.ville_de].filter(Boolean).join(" ");
  const adresse = [m.adresse_de, ort].filter(Boolean).join(", ");

  return (
    <div
      className="mt-3 rounded-cid border border-text-tertiary/20 bg-bg-secondary p-3"
      data-testid="daten-bestaetigung"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">{t("daten.titel")}</h3>
        <Link to="/mon-profil" className="text-xs font-medium text-ca hover:underline">
          {t("daten.aendern")}
        </Link>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <Zeile label={t("daten.name")} wert={`${m.prenom} ${m.nom}`.trim()} />
        <Zeile label={t("daten.geburtsdatum")} wert={geburtsdatum} />
        <Zeile label={t("daten.email")} wert={m.email} />
        <Zeile label={t("daten.telefon")} wert={m.telephone} />
        <Zeile label={t("daten.adresse")} wert={adresse} />
        <Zeile label={t("daten.land")} wert={tMitglieder(`pays.${m.pays}`)} />
      </dl>
      <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={bestaetigt}
          onChange={(e) => onAendern(e.target.checked)}
          className="mt-0.5"
        />
        <span>{t("daten.bestaetigen")}</span>
      </label>
    </div>
  );
}
