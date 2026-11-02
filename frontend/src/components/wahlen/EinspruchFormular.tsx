/** Einspruch einlegen (gegen Wählbarkeit, Ablehnung oder Ergebnis). Die Frist prüft der Server. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useEinspruchEinlegen } from "../../hooks/useWahlen";
import type { EinspruchArt } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum } from "../../utils/wahlen";

interface Props {
  wahl: string;
  art: EinspruchArt;
  kandidatur?: string;
  bis?: string | null;
  onFertig?: () => void;
}

export default function EinspruchFormular({ wahl, art, kandidatur, bis, onFertig }: Props) {
  const { t } = useTranslation("wahlen");
  const einlegen = useEinspruchEinlegen();
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState("");
  const [fertig, setFertig] = useState(false);

  if (fertig) {
    return (
      <p role="status" className="text-sm text-status-successText">
        {t("einspruch.eingereicht")}
      </p>
    );
  }
  return (
    <form
      className="space-y-2 rounded-cid bg-bg-secondary p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setFehler("");
        einlegen.mutate(
          { wahl, art, kandidatur, text },
          {
            onSuccess: () => {
              setFertig(true);
              onFertig?.();
            },
            onError: (err) => setFehler(extractApiErrorMessage(err, t("einspruch.fehler"))),
          },
        );
      }}
    >
      <label className="block text-sm font-medium">
        {t(`einspruch.frage_${art}`)}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={2000}
          className="mt-1 w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
        />
      </label>
      <p className="text-xs text-text-tertiary">
        {t("einspruch.vertraulich")}
        {bis ? ` ${t("einspruch.frist_bis", { datum: datum(bis, true) })}` : ""}
      </p>
      <button
        type="submit"
        disabled={einlegen.isPending || text.trim().length < 10}
        className="rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t("einspruch.absenden")}
      </button>
      {fehler && (
        <p role="alert" className="text-sm text-status-dangerText">
          {fehler}
        </p>
      )}
    </form>
  );
}
