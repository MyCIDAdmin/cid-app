/**
 * „Dein Tipp“ direkt in der Spielkachel der Übersicht : Ergebnis mit +/− einstellen und
 * speichern, ohne ins Fan-Club-Modul zu wechseln. Dieselben Endpunkte wie die Tippspiel-Liste.
 */
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCreerTippspielTip, useModifierTippspielTip } from "../../hooks/useCommunaute";
import type { HeroTipp } from "../../hooks/useHeroTipp";
import { extractApiErrorMessage } from "../../utils/apiError";

const MS_TAG = 86_400_000;
const MAX_TORE = 20;

function Schritt({
  wert,
  label,
  onChange,
}: {
  wert: number;
  label: string;
  onChange: (n: number) => void;
}) {
  const knopf =
    "grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-white/15 transition-colors hover:bg-white/25 disabled:opacity-40";
  return (
    <div role="group" aria-label={label} className="flex flex-col items-center gap-1">
      <button
        type="button"
        className={knopf}
        aria-label={`${label} +`}
        disabled={wert >= MAX_TORE}
        onClick={() => onChange(wert + 1)}
      >
        <IconPlus size={16} aria-hidden="true" />
      </button>
      <output aria-label={label} className="text-3xl font-semibold tabular-nums leading-none">
        {wert}
      </output>
      <button
        type="button"
        className={knopf}
        aria-label={`${label} −`}
        disabled={wert <= 0}
        onClick={() => onChange(wert - 1)}
      >
        <IconMinus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function HeroTippPanel({ tipp }: { tipp: HeroTipp }) {
  const { t, i18n } = useTranslation("dashboard");
  const { spiel, tip, tippspielId } = tipp;
  const [heim, setHeim] = useState<number | null>(null);
  const [gast, setGast] = useState<number | null>(null);
  const [fehler, setFehler] = useState("");
  const [gespeichert, setGespeichert] = useState(false);
  const creer = useCreerTippspielTip();
  const modifier = useModifierTippspielTip();
  if (!spiel || tipp.status === "keins") return null;

  const frist = new Date(new Date(spiel.date_heure).getTime() - MS_TAG).toLocaleDateString(
    i18n.language,
    { day: "2-digit", month: "2-digit" },
  );
  const paarung = `${spiel.equipe_domicile} – ${spiel.equipe_exterieur}`;
  const huelle =
    "flex min-w-[220px] flex-col gap-3 rounded-cid-lg border border-white/30 bg-white/15 p-4 backdrop-blur-sm lg:w-64";
  const titel = (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest opacity-85">
        {t(tip ? "uebersicht.hero.tipp_dein" : "uebersicht.hero.tipp_titel")}
      </p>
      <p className="mt-0.5 text-xs opacity-90">{paarung}</p>
    </div>
  );

  if (tipp.status === "zum_tippspiel") {
    return (
      <div className={huelle} data-testid="hero-tipp">
        {titel}
        <p className="text-sm opacity-90">{t("uebersicht.hero.tipp_freischalten")}</p>
        <Link
          to="/live"
          className="inline-flex min-h-[44px] items-center justify-center rounded-cid bg-white px-4 text-sm font-semibold text-cad hover:bg-cal"
        >
          {t("uebersicht.hero.tipp_zum_tippspiel")}
        </Link>
      </div>
    );
  }

  const aktuellHeim = heim ?? tip?.score_domicile ?? 0;
  const aktuellGast = gast ?? tip?.score_exterieur ?? 0;
  const geaendert =
    !tip || aktuellHeim !== tip.score_domicile || aktuellGast !== tip.score_exterieur;
  const laeuft = creer.isPending || modifier.isPending;

  function speichern() {
    setFehler("");
    setGespeichert(false);
    const onError = (err: unknown) =>
      setFehler(extractApiErrorMessage(err, t("uebersicht.hero.tipp_fehler")));
    const onSuccess = () => setGespeichert(true);
    const payload = { score_domicile: aktuellHeim, score_exterieur: aktuellGast };
    if (tip) {
      modifier.mutate({ id: tip.id, payload }, { onSuccess, onError });
    } else if (tippspielId && spiel) {
      creer.mutate(
        { tippspiel: tippspielId, rencontre: spiel.id, ...payload },
        { onSuccess, onError },
      );
    }
  }

  return (
    <div className={huelle} data-testid="hero-tipp">
      {titel}
      <div className="flex items-center justify-center gap-3">
        <Schritt
          wert={aktuellHeim}
          label={t("uebersicht.hero.tipp_heim", { equipe: spiel.equipe_domicile })}
          onChange={setHeim}
        />
        <span className="pb-0 text-2xl font-semibold opacity-80" aria-hidden="true">
          :
        </span>
        <Schritt
          wert={aktuellGast}
          label={t("uebersicht.hero.tipp_gast", { equipe: spiel.equipe_exterieur })}
          onChange={setGast}
        />
      </div>
      <button
        type="button"
        onClick={speichern}
        disabled={laeuft || !geaendert}
        className="inline-flex min-h-[44px] items-center justify-center rounded-cid bg-white px-4 text-sm font-semibold text-cad hover:bg-cal disabled:opacity-60"
      >
        {t(tip ? "uebersicht.hero.tipp_aendern" : "uebersicht.hero.tipp_speichern")}
      </button>
      <p className="text-xs opacity-85" role="status">
        {fehler ? (
          <span className="font-semibold">{fehler}</span>
        ) : gespeichert || (tip && !geaendert) ? (
          t("uebersicht.hero.tipp_gespeichert", { frist })
        ) : (
          t("uebersicht.hero.tipp_bis", { frist })
        )}
      </p>
    </div>
  );
}
