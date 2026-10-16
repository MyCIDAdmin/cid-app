/**
 * Types partagés — module adhesions (miroir de apps.adhesions.models /
 * serializers côté backend, AHM-19). Garder synchronisé en cas de
 * changement de schéma.
 */

import type { Uebersetzungen } from "../utils/uebersetzung";

export type StatutCampagne = "brouillon" | "publiee" | "cloturee";

export type StatutSouscription =
  | "brouillon"
  | "en_attente_justificatif"
  | "en_attente_paiement"
  | "payee"
  | "rabais_refuse"
  | "annulee"
  | "expiree";

export type TypeRabais = "etudiant" | "famille" | "senior" | "autre";

export interface AvantageOffre {
  ordre: number;
  texte_fr: string;
  texte_de?: string;
  texte_ar?: string;
}

export interface RabaisOffre {
  id: string;
  offre: string;
  type_rabais: TypeRabais;
  label_fr: string;
  label_de: string;
  label_ar: string;
  montant_reduction: string | null;
  pct_reduction: string | null;
  justificatif_requis: boolean;
  instructions_fr: string;
  instructions_de: string;
  instructions_ar: string;
}

/**
 * Slots de couleur de surlignage d'une offre — miroir de apps.adhesions.models.CouleurOffre
 * (retour utilisateur du 2026-09-29, "Färblich highlighten") : réutilise volontairement les 3
 * mêmes emplacements catégoriels que ACCENTS_OFFRE (MonAdhesionPage.tsx), jamais une couleur
 * libre — voir le docstring backend de CouleurOffre pour la justification. Chaîne vide = pas de
 * choix explicite (attribution automatique par index, comportement historique).
 */
export type CouleurOffre = "" | "cat_1" | "cat_2" | "cat_3";

/** Look der digitalen Mitgliedskarte — Spiegel von apps.adhesions.models.KartenStil. Leer = Rubin. */
export type KartenStil = "weiss" | "silber" | "gold" | "diamant" | "bronze" | "onyx" | "rubin";

export interface OffreAdhesion {
  /** DeepL-Übersetzungen der Textfelder (apps.uebersetzung), siehe utils/uebersetzung. */
  uebersetzungen?: Uebersetzungen;
  id: string;
  campagne: string;
  nom: string;
  prix_plein: string;
  description: string;
  avantages: AvantageOffre[];
  condition_age_min: number | null;
  condition_age_max: number | null;
  visible: boolean;
  ordre: number;
  // Trois champs ajoutés le 2026-09-29 (retour utilisateur, "Verwaltung der
  // Mitgliedschaftskampagnen" : "1. Icons für jede Angebotskachel hochladen 2. Färblich
  // highlighten 3. Tags hinzufügen wie... der Tag 'Popular'") — voir
  // apps.adhesions.models.OffreAdhesion côté backend.
  icone: string | null;
  couleur: CouleurOffre;
  kartenstil?: KartenStil | "";
  populaire: boolean;
  // Familienpaket (R35) — Kombination bestehender Angebote : Hauptperson, weitere Erwachsene und
  // Kinder erhalten das zugewiesene Angebot ; Preis = Summe der Angebote minus Rabatt in %.
  ist_familienpaket: boolean;
  familie_rabatt_pct: string;
  familie_angebot_hauptperson: string | null;
  familie_angebot_erwachsene: string | null;
  familie_angebot_kinder: string | null;
  max_erwachsene: number;
  max_kinder: number;
  rabais: RabaisOffre[];
}

export interface CampagneAdhesion {
  /** DeepL-Übersetzungen der Textfelder (apps.uebersetzung), siehe utils/uebersetzung. */
  uebersetzungen?: Uebersetzungen;
  id: string;
  nom: string;
  annee: number;
  date_debut: string;
  date_fin: string;
  description: string;
  statut: StatutCampagne;
  /** Frist für Bestandsmitglieder (point 3, 2026-10-06) — null = pas de bascule automatique. */
  date_limite_renouvellement: string | null;
  bascule_non_renouveles_le: string | null;
  /** Höchstalter eines Kindes im Familienpaket, je Kampagne (Jahr der Kampagne − Geburtsjahr). */
  familie_max_alter_kind: number;
  created_by: string;
  created_at: string;
  offres: OffreAdhesion[];
}

/**
 * Payload accepté par POST /adhesions/campagnes/ (voir
 * CampagneAdhesionSerializer.Meta.read_only_fields — statut/created_by ne
 * sont jamais transmis par le client : une campagne naît toujours en
 * brouillon, publier/cloturer passent par leurs actions dédiées).
 */
export interface CampagneCreatePayload {
  nom: string;
  annee: number;
  date_debut: string;
  date_fin: string;
  description?: string;
  date_limite_renouvellement?: string | null;
  familie_max_alter_kind?: number;
}

/**
 * Payload de POST/PATCH /adhesions/offres/ (OffreAdhesionSerializer — seul `id` est en
 * lecture seule, `rabais` est nichée en lecture seule séparément, AHM-19/demande utilisateur
 * du 2026-09-16 "tool" d'administration des campagnes).
 */
export interface OffreCreatePayload {
  campagne: string;
  nom: string;
  prix_plein: string;
  description?: string;
  avantages?: AvantageOffre[];
  condition_age_min?: number | null;
  condition_age_max?: number | null;
  visible?: boolean;
  ordre?: number;
  // `icone` n'apparaît volontairement pas ici : comme Produit.image (boutique), elle ne se
  // televerse qu'en multipart/form-data via un endpoint dédié — voir televerserIconeOffre.
  couleur?: CouleurOffre;
  kartenstil?: KartenStil | "";
  populaire?: boolean;
  ist_familienpaket?: boolean;
  familie_rabatt_pct?: string;
  familie_angebot_hauptperson?: string | null;
  familie_angebot_erwachsene?: string | null;
  familie_angebot_kinder?: string | null;
  max_erwachsene?: number;
  max_kinder?: number;
}

/** Payload de POST/PATCH /adhesions/rabais/ (RabaisOffreSerializer). */
export interface RabaisCreatePayload {
  offre: string;
  type_rabais: TypeRabais;
  label_fr: string;
  label_de?: string;
  label_ar?: string;
  montant_reduction?: string | null;
  pct_reduction?: string | null;
  justificatif_requis?: boolean;
  instructions_fr?: string;
  instructions_de?: string;
  instructions_ar?: string;
}

export type StatutJustificatif = "en_attente" | "approuve" | "rejete";

/**
 * Miroir de JustificatifRabaisSerializer (AHM-20) — volontairement sans `fichier` : le fichier
 * ne se récupère que via GET /adhesions/justificatifs/{id}/telecharger/ (URL MinIO pré-signée,
 * TTL 15 min), jamais en clair dans cette réponse (voir le docstring backend correspondant).
 */
export interface JustificatifRabais {
  id: string;
  souscription: string;
  type_justificatif: string;
  statut: StatutJustificatif;
  valide_par: string | null;
  date_decision: string | null;
  motif_rejet: string;
  created_at: string;
}

/** Entrée de POST /adhesions/justificatifs/{id}/valider/ (RH+, AHM-20). */
export interface ValiderJustificatifPayload {
  decision: "approuve" | "rejete";
  motif_rejet?: string;
}

export type Beziehung = "ehepartner" | "kind" | "geschwister" | "elternteil";

export const BEZIEHUNGEN: Beziehung[] = ["ehepartner", "kind", "geschwister", "elternteil"];
export const KIND_BEZIEHUNGEN: Beziehung[] = ["kind", "geschwister"];

export type EinladungStatus =
  "offen" | "eingeladen" | "zustimmung_offen" | "angenommen" | "abgelehnt" | "konflikt";

/** Kind in einem Familienpaket — kein Mitglied, nur Teil der Souscription. */
export interface FamilienKind {
  id: string;
  vorname: string;
  nachname: string;
  geburtsjahr: number;
  alter: number;
  beziehung: Beziehung;
  kartennummer: string;
  /** Name des zugewiesenen Angebots und dessen Kartenstil. */
  angebot: string;
  kartenstil: KartenStil | "";
  preis_liste: string;
  preis_anteil: string;
  einwilligung_am: string;
  /** Nach der Aufbewahrungsfrist anonymisiert (kein Name mehr). */
  anonymisiert: boolean;
  /** Älter als das Höchstalter der Kampagne. */
  ueber_hoechstalter: boolean;
}

/** Weitere erwachsene Person im Paket (wird per Einladung eigenes Mitglied). */
export interface FamilienErwachsener {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  beziehung: Beziehung;
  status: EinladungStatus;
  angebot: string;
  preis_liste: string;
  preis_anteil: string;
  anonymisiert: boolean;
}

/** Eingabe beim Buchen (wird mit der Souscription in einem Schritt gesendet). */
export interface ErwachsenerPayload {
  vorname: string;
  nachname: string;
  email: string;
  beziehung: Beziehung;
}

export interface KindPayload {
  vorname: string;
  nachname: string;
  geburtsjahr: number;
  beziehung: Beziehung;
  einwilligung: boolean;
}

/** Rolle der Souscription im Paket — Hauptperson (zahlt) oder eingeladenes Mitglied. */
export type FamilienInfo =
  | {
      rolle: "hauptperson";
      rabatt_pct: string;
      gesamtpreis: string;
      angebot: string;
      kartenstil: KartenStil | "";
    }
  | { rolle: "mitglied"; hauptperson: string; listenpreis: string; anteil: string };

/** Büro-Übersicht GET /adhesions/familienpakete/. */
export interface FamilienpaketPerson {
  id: string;
  name: string;
  beziehung: Beziehung;
  angebot: string | null;
  angebot_id: string | null;
  preis_liste: string;
  preis_anteil: string;
}

export interface FamilienpaketBuero {
  id: string;
  hauptperson: string;
  numero_membre: string;
  angebot: string;
  hauptperson_angebot: string | null;
  campagne: string;
  statut: StatutSouscription;
  gesamtpreis: string;
  listenpreis: string;
  rabatt_pct: string;
  haupt_preis_liste: string;
  haupt_preis_anteil: string;
  erwachsene: (FamilienpaketPerson & {
    email: string;
    status: EinladungStatus;
    anonymisiert: boolean;
  })[];
  kinder: (FamilienpaketPerson & {
    alter: number;
    anonymisiert: boolean;
    ueber_hoechstalter: boolean;
  })[];
}

export interface FamilienpaketeUebersicht {
  zusammenfassung: {
    pakete_bezahlt: number;
    erwachsene_angenommen: number;
    erwachsene_offen: number;
    erwachsene_konflikt: number;
    kinder_eingetragen: number;
    listenpreis_gesamt: string;
    gezahlt_gesamt: string;
    familienrabatt_gesamt: string;
  };
  pakete: FamilienpaketBuero[];
}

/** Einladung ins Familienpaket (öffentlich per Token, GET /adhesions/einladungen/<token>/). */
export interface Einladung {
  token: string;
  hauptperson: string;
  kampagne: string;
  angebot: string | null;
  vorname: string;
  nachname: string;
  email: string;
  beziehung: Beziehung;
  status: EinladungStatus;
  bezahlt: boolean;
  konto_vorhanden: boolean;
}

export interface Souscription {
  id: string;
  membre: string;
  offre: string;
  campagne: string;
  date_souscription: string;
  prix_paye: string;
  rabais: string | null;
  statut: StatutSouscription;
  cotisation: string | null;
  snapshot_avantages: AvantageOffre[];
  // Familienpaket — gebuchte Plätze, eingetragene Personen (leer bei Einzelangeboten).
  plaetze_erwachsene: number;
  plaetze_kinder: number;
  kinder: FamilienKind[];
  erwachsene: FamilienErwachsener[];
  familien_info: FamilienInfo | null;
  // Nichée en lecture seule par SouscriptionSerializer (AHM-20) — null tant qu'aucun
  // justificatif n'a été uploadé pour cette souscription.
  justificatif: JustificatifRabais | null;
  created_at: string;
  updated_at: string;
}

/**
 * Payload de POST /adhesions/souscriptions/souscrire/ (voir
 * SouscrireSerializer) — ni prix ni statut ne sont envoyés : entièrement
 * recalculés côté serveur (CLAUDE.md §8, voir SouscriptionViewSet.souscrire).
 */
export interface SouscrirePayload {
  offre: string;
  rabais?: string;
  /** Nur bei Familienpaketen : alle weiteren Personen, in einem Schritt mit der Buchung. */
  erwachsene?: ErwachsenerPayload[];
  kinder?: KindPayload[];
}

/**
 * Payload de POST /adhesions/souscriptions/souscrire-especes/ (ajouté le 2026-09-21, retour
 * utilisateur : "Füge mitgliedschaftsbeitrag hinzu mit den aktuellen Angebote", dans le
 * formulaire "Barzahlung eintragen" de CotisationsEnAttentePage) — réservé au Directeur
 * Financier/Admin App, voir SouscrireEspecesSerializer côté backend. Contrairement à
 * SouscrirePayload : `membre` explicite (saisie pour autrui, F-015) et pas de `rabais` (un
 * rabais nécessite un justificatif validé par RH avant paiement, incompatible avec une saisie
 * immédiate en espèces).
 */
export interface SouscrireEspecesPayload {
  membre: string;
  offre: string;
}

/** Vorschlag zum Übernehmen aus dem letzten Familienpaket (GET /adhesions/familienpakete/vorjahr/). */
export interface VorjahrPerson {
  vorname: string;
  nachname: string;
  beziehung: Beziehung;
}

export interface VorjahrFamilie {
  quelle: string | null;
  erwachsene: (VorjahrPerson & { email: string })[];
  kinder: (VorjahrPerson & { geburtsjahr: number })[];
  /** Kinder, die für die neue Kampagne zu alt sind : als Erwachsene vorschlagen (E-Mail fehlt). */
  aelter_geworden: (VorjahrPerson & { geburtsjahr: number })[];
}

/** Bericht ohne Personenbezug (GET /adhesions/familienpakete/bericht/). */
export interface FamilienberichtZeile {
  campagne_id: string;
  campagne: string;
  jahr: number;
  pakete: number;
  erwachsene_angenommen: number;
  erwachsene_offen: number;
  erwachsene_abgelehnt: number;
  erwachsene_konflikt: number;
  kinder: number;
  kinder_anonymisiert: number;
  kinder_ueber_hoechstalter: number;
  altersgruppen: Record<"0-5" | "6-11" | "12-17" | "18+", number>;
  listenpreis: string;
  gezahlt: string;
  rabatt: string;
  rabatt_pct: string;
}
