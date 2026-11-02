/**
 * Einsprüche : Mitglieder sehen nur ihre eigenen, der Wahlausschuss (und das Büro) alle.
 * Der Ausschuss schlägt eine Entscheidung vor, eine zweite Person stimmt zu (Vier-Augen-Prinzip).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useEinspruchAktionen, useEinsprueche } from "../../hooks/useWahlen";
import { useAuthStore } from "../../store/authStore";
import type { Einspruch, Wahl } from "../../types/wahlen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { datum } from "../../utils/wahlen";

function EinspruchKarte({ e, wahl }: { e: Einspruch; wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const userId = String(useAuthStore((s) => s.user?.id ?? ""));
  const aktionen = useEinspruchAktionen(e.id);
  const [begruendung, setBegruendung] = useState("");
  const [fehler, setFehler] = useState("");
  const meldeFehler = (err: unknown) =>
    setFehler(extractApiErrorMessage(err, t("einspruch.fehler")));
  const offen = e.status === "offen";
  const zugestimmt = (e.zustimmungen ?? []).map(String);

  return (
    <li className="space-y-2 rounded-cid-lg bg-bg-primary p-4 shadow-sm" data-testid="einspruch">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t(`einspruch.art_${e.art}`)}
          {e.kandidatur_name ? ` · ${e.kandidatur_name}` : ""}
        </h3>
        <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs">
          {t(`einspruch.status_${e.status}`)}
        </span>
      </div>
      {e.einreicher && <p className="text-xs text-text-secondary">{e.einreicher}</p>}
      <p className="whitespace-pre-line text-sm">{e.text}</p>
      {offen && (
        <p className="text-xs text-text-tertiary">
          {t("einspruch.entscheiden_bis", { datum: datum(e.entscheiden_bis, true) })}
        </p>
      )}
      {!offen && e.begruendung && (
        <p className="rounded-cid bg-bg-secondary p-2 text-sm">{e.begruendung}</p>
      )}

      {offen && wahl.ist_ausschuss && !e.vorschlag && (
        <div className="space-y-2">
          <textarea
            value={begruendung}
            onChange={(ev) => setBegruendung(ev.target.value)}
            aria-label={t("einspruch.begruendung")}
            rows={3}
            className="w-full rounded-cid border border-text-tertiary/30 p-2 text-sm"
          />
          <div className="flex gap-2">
            {(["stattgeben", "abweisen"] as const).map((art) => (
              <button
                key={art}
                type="button"
                disabled={aktionen.entscheiden.isPending || !begruendung.trim()}
                onClick={() =>
                  aktionen.entscheiden.mutate({ art, begruendung }, { onError: meldeFehler })
                }
                className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {t(`einspruch.${art}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {offen && wahl.ist_ausschuss && e.vorschlag && (
        <div className="space-y-1 rounded-cid bg-bg-secondary p-3 text-sm">
          <p className="font-medium">{t(`einspruch.vorschlag_${e.vorschlag}`)}</p>
          <p>{e.vorschlag_begruendung}</p>
          <p className="text-xs text-text-secondary">
            {t("ausschuss.freigaben_stand", {
              n: zugestimmt.length,
              noetig: e.zustimmungen_noetig ?? wahl.zustimmungen_noetig,
            })}
          </p>
          <div className="flex gap-3">
            {!zugestimmt.includes(userId) && (
              <button
                type="button"
                onClick={() => aktionen.aktion.mutate("zustimmen", { onError: meldeFehler })}
                className="rounded-cid bg-ca px-3 py-1.5 text-xs font-semibold text-white"
              >
                {t("einspruch.zustimmen")}
              </button>
            )}
            <button
              type="button"
              onClick={() => aktionen.aktion.mutate("verwerfen", { onError: meldeFehler })}
              className="text-xs text-status-dangerText underline"
            >
              {t("einspruch.vorschlag_verwerfen")}
            </button>
          </div>
        </div>
      )}
      {offen && !wahl.ist_ausschuss && !wahl.kann_verwalten && (
        <button
          type="button"
          onClick={() => aktionen.aktion.mutate("zurueckziehen", { onError: meldeFehler })}
          className="text-xs text-status-dangerText underline"
        >
          {t("einspruch.zurueckziehen")}
        </button>
      )}
      {fehler && (
        <p role="alert" className="text-xs text-status-dangerText">
          {fehler}
        </p>
      )}
    </li>
  );
}

export default function EinsprueceTab({ wahl }: { wahl: Wahl }) {
  const { t } = useTranslation("wahlen");
  const einsprueche = useEinsprueche(wahl.id);
  const liste = einsprueche.data ?? [];

  if (einsprueche.isLoading) return <p className="text-sm text-text-tertiary">{t("laden")}</p>;
  if (liste.length === 0) {
    return <p className="text-sm text-text-secondary">{t("einspruch.leer")}</p>;
  }
  return (
    <ul className="space-y-3">
      {liste.map((e) => (
        <EinspruchKarte key={e.id} e={e} wahl={wahl} />
      ))}
    </ul>
  );
}
