/** Reiter „Kosten“ : nur Rechnung (wer bekommt, wer schuldet). Keine Zahlung in der App. */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useKosten,
  useKostenAnlegen,
  useKostenLoeschen,
  useTeilnehmer,
} from "../../hooks/useReisen";
import { extractApiErrorMessage } from "../../utils/apiError";
import { centsZuEuro } from "../../utils/reisen";
import type { ReiseDetail } from "../../types/reisen";
import { FELD, Fehler, KARTE, KNOPF } from "./ui";

export default function KostenTab({ reise }: { reise: ReiseDetail }) {
  const { t, i18n } = useTranslation("reisen");
  const q = useKosten(reise.id, reise.voll);
  const teilnehmer = useTeilnehmer(reise.id, reise.voll);
  const anlegen = useKostenAnlegen(reise.id);
  const loeschen = useKostenLoeschen(reise.id);
  const [bez, setBez] = useState("");
  const [betrag, setBetrag] = useState("");
  const [zahler, setZahler] = useState("");
  const [fehler, setFehler] = useState("");
  const dabei = (teilnehmer.data ?? []).filter((x) => x.status === "dabei");

  function neu(ev: React.FormEvent) {
    ev.preventDefault();
    if (!bez.trim() || !betrag) return;
    anlegen.mutate(
      { bezeichnung: bez, betrag, bezahlt_von: zahler || undefined },
      {
        onSuccess: () => {
          setBez("");
          setBetrag("");
          setFehler("");
        },
        onError: (e) => setFehler(extractApiErrorMessage(e, t("fehler.allgemein"))),
      },
    );
  }

  return (
    <div className="space-y-3">
      <p
        className="rounded-cid bg-amber-50 p-2 text-xs text-amber-900"
        data-testid="kosten-hinweis"
      >
        {t("kosten.hinweis")}
      </p>
      {reise.mein_status === "dabei" && (
        <form
          onSubmit={neu}
          className={`${KARTE} grid grid-cols-2 gap-2 sm:grid-cols-4`}
          aria-label={t("kosten.neu")}
        >
          <input
            className={`${FELD} col-span-2`}
            aria-label={t("kosten.bezeichnung")}
            placeholder={t("kosten.bezeichnung")}
            value={bez}
            onChange={(e) => setBez(e.target.value)}
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            className={FELD}
            aria-label={t("kosten.betrag")}
            placeholder={t("kosten.betrag")}
            value={betrag}
            onChange={(e) => setBetrag(e.target.value)}
          />
          <select
            className={FELD}
            aria-label={t("kosten.bezahlt_von")}
            value={zahler}
            onChange={(e) => setZahler(e.target.value)}
          >
            <option value="">{t("kosten.ich")}</option>
            {dabei.map((x) => (
              <option key={x.user} value={x.user}>
                {x.name}
              </option>
            ))}
          </select>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
            <button type="submit" className={KNOPF} disabled={anlegen.isPending}>
              {t("kosten.hinzufuegen")}
            </button>
            <span className="text-[11px] text-text-tertiary">{t("kosten.gleich_verteilt")}</span>
            <Fehler text={fehler} />
          </div>
        </form>
      )}
      <ul className="space-y-1.5">
        {(q.data?.posten ?? []).map((p) => (
          <li key={p.id} className={`${KARTE} flex items-center justify-between text-sm`}>
            <span>
              {p.bezeichnung} · {centsZuEuro(Math.round(Number(p.betrag) * 100), i18n.language)}
              <span className="block text-xs text-text-tertiary">
                {t("kosten.bezahlt", { name: p.bezahlt_von_name, n: p.anteile.length })}
              </span>
            </span>
            {p.kann_loeschen && (
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => loeschen.mutate(p.id)}
              >
                {t("loeschen")}
              </button>
            )}
          </li>
        ))}
      </ul>
      {(q.data?.salden ?? []).length > 0 && (
        <section className={KARTE} aria-label={t("kosten.salden")}>
          <h2 className="mb-1 text-sm font-semibold">{t("kosten.salden")}</h2>
          <ul className="text-sm">
            {q.data?.salden.map((s) => (
              <li key={s.user} className="flex justify-between">
                <span>{s.name}</span>
                <span className={s.cents >= 0 ? "text-green-700" : "text-red-700"}>
                  {s.cents >= 0 ? t("kosten.bekommt") : t("kosten.schuldet")}{" "}
                  {centsZuEuro(Math.abs(s.cents), i18n.language)}
                </span>
              </li>
            ))}
          </ul>
          {(q.data?.ueberweisungen ?? []).length > 0 && (
            <>
              <h3 className="mt-2 text-xs font-semibold">{t("kosten.ueberweisungen")}</h3>
              <ul className="text-xs text-text-secondary">
                {q.data?.ueberweisungen.map((u, i) => (
                  <li key={i}>
                    {t("kosten.zeile", {
                      von: u.von,
                      an: u.an,
                      betrag: centsZuEuro(u.cents, i18n.language),
                    })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
