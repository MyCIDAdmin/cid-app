/** Anzeigewerte des automatischen Teils eines Ländersteckbriefs. */
import type { TFunction } from "i18next";

import type { LaenderAuto } from "../../types/reisen";

export type Sprache = "de" | "fr";

function zeitText(auto: LaenderAuto["zeitverschiebung"], t: TFunction): string {
  if (!auto) return "";
  if (auto.mehrere) return t("steckbrief.zeit_mehrere");
  if (auto.stunden === null) return "";
  if (auto.stunden === 0) return t("steckbrief.zeit_gleich");
  const zahl = `${auto.stunden > 0 ? "+" : "−"}${Math.abs(auto.stunden)}`;
  return t("steckbrief.zeit_stunden", { zahl });
}

export function autoWerte(auto: LaenderAuto | null | undefined, sprache: Sprache, t: TFunction) {
  if (!auto) return { waehrung: "", zeit: "", steckdose: "", link: "" };
  return {
    waehrung: auto.waehrung ? `${auto.waehrung.name[sprache]} (${auto.waehrung.code})` : "",
    zeit: zeitText(auto.zeitverschiebung, t),
    steckdose: auto.steckdose
      ? t("steckbrief.steckdose_wert", {
          typen: auto.steckdose.typen,
          spannung: auto.steckdose.spannung,
          frequenz: auto.steckdose.frequenz,
        })
      : "",
    link: auto.amtliche_hinweise_url,
  };
}
