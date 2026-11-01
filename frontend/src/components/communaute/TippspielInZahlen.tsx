/**
 * Karte „Tippspiel in Zahlen“ im Reiter Statistiken (Fan-Club-Umbau 2026-11) : meine Bilanz im
 * laufenden Tippspiel, gerechnet aus der Tipp-Matrix (Rangliste + Tipps der gesperrten Spiele).
 * Erscheint nur für angemeldete, bestätigte Teilnehmer – für alle anderen bleibt die Karte weg.
 */
import { useTranslation } from "react-i18next";

import { useMeinTippstand, useTippspielMatrix } from "../../hooks/useCommunaute";
import { useAuthStore } from "../../store/authStore";

function Zahl({ label, wert }: { label: string; wert: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase text-text-tertiary">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-text-primary">{wert}</dd>
    </div>
  );
}

export default function TippspielInZahlen() {
  const { t } = useTranslation("communaute");
  const user = useAuthStore((s) => s.user);
  const { tippspiel, bestaetigt } = useMeinTippstand(Boolean(user));
  const matrix = useTippspielMatrix(tippspiel?.id, 8, bestaetigt).data;
  const ich = matrix?.zeilen.find((z) => z.ist_ich);
  if (!user || !bestaetigt || !matrix || !ich) return null;

  const gewertet = Object.values(ich.tipps).filter((tip) => tip.p !== null);
  const treffer = gewertet.filter((tip) => (tip.p ?? 0) > 0).length;
  const quote = gewertet.length === 0 ? "–" : `${Math.round((treffer / gewertet.length) * 100)} %`;

  return (
    <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm" data-testid="tippspiel-in-zahlen">
      <h2 className="mb-3 text-xs font-bold text-text-primary">{t("live.tippzahlen_titel")}</h2>
      <dl className="grid grid-cols-2 gap-3">
        <Zahl label={t("live.tippzahlen_platz")} wert={`${ich.rang} / ${matrix.teilnehmer}`} />
        <Zahl label={t("live.tippzahlen_punkte")} wert={String(ich.punkte)} />
        <Zahl label={t("live.tippzahlen_exakt")} wert={String(ich.exakt)} />
        <Zahl label={t("live.tippzahlen_quote")} wert={quote} />
      </dl>
      <p className="mt-2 text-[11px] text-text-tertiary">
        {t("live.tippzahlen_hinweis", { anzahl: gewertet.length })}
      </p>
    </div>
  );
}
