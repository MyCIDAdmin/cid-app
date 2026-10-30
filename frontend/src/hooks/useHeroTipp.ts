/**
 * Welcher Tipp lässt sich direkt in der Spielkachel der Übersicht abgeben ?
 *
 * Das Tippspiel gilt nur für Ligue 1 und endet einen Tag vor dem Anpfiff (siehe
 * TippspielTipSerializer). Gezeigt wird deshalb das nächste tippbare Spiel, auch wenn das
 * nächste Spiel insgesamt ein anderer Wettbewerb ist. Kostenlose Tippspiele melden beim ersten
 * Tipp automatisch an ; bei Beitragspflicht muss die Teilnahme bestätigt sein.
 */
import { useMemo } from "react";

import type { RencontreCalendrier, TippspielTip } from "../types/communaute";
import { tippFristOffen } from "../utils/uebersicht";
import {
  useCalendrierRencontres,
  useTippspiele,
  useTippspielTeilnahmen,
  useTippspielTipps,
} from "./useCommunaute";

export type HeroTippStatus =
  /** Kein Tippspiel oder kein tippbares Spiel : nichts anzeigen. */
  | "keins"
  /** Tippspiel da, aber Teilnahme fehlt oder Zahlung offen : zum Tippspiel verweisen. */
  | "zum_tippspiel"
  /** Direkt tippen. */
  | "tippen";

export interface HeroTipp {
  status: HeroTippStatus;
  spiel?: RencontreCalendrier;
  tippspielId?: string;
  tip?: TippspielTip;
}

export function useHeroTipp(aktiv: boolean): HeroTipp {
  const spiele = useCalendrierRencontres();
  const tippspiele = useTippspiele();
  const tippspiel = tippspiele.data?.results.find((x) => x.statut === "publie");
  const teilnahme = useTippspielTeilnahmen({ tippspiel: tippspiel?.id, mine: true });
  const tipps = useTippspielTipps({ tippspiel: tippspiel?.id });

  return useMemo<HeroTipp>(() => {
    if (!aktiv || !tippspiel) return { status: "keins" };
    const spiel = (spiele.data?.results ?? [])
      .filter((s) => s.competition === "Ligue 1" && s.statut === "SCHEDULED" && tippFristOffen(s))
      .sort((a, b) => a.date_heure.localeCompare(b.date_heure))[0];
    if (!spiel) return { status: "keins" };
    const meine = teilnahme.data?.results[0];
    const kostenlos = tippspiel.montant_participation === null;
    const darfTippen = meine ? meine.statut_paiement !== "en_attente" : kostenlos;
    const tip = tipps.data?.results.find((x) => x.rencontre === spiel.id);
    return {
      status: darfTippen ? "tippen" : "zum_tippspiel",
      spiel,
      tippspielId: tippspiel.id,
      tip,
    };
  }, [aktiv, tippspiel, spiele.data, teilnahme.data, tipps.data]);
}
