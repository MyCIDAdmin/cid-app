/**
 * Types partagés — module projets ("Projets & Actions", demande utilisateur du 2026-09-22 —
 * miroir de apps.projets.models/serializers côté backend). Garder synchronisé en cas de
 * changement de schéma.
 */

export type StatutProjet = "en_preparation" | "en_cours" | "termine" | "annule";

/** Brouillon = visible uniquement pour l'équipe et la gestion ; Publié = visible pour tous
 * (2026-10-06). Indépendant du statut de travail ci-dessus. */
export type SichtbarkeitProjet = "entwurf" | "veroeffentlicht";
export type RolleProjet = "leitung" | "mitarbeit" | "beobachter";
export type StatutAufgabe = "offen" | "in_arbeit" | "review" | "erledigt";
export type PrioritaetAufgabe = "niedrig" | "normal" | "hoch";

/** Identité minimale d'un membre en lecture imbriquée (responsable, auteur d'une mise à jour,
 * contributeur) — même principe et même duplication volontaire que MembreResume
 * (types/evenements.ts) : pas de dépendance entre modules frontend qui n'en ont pas besoin.
 * `photo` est le chemin/URL renvoyé tel quel par le serializer (ImageField), jamais reconstruit
 * côté client. */
export interface MembreResumeProjet {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
}

export interface ProjetImage {
  id: string;
  projet: string;
  image: string;
  ordre: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProjetMiseAJourImage {
  id: string;
  mise_a_jour: string;
  image: string;
  ordre: number;
  created_at: string;
}

export interface ProjetMiseAJour {
  id: string;
  projet: string;
  titre: string;
  contenu_html: string;
  images: ProjetMiseAJourImage[];
  created_by: string | null;
  created_by_detail: MembreResumeProjet | null;
  created_at: string;
}

export interface Projet {
  id: string;
  titre: string;
  /** Texte riche produit par l'éditeur type Word (demande utilisateur point 1.2) — affiché tel
   * quel (dangerouslySetInnerHTML côté page), jamais retapé/reconstruit côté client. */
  description_html: string;
  statut: StatutProjet;
  sichtbarkeit: SichtbarkeitProjet;
  responsable: string | null;
  responsable_detail: MembreResumeProjet | null;
  /** Demande utilisateur point 2 : active/désactive les contributions libres. */
  cagnote_active: boolean;
  objectif_montant: string | null;
  /** Toujours recalculé côté serveur (CLAUDE.md §8) — jamais dénormalisé, jamais déduit côté
   * client à partir des contributions individuelles. */
  montant_collecte: string;
  /** Idem — jamais déduit du tableau `images`/`contributeurs` côté client. */
  nb_contributeurs: number;
  date_limite: string | null;
  /** Calculé côté serveur à partir de `date_limite` — bloque une nouvelle contribution (voir
   * hooks/useCotisations.useContribuerProjet). */
  echeance_depassee: boolean;
  ordre: number;
  images: ProjetImage[];
  /** Calculé côté serveur (Bureau Admin+ OU responsable de CE projet précis, voir
   * apps.projets.permissions.est_gestionnaire_projet) — jamais recalculé côté client en
   * comparant un id de membre : CidUser (store d'auth) et Membre sont deux modèles distincts
   * liés en 1-to-1 côté backend, le frontend n'a donc aucun moyen fiable de faire cette
   * comparaison lui-même. Pilote l'affichage conditionnel du formulaire d'ajout de mise à
   * jour dans le rapport d'avancement (demande utilisateur point 7). */
  est_gestionnaire: boolean;
  /** Rôle de l'utilisateur dans l'équipe du projet (calculé côté serveur), ou null. */
  meine_rolle: RolleProjet | null;
  /** Équipe, gestion ou service financier (lecture) — pilote le lien "Arbeitsbereich". */
  darf_arbeitsbereich: boolean;
  /** Direction du projet ou gestionnaire — pilote publication et gestion d'équipe. */
  darf_team_verwalten: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload de POST/PATCH /projets/projets/ — réservé au Bureau Admin+ côté backend
 * (ProjetPermission). `responsable` peut être laissé vide (aucun responsable assigné). */
export interface ProjetPayload {
  titre: string;
  description_html?: string;
  statut?: StatutProjet;
  sichtbarkeit?: SichtbarkeitProjet;
  responsable?: string | null;
  cagnote_active?: boolean;
  objectif_montant?: string | null;
  date_limite?: string | null;
  ordre?: number;
}

/** Payload multipart de POST /projets/images/ — Bureau Admin+ OU responsable DU PROJET ciblé
 * (voir apps.projets.permissions.est_gestionnaire_projet). `projet` est immuable après création
 * (toute tentative de le modifier via PATCH est silencieusement ignorée côté serveur, voir
 * ProjetImageSerializer.update). */
export interface ProjetImagePayload {
  projet: string;
  image: File;
  ordre?: number;
}

/** Payload de POST/PATCH /projets/mises-a-jour/ (rapport d'avancement, demande utilisateur
 * point 7) — même règle d'écriture que ProjetImagePayload. `projet` immuable après création. */
export interface ProjetMiseAJourPayload {
  projet: string;
  titre: string;
  contenu_html?: string;
}

/** Payload multipart de POST /projets/mises-a-jour-images/ — même règle d'écriture, dérivée du
 * projet de la mise à jour référencée. */
export interface ProjetMiseAJourImagePayload {
  mise_a_jour: string;
  image: File;
  ordre?: number;
}

/**
 * Une ligne de la face arrière de la kachel (demande utilisateur point 5, "Details zu den
 * Mitgliedern die beigetragen haben") — réponse de GET /projets/projets/{id}/contributeurs/,
 * agrégée côté serveur sur le registre Cotisation, jamais une Cotisation individuelle (voir
 * ContributeurSerializer côté backend).
 */
export interface Contributeur {
  membre: MembreResumeProjet;
  montant_total: string;
  derniere_contribution: string;
}

/**
 * Kennzahlen "Donators / Gesammelt / Projekte" de la page d'accueil publique (demande
 * utilisateur du 2026-09-26, plan "Öffentliche mycid.org-Startseite" section C.3) — réponse de
 * GET /projets/projets/kennzahlen/, voir docstring ProjetViewSet.kennzahlen côté backend.
 */
export interface ProjetsKennzahlen {
  nb_projets: number;
  montant_collecte: string;
  nb_donateurs: number;
}

export interface ProjetMitglied {
  id: string;
  projet: string;
  membre: string;
  membre_detail: MembreResumeProjet | null;
  rolle: RolleProjet;
  created_at: string;
}

export interface Aufgabe {
  id: string;
  projet: string;
  titel: string;
  beschreibung: string;
  verantwortlich: string | null;
  verantwortlich_detail: MembreResumeProjet | null;
  frist: string | null;
  prioritaet: PrioritaetAufgabe;
  status: StatutAufgabe;
  ordre: number;
  ueberfaellig: boolean;
  erledigt_am: string | null;
  kommentare_anzahl: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AufgabePayload {
  projet: string;
  titel: string;
  beschreibung?: string;
  verantwortlich?: string | null;
  frist?: string | null;
  prioritaet?: PrioritaetAufgabe;
  status?: StatutAufgabe;
}

export interface AufgabeKommentar {
  id: string;
  aufgabe: string;
  text: string;
  autor: string | null;
  autor_detail: MembreResumeProjet | null;
  created_at: string;
}

/** Réponse de GET /projets/projets/{id}/arbeitsbereich/ — progression calculée côté serveur. */
export interface Arbeitsbereich {
  gesamt: number;
  erledigt: number;
  ueberfaellig: number;
  prozent: number;
  pro_status: Record<StatutAufgabe, number>;
  team_groesse: number;
}

// --- Coûts du projet : plan / réel (2026-10-06) -------------------------------------------------

export type StatutKosten = "en_attente" | "approuvee" | "rejetee";

export interface KostenartAuswahl {
  id: string;
  nom: string;
}

export interface PlanKostenEintrag {
  id: string;
  projet: string;
  categorie: string;
  categorie_nom: string;
  betrag: string;
  notiz: string;
}

/** Une ligne réelle = `finances.Depense` liée au projet ; approuvée par le service financier. */
export interface KostenPosition {
  id: string;
  projet: string;
  date_depense: string;
  montant: string;
  categorie: string;
  categorie_nom: string;
  fournisseur: string;
  description: string;
  aufgabe: string | null;
  aufgabe_titel: string | null;
  justificatif_url: string | null;
  statut: StatutKosten;
  saisie_par: string | null;
  saisie_par_nom: string;
  decide_par_nom: string;
  motif_rejet: string;
}

export interface KostenPositionPayload {
  projet: string;
  date_depense: string;
  montant: string;
  categorie: string;
  fournisseur: string;
  description: string;
  aufgabe: string | null;
  justificatif?: File | null;
}

export interface KostenZeile {
  categorie: string;
  categorie_nom: string;
  plan: string;
  ist: string;
  offen: string;
  abweichung: string;
  prozent: number | null;
}

export interface KostenAufgabeZeile {
  aufgabe: string;
  titel: string;
  ist: string;
  offen: string;
}

/** Réponse de GET /projets/projets/{id}/kosten-uebersicht/. */
export interface KostenUebersicht {
  plan_gesamt: string;
  ist_gesamt: string;
  offen_gesamt: string;
  abweichung: string;
  einnahmen: string;
  ergebnis: string;
  kategorien: KostenZeile[];
  kostenarten: KostenartAuswahl[];
  aufgaben: KostenAufgabeZeile[];
  darf_erfassen: boolean;
  darf_plan_bearbeiten: boolean;
}
