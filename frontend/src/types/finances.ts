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
