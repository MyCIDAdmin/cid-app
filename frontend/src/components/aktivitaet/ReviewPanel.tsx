/**
 * Aktivität — Rechteprüfung (Release 24) : jedes Quartal werden alle Konten mit erweiterten Rechten
 * geprüft. „Rechte entziehen“ markiert nur ; der Entzug selbst geschieht im Reiter „Zuweisung“.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useKontoEntscheiden,
  useReview,
  useReviewAbschliessen,
  useReviewAnlegen,
  useReviews,
} from "../../hooks/useAktivitaet";
import type { Entscheidung } from "../../types/aktivitaet";
import { zeitpunkt } from "../../utils/aktivitaet";

function ReviewDetail({ id }: { id: string }) {
  const { t, i18n } = useTranslation("aktivitaet");
  const { data, isLoading, isError } = useReview(id);
  const entscheiden = useKontoEntscheiden();
  const abschliessen = useReviewAbschliessen();
  const [notizen, setNotizen] = useState<Record<string, string>>({});

  if (isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (isError || !data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }
  const offen = data.status === "offen";
  const entscheide = (positionId: string, entscheidung: Entscheidung, notiz: string) =>
    entscheiden.mutate({ reviewId: id, positionId, entscheidung, notiz });

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-tertiary">{t("review.hinweis")}</p>
      <ul className="space-y-2">
        {data.positionen.map((p) => (
          <li key={p.id} className="rounded-cid-lg bg-bg-primary p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1 text-xs">
                <div className="text-sm text-text-primary">{p.name}</div>
                <div className="text-text-tertiary">{p.email}</div>
                <div className="mt-1 text-text-secondary">
                  {p.rolle} · {t("uebersicht.spalten.totp")}:{" "}
                  <span className={p.totp ? "text-status-successText" : "text-status-warningText"}>
                    {p.totp ? t("uebersicht.totp_ja") : t("uebersicht.totp_nein")}
                  </span>{" "}
                  · {t("uebersicht.spalten.letzte")}: {zeitpunkt(p.letzte_anmeldung, i18n.language)}
                </div>
                {p.entscheidung === "entziehen" && (
                  <div
                    className={`mt-1 ${p.aktuell_erweitert ? "text-status-warningText" : "text-status-successText"}`}
                  >
                    {p.aktuell_erweitert ? t("review.entzug_offen") : t("review.entzug_erfolgt")}
                  </div>
                )}
                {!offen && p.notiz && <div className="mt-1 text-text-tertiary">{p.notiz}</div>}
              </div>
              {offen ? (
                <div className="flex w-full flex-col gap-1 sm:w-64">
                  <input
                    type="text"
                    maxLength={200}
                    aria-label={t("review.notiz")}
                    placeholder={t("review.notiz")}
                    value={notizen[p.id] ?? p.notiz}
                    onChange={(e) => setNotizen({ ...notizen, [p.id]: e.target.value })}
                    className="rounded-cid-lg border border-text-tertiary/30 bg-bg-primary px-2 py-1 text-xs"
                  />
                  <div className="flex gap-2">
                    {(["bestaetigt", "entziehen"] as const).map((e) => (
                      <button
                        key={e}
                        type="button"
                        aria-pressed={p.entscheidung === e}
                        disabled={entscheiden.isPending}
                        onClick={() => entscheide(p.id, e, notizen[p.id] ?? p.notiz)}
                        className={`flex-1 rounded-cid-lg px-2 py-1 text-xs font-medium ${
                          p.entscheidung === e
                            ? e === "bestaetigt"
                              ? "bg-status-successBg text-status-successText"
                              : "bg-status-dangerBg text-status-dangerText"
                            : "bg-bg-tertiary text-text-secondary"
                        }`}
                      >
                        {t(`review.entscheidung.${e}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <span className="text-xs font-medium text-text-secondary">
                  {t(`review.entscheidung.${p.entscheidung}`)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {offen ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={data.offen > 0 || abschliessen.isPending}
            onClick={() => abschliessen.mutate(id)}
            className="rounded-cid-lg bg-ca px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {t("review.abschliessen")}
          </button>
          <span className="text-xs text-text-tertiary">
            {t("review.noch_offen", { count: data.offen })}
          </span>
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">
          {t("review.abgeschlossen_von", {
            name: data.abgeschlossen_von ?? "–",
            zeit: zeitpunkt(data.abgeschlossen_am, i18n.language),
          })}
        </p>
      )}
    </div>
  );
}

export default function ReviewPanel() {
  const { t, i18n } = useTranslation("aktivitaet");
  const liste = useReviews();
  const anlegen = useReviewAnlegen();
  const [auswahl, setAuswahl] = useState<string | null>(null);

  if (liste.isLoading) return <p className="text-sm text-text-tertiary">{t("chargement")}</p>;
  if (liste.isError || !liste.data) {
    return <p className="text-sm text-status-dangerText">{t("erreur_chargement")}</p>;
  }
  const aktuell = liste.data.ergebnisse.some((r) => r.quartal === liste.data.aktuelles_quartal);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {liste.data.ergebnisse.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={auswahl === r.id}
            onClick={() => setAuswahl(r.id)}
            className={`rounded-cid-lg px-3 py-1 text-xs font-medium ${
              auswahl === r.id ? "bg-ca text-white" : "bg-bg-tertiary text-text-secondary"
            }`}
          >
            {r.quartal} · {t(`review.status.${r.status}`)}
            {r.status === "offen" ? ` (${r.offen}/${r.anzahl})` : ""}
          </button>
        ))}
        {!aktuell && (
          <button
            type="button"
            disabled={anlegen.isPending}
            onClick={() => anlegen.mutate(undefined, { onSuccess: (r) => setAuswahl(r.id) })}
            className="rounded-cid-lg border border-ca px-3 py-1 text-xs font-medium text-ca disabled:opacity-50"
          >
            {t("review.anlegen", { quartal: liste.data.aktuelles_quartal })}
          </button>
        )}
      </div>
      {liste.data.ergebnisse.length === 0 && (
        <p className="rounded-cid-lg bg-bg-primary p-4 text-sm text-text-tertiary shadow-sm">
          {t("review.leer")}
        </p>
      )}
      {auswahl && <ReviewDetail id={auswahl} />}
      {!auswahl && liste.data.ergebnisse[0] && (
        <p className="text-xs text-text-tertiary">
          {t("review.zuletzt", {
            quartal: liste.data.ergebnisse[0].quartal,
            zeit: zeitpunkt(liste.data.ergebnisse[0].erstellt_am, i18n.language),
          })}
        </p>
      )}
    </div>
  );
}
