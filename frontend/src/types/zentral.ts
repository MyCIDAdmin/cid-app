/** Zentrale Einstellungen (apps.zentral) — Werte, die der App-Administrator ohne Release ändert. */
export interface ZentraleEinstellungen {
  warenkorb_reservierung_minuten: number;
  modifie_par: string | null;
  updated_at: string;
}

export type ZentraleEinstellungenEingabe = Partial<
  Omit<ZentraleEinstellungen, "modifie_par" | "updated_at">
>;
