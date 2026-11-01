/**
 * Abschnitt „Sichtbarkeit in der Gemeinschaft“ unter Mein Profil › Einstellungen : die freiwillige
 * Zustimmung für „Neu dabei“ auf der Startseite (Vorname, Initial und Sektor für andere Mitglieder).
 * Standardmäßig AUS ; gespeichert als Anzeige-Präferenz `neu_dabei_zeigen` am Konto. Fan-Konten
 * haben keinen Eintrag in „Neu dabei“ und sehen den Schalter nicht.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { speicherePraeferenzen } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";

export default function SichtbarkeitAbschnitt() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(false);
  if (!user || user.ist_fan) return null;
  const an = user.ui_praeferenzen?.neu_dabei_zeigen === true;

  async function umschalten() {
    setLaeuft(true);
    setFehler(false);
    try {
      setUser(await speicherePraeferenzen({ ui_praeferenzen: { neu_dabei_zeigen: !an } }));
    } catch {
      setFehler(true);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
      <h2 className="text-sm font-bold text-text-primary">
        {t("einstellungen.sichtbarkeit.titel")}
      </h2>
      <label className="inline-flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={an} disabled={laeuft} onChange={umschalten} />
        <span>{t("einstellungen.sichtbarkeit.neu_dabei")}</span>
      </label>
      <p className="text-xs text-text-tertiary">{t("einstellungen.sichtbarkeit.hinweis")}</p>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {t("einstellungen.sichtbarkeit.fehler")}
        </p>
      )}
    </section>
  );
}
