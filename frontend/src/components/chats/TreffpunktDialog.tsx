import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { TreffpunktDaten } from "../../types/communaute";
import Dialog from "./Dialog";
import { FELD, KNOPF } from "./ui";

export default function TreffpunktDialog({
  onClose,
  onSenden,
}: {
  onClose: () => void;
  onSenden: (daten: TreffpunktDaten) => void;
}) {
  const { t } = useTranslation("communaute");
  const [ort, setOrt] = useState("");
  const [zeit, setZeit] = useState("");
  const [link, setLink] = useState("");
  const linkOk = link.trim() === "" || /^https:\/\//i.test(link.trim());

  function senden(e: React.FormEvent) {
    e.preventDefault();
    if (!ort.trim() || !linkOk) return;
    onSenden({ ort: ort.trim(), zeit: zeit.trim(), link: link.trim() });
  }

  return (
    <Dialog titel={t("chats.treffpunkt_titel")} onClose={onClose}>
      <form onSubmit={senden} className="space-y-3 overflow-y-auto p-4">
        <input
          type="text"
          value={ort}
          onChange={(e) => setOrt(e.target.value)}
          placeholder={t("chats.treffpunkt_ort")}
          aria-label={t("chats.treffpunkt_ort")}
          maxLength={160}
          className={FELD}
        />
        <input
          type="text"
          value={zeit}
          onChange={(e) => setZeit(e.target.value)}
          placeholder={t("chats.treffpunkt_zeit")}
          aria-label={t("chats.treffpunkt_zeit")}
          maxLength={60}
          className={FELD}
        />
        <div>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={t("chats.treffpunkt_link")}
            aria-label={t("chats.treffpunkt_link")}
            className={FELD}
          />
          {!linkOk && (
            <p className="mt-1 text-xs text-status-dangerText">
              {t("chats.treffpunkt_link_fehler")}
            </p>
          )}
        </div>
        <button type="submit" disabled={!ort.trim() || !linkOk} className={`${KNOPF} w-full`}>
          {t("chats.senden")}
        </button>
      </form>
    </Dialog>
  );
}
