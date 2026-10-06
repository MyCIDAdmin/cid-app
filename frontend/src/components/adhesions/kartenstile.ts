import type { KartenStil } from "../../types/adhesion";

export const KARTEN_STILE: KartenStil[] = [
  "weiss",
  "silber",
  "gold",
  "diamant",
  "bronze",
  "onyx",
  "rubin",
];

export function kartenStilOderStandard(stil: string | null | undefined): KartenStil {
  return (KARTEN_STILE as string[]).includes(stil ?? "") ? (stil as KartenStil) : "rubin";
}
