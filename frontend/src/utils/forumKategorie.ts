import type { CategorieForum } from "../types/communaute";

/** Farbe je Kategorie – über die Status-Farben der App, damit Hell/Dunkel mitgehen. */
export const KATEGORIE_FARBE: Record<CategorieForum, string> = {
  football_ca: "bg-status-dangerBg text-status-dangerText",
  vie_en_allemagne: "bg-status-infoBg text-status-infoText",
  emploi: "bg-status-warningBg text-status-warningText",
  general: "bg-status-successBg text-status-successText",
};
