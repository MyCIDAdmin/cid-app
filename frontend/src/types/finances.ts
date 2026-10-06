/** Types — module finances (Ausgaben, Budget). Miroir de apps.finances.serializers. */

export type StatutDepense = "en_attente" | "approuvee" | "rejetee";

export interface CategorieDepense {
  id: string;
  nom: string;
  actif: boolean;
  ordre: number;
}

export interface Depense {
  id: string;
  date_depense: string;
  montant: string;
  categorie: string;
  categorie_nom: string;
  fournisseur: string;
  description: string;
  evenement: string | null;
  evenement_titre: string | null;
  projet: string | null;
  projet_titre: string | null;
  aufgabe?: string | null;
  aufgabe_titel?: string | null;
  justificatif_url: string | null;
  statut: StatutDepense;
  saisie_par: string | null;
  saisie_par_nom: string;
  decide_par_nom: string;
  date_decision: string | null;
  motif_rejet: string;
  created_at: string;
}

export interface DepensePayload {
  date_depense: string;
  montant: string;
  categorie: string;
  fournisseur: string;
  description: string;
  evenement: string | null;
  projet: string | null;
  justificatif?: File | null;
}

export interface DepensesFiltres {
  annee?: number;
  statut?: StatutDepense;
}

export interface BudgetLigne {
  id: string;
  annee: number;
  categorie: string;
  categorie_nom: string;
  montant: string;
}

export type AktionProtokoll =
  | "erstellt"
  | "geaendert"
  | "geloescht"
  | "freigegeben"
  | "abgelehnt"
  | "budget"
  | "abgeschlossen"
  | "wiedergeoeffnet";

export interface ProtokollEintrag {
  id: string;
  zeitpunkt: string;
  benutzer_name: string;
  aktion: AktionProtokoll;
  objekt_typ: string;
  annee: number | null;
  zusammenfassung: string;
  aenderungen: Record<string, unknown>;
}

export interface Abschluss {
  annee: number;
  abgeschlossen: boolean;
  abgeschlossen_am?: string;
  abgeschlossen_durch?: string;
  snapshot?: { recettes: string; depenses: string; resultat: string };
  wiedergeoeffnet_am?: string | null;
  wiedereroeffnung_grund?: string;
  offene_ausgaben?: number;
}

export interface Pruefung {
  annee: number;
  abschluss: Abschluss;
  anzahl_freigegeben: number;
  summe_freigegeben: string;
  anzahl_offen: number;
  anzahl_abgelehnt: number;
  schwelle: number;
  ohne_beleg: Depense[];
  grosse_ausgaben: Depense[];
}
