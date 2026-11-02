import { useState } from "react";
import { useTranslation } from "react-i18next";

import { kandidaturAktion } from "../../api/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";

/** Über den Link „?unterstuetzen=<Kandidatur>“ : eine Unterstützung je Wahl abgeben. */
export default function UnterstuetzenKarte({ kandidaturId }: { kandidaturId: string }) {
  const { t } = useTranslation("wahlen");
  const [status, setStatus] = useState<"offen" | "ok" | "fehler">("offen");
  const [meldung, setMeldung] = useState("");

  async function senden() {
    try {
      await kandidaturAktion(kandidaturId, "unterstuetzen");
      setStatus("ok");
    } catch (err) {
      setMeldung(extractApiErrorMessage(err, t("unterstuetzen.fehler")));
      setStatus("fehler");
    }
  }

  return (
    <section className="rounded-cid-lg bg-bg-primary p-4 shadow-sm" data-testid="unterstuetzen">
      <h2 className="text-base font-bold text-text-primary">{t("unterstuetzen.titel")}</h2>
      <p className="mt-1 text-sm text-text-secondary">{t("unterstuetzen.text")}</p>
      {status === "ok" ? (
        <p className="mt-2 text-sm text-status-successText">{t("unterstuetzen.danke")}</p>
      ) : (
        <button
          type="button"
          onClick={senden}
          className="mt-2 rounded-cid bg-ca px-4 py-2 text-sm font-semibold text-white"
        >
          {t("unterstuetzen.button")}
        </button>
      )}
      {status === "fehler" && (
        <p role="alert" className="mt-2 text-sm text-status-dangerText">
          {meldung}
        </p>
      )}
    </section>
  );
}
