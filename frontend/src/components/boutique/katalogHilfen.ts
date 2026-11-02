/** Gemeinsame Kleinigkeiten von Katalog-Kacheln, Editor und Assistent der Shop-Verwaltung. */
import { useTranslation } from "react-i18next";

import type { ArtikelHinweis, CategorieProduit } from "../../types/boutique";

export const CATEGORIES: CategorieProduit[] = [
  "vetements",
  "accessoires",
  "articles_club",
  "cartes_docs",
  "divers",
];
export function euro(wert: string | number): string {
  return Number(wert).toFixed(2).replace(".", ",");
}

/** Text eines Hinweises (Kachel-Chip und Editor-Liste teilen ihn). */
export function useHinweisText() {
  const { t } = useTranslation("boutique");
  return (h: ArtikelHinweis): string => {
    if (h.code === "bestand_knapp") {
      const liste = (h.detail.varianten ?? [])
        .map((v) => `${v.variante || t("catalogue_admin.variante_unique")} (${v.stock})`)
        .join(", ");
      return t("katalog.hinweis.bestand_knapp.text", { liste });
    }
    if (h.code === "name_lang")
      return t("katalog.hinweis.name_lang.text", { laenge: h.detail.laenge ?? 0 });
    return t(`katalog.hinweis.${h.code}.text`);
  };
}
