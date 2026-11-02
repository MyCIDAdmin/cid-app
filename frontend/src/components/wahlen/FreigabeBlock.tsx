/** Vier-Augen-Freigabe des Wahlausschusses (Wahl öffnen, schließen, Ergebnis veröffentlichen). */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useWahlAktion } from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import type { FreigabeArt, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";

export default function FreigabeBlock({ wahl, art }: { wahl: Wahl; art: FreigabeArt }) {
  const { t } = useTranslation("wahlen");
  const userId = String(useAuthStore((s) => s.user?.id ?? ""));
  const { freigabe } = useWahlAktion(wahl.id);
  const [fehler, setFehler] = useState("");
  const gegeben = (wahl.freigaben[art] ?? []).map(String);
  const schonGegeben = gegeben.includes(userId);

  return (
    <div className="rounded-cid bg-bg-secondary p-3 text-sm" data-testid={`freigabe-${art}`}>
      <p className="font-medium">{t(`ausschuss.freigabe_${art}`)}</p>
      <p className="text-xs text-text-secondary">
        {t("ausschuss.freigaben_stand", { n: gegeben.length, noetig: wahl.zustimmungen_noetig })}
      </p>
      {wahl.ist_ausschuss && !schonGegeben && (
        <button
          type="button"
          onClick={() =>
            freigabe.mutate(art, {
              onError: (e) => setFehler(extractApiErrorMessage(e, t("ausschuss.fehler"))),
            })
          }
          disabled={freigabe.isPending}
          className="mt-2 rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {t(`ausschuss.freigeben_${art}`)}
        </button>
      )}
      {schonGegeben && (
        <p className="mt-1 text-xs text-status-successText">{t("ausschuss.du_hast_freigegeben")}</p>
      )}
      {fehler && (
        <p role="alert" className="mt-1 text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </div>
  );
}
