/** Einlass-Helfer benennen und entfernen (nur Büro/Verantwortliche). */
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useEinlassHelfer } from "../../hooks/useEinlass";
import type { EinlassTyp } from "../../types/einlass";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function HelferVerwaltung({ typ, id }: { typ: EinlassTyp; id: string }) {
  const { t } = useTranslation("tickets");
  const { liste, benennen, entfernen } = useEinlassHelfer(typ, id, true);
  const [email, setEmail] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  const absenden = (e: FormEvent) => {
    e.preventDefault();
    setFehler(null);
    if (!email.trim()) return;
    benennen.mutate(email.trim(), {
      onSuccess: () => setEmail(""),
      onError: (err) => setFehler(extractApiErrorMessage(err, t("fehler"))),
    });
  };

  return (
    <section className="space-y-2 rounded-cid border border-text-tertiary/20 p-3">
      <h2 className="text-sm font-semibold text-text-primary">{t("helfer_titel")}</h2>
      <p className="text-xs text-text-tertiary">{t("helfer_hinweis")}</p>
      <ul className="space-y-1">
        {(liste.data ?? []).map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-text-primary">
              {h.name} <span className="text-text-tertiary">({h.email})</span>
            </span>
            <button
              type="button"
              onClick={() => entfernen.mutate(h.id)}
              className="shrink-0 text-xs text-status-dangerText hover:underline"
            >
              {t("helfer_entfernen")}
            </button>
          </li>
        ))}
        {liste.data?.length === 0 && (
          <li className="text-xs text-text-tertiary">{t("helfer_keine")}</li>
        )}
      </ul>
      <form onSubmit={absenden} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label={t("helfer_email")}
          placeholder={t("helfer_email")}
          className="min-w-0 flex-1 rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={benennen.isPending}
          className="rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("helfer_hinzufuegen")}
        </button>
      </form>
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </section>
  );
}
