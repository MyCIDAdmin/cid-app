/**
 * Types partagés — module membres (miroir de apps.membres.serializers côté
 * backend). Garder synchronisé avec backend/apps/membres/models.py /
 * serializers.py en cas de changement de schéma.
 */

export type StatutMembre = "actif" | "en_attente" | "inactif";
export type Sexe = "homme" | "femme" | "non_renseigne";
// Doit rester synchronisé avec apps.membres.models.Pays.
export type Pays = "DE" | "TN" | "FR" | "AT" | "CH" | "BE" | "NL" | "IT" | "ES" | "GB" | "XX";

export interface MembreListItem {
  id: string;
  numero_membre: string;
  prenom: string;
  nom: string;
  email: string;
  pays: Pays;
  ville_de: string;
  land_de: string;
  statut: StatutMembre;
  date_adhesion: string;
  cin_masque: string | null;
}

export interface Membre {
  id: string;
  user: string | null;
  numero_membre: string;
  prenom: string;
  nom: string;
  date_naissance: string;
  sexe: Sexe;
  email: string;
  telephone: string;
  cin: string;
  passeport: string | null;
  pays: Pays;
  adresse_de: string;
  code_postal_de: string;
  ville_de: string;
  land_de: string;
  ville_origine_tn: string;
  gouvernorat_tn: string;
  statut: StatutMembre;
  date_adhesion: string;
  photo: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload accepté par POST/PATCH /membres/ (voir MembreSerializer). */
export interface MembreFormValues {
  prenom: string;
  nom: string;
  date_naissance: string;
  sexe: Sexe;
  email: string;
  telephone: string;
  cin: string;
  passeport?: string;
  pays: Pays;
  adresse_de?: string;
  code_postal_de?: string;
  ville_de?: string;
  land_de?: string;
  ville_origine_tn?: string;
  gouvernorat_tn?: string;
  statut: StatutMembre;
  date_adhesion: string;
}

/** Réponse paginée cursor (rest_framework.pagination.CursorPagination). */
export interface CursorPage<T> {
  next: string | null;
  previous: string | null;
  results: T[];
}

// 16 Länder — doit rester synchronisé avec apps.membres.models.Bundesland.
export const BUNDESLANDER: { value: string; label: string }[] = [
  { value: "BW", label: "Baden-Württemberg" },
  { value: "BY", label: "Bayern" },
  { value: "BE", label: "Berlin" },
  { value: "BB", label: "Brandenburg" },
  { value: "HB", label: "Bremen" },
  { value: "HH", label: "Hamburg" },
  { value: "HE", label: "Hessen" },
  { value: "MV", label: "Mecklenburg-Vorpommern" },
  { value: "NI", label: "Niedersachsen" },
  { value: "NW", label: "Nordrhein-Westfalen" },
  { value: "RP", label: "Rheinland-Pfalz" },
  { value: "SL", label: "Saarland" },
  { value: "SN", label: "Sachsen" },
  { value: "ST", label: "Sachsen-Anhalt" },
  { value: "SH", label: "Schleswig-Holstein" },
  { value: "TH", label: "Thüringen" },
];

export const STATUTS_MEMBRE: { value: StatutMembre; labelKey: string }[] = [
  { value: "actif", labelKey: "statut.actif" },
  { value: "en_attente", labelKey: "statut.en_attente" },
  { value: "inactif", labelKey: "statut.inactif" },
];

// Doit rester synchronisé avec apps.membres.models.Pays.
export const PAYS_MEMBRE: { value: Pays; labelKey: string }[] = [
  { value: "DE", labelKey: "pays.DE" },
  { value: "TN", labelKey: "pays.TN" },
  { value: "FR", labelKey: "pays.FR" },
  { value: "AT", labelKey: "pays.AT" },
  { value: "CH", labelKey: "pays.CH" },
  { value: "BE", labelKey: "pays.BE" },
  { value: "NL", labelKey: "pays.NL" },
  { value: "IT", labelKey: "pays.IT" },
  { value: "ES", labelKey: "pays.ES" },
  { value: "GB", labelKey: "pays.GB" },
  { value: "XX", labelKey: "pays.XX" },
];

export const PAYS_ALLEMAGNE: Pays = "DE";
