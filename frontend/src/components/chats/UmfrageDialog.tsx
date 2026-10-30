import { useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import type { UmfrageDaten } from "../../types/communaute";
import Dialog from "./Dialog";
import { FELD, KNOPF, KNOPF_LEISE } from "./ui";

export default function UmfrageDialog({
  onClose,
  onSenden,
}: {
  onClose: () => void;
  onSenden: (daten: UmfrageDaten) => void;
}) {
  const { t } = useTranslation("communaute");
  const [frage, setFrage] = useState("");
  const [optionen, setOptionen] = useState(["", ""]);
  const [frist, setFrist] = useState("");
  const gueltig = frage.trim() !== "" && optionen.filter((o) => o.trim()).length >= 2;

  function senden(e: React.FormEvent) {
    e.preventDefault();
    if (!gueltig) return;
    onSenden({
      frage: frage.trim(),
      optionen: optionen.map((o) => o.trim()).filter(Boolean),
      frist: frist ? new Date(frist).toISOString() : "",
    });
  }

  return (
    <Dialog titel={t("chats.umfrage_titel")} onClose={onClose}>
      <form onSubmit={senden} className="space-y-3 overflow-y-auto p-4">
        <input
          type="text"
          value={frage}
          onChange={(e) => setFrage(e.target.value)}
          placeholder={t("chats.umfrage_frage")}
          aria-label={t("chats.umfrage_frage")}
          maxLength={200}
          className={FELD}
        />
        <div className="space-y-2">
          {optionen.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={o}
                onChange={(e) =>
                  setOptionen((p) => p.map((x, k) => (k === i ? e.target.value : x)))
                }
                placeholder={t("chats.umfrage_antwort", { nr: i + 1 })}
                aria-label={t("chats.umfrage_antwort", { nr: i + 1 })}
                maxLength={80}
                className={FELD}
              />
              {optionen.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptionen((p) => p.filter((_, k) => k !== i))}
                  aria-label={t("chats.entfernen")}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-cid text-text-tertiary hover:bg-bg-secondary"
                >
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          ))}
          {optionen.length < 6 && (
            <button
              type="button"
              onClick={() => setOptionen((p) => [...p, ""])}
              className={KNOPF_LEISE}
            >
              <IconPlus size={16} />
              {t("chats.umfrage_antwort_dazu")}
            </button>
          )}
        </div>
        <label className="block text-xs font-semibold text-text-secondary">
          {t("chats.umfrage_frist")}
          <input
            type="datetime-local"
            value={frist}
            onChange={(e) => setFrist(e.target.value)}
            className={`${FELD} mt-1`}
          />
        </label>
        <button type="submit" disabled={!gueltig} className={`${KNOPF} w-full`}>
          {t("chats.senden")}
        </button>
      </form>
    </Dialog>
  );
}
