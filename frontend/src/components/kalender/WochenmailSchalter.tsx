/** Schalter „Wochenübersicht per E-Mail“ (Release 17) — speichert in den UI-Präferenzen. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { speicherePraeferenzen } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";

export default function WochenmailSchalter() {
  const { t } = useTranslation("kalender");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState(false);
  if (!user) return null;
  const an = Boolean(user.ui_praeferenzen?.kalender_wochenmail);

  async function umschalten() {
    setLaeuft(true);
    setFehler(false);
    try {
      setUser(await speicherePraeferenzen({ ui_praeferenzen: { kalender_wochenmail: !an } }));
    } catch {
      setFehler(true);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="text-xs text-text-secondary">
      <label className="inline-flex items-center gap-2">
        <input type="checkbox" checked={an} disabled={laeuft} onChange={umschalten} />
        <span>{t("wochenmail")}</span>
      </label>
      <span className="ml-2 text-text-tertiary">{t("wochenmail_hinweis")}</span>
      {fehler && (
        <span role="alert" className="ml-2 text-status-dangerText">
          {t("wochenmail_fehler")}
        </span>
      )}
    </div>
  );
}
