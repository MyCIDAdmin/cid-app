/**
 * Client API — module cotisations (TDD §2.4, backend/apps/cotisations/views.py).
 */
import { apiClient } from "./client";
import type {
  ArticleCatalogue,
  ArticleCataloguePayload,
  ChangerStatutCotisationPayload,
  ConfigurationRelance,
  ConfigurationRelancePayload,
  Cotisation,
  CotisationContribuerProjetPayload,
  CotisationCreatePayload,
  CotisationsGestionFiltres,
  CotisationSaisieEspecesPayload,
  HistoriqueStatutCotisation,
  ModePaiement,
  PaiementEnLigneResponse,
} from "../types/cotisation";
import type { CursorPage } from "../types/membre";

/**
 * Historique des paiements (mockup #pg-cotisation, tableau "Historique des
 * paiements") — le backend scope déjà le queryset selon le rôle
 * (CotisationViewSet.get_queryset) : un rôle < RH ne voit ici que ses
 * propres écritures.
 */
export async function listMesCotisations(): Promise<CursorPage<Cotisation>> {
  // Pas de paramètre de tri à transmettre : CotisationCursorPagination
  // impose déjà l'ordre (-created_at, id) côté serveur.
  const { data } = await apiClient.get<CursorPage<Cotisation>>("/cotisations/");
  return data;
}

export async function creerCotisation(payload: CotisationCreatePayload): Promise<Cotisation> {
  const { data } = await apiClient.post<Cotisation>("/cotisations/", payload);
  return data;
}

/**
 * Contribution libre à un projet (module Projets & Actions, demande utilisateur point 2) —
 * réutilise le même endpoint générique que le reste du module (POST /cotisations/), voir
 * CotisationContribuerProjetPayload. Toujours en_attente à la création (AHM-53, même règle que
 * "don" en libre-service) : le paiement doit ensuite être confirmé (passerelle en ligne ou
 * Directeur Financier), voir useInitierPaiementEnLigne/useMarquerCotisationPayee.
 */
export async function contribuerProjet(
  payload: CotisationContribuerProjetPayload,
): Promise<Cotisation> {
  const { data } = await apiClient.post<Cotisation>("/cotisations/", payload);
  return data;
}

/**
 * GET /cotisations/{id}/ (AHM-46, page de retour de paiement) — même scope IDOR que le reste du
 * ViewSet : propriétaire ou RH+ uniquement (CotisationViewSet.get_queryset).
 */
export async function getCotisation(cotisationId: string): Promise<Cotisation> {
  const { data } = await apiClient.get<Cotisation>(`/cotisations/${cotisationId}/`);
  return data;
}

/**
 * POST /cotisations/{id}/initier-paiement-en-ligne/ (AHM-46) — crée une session Stripe Checkout
 * ou une commande PayPal Checkout (selon `mode_paiement` déjà enregistré sur la cotisation) et
 * renvoie son URL de redirection. Réservé au titulaire de la cotisation, modes carte/paypal
 * uniquement — voir apps.cotisations.views.CotisationViewSet.initier_paiement_en_ligne.
 */
export async function initierPaiementEnLigne(
  cotisationId: string,
): Promise<PaiementEnLigneResponse> {
  const { data } = await apiClient.post<PaiementEnLigneResponse>(
    `/cotisations/${cotisationId}/initier-paiement-en-ligne/`,
  );
  return data;
}

/**
 * GET /cotisations/{id}/receipt/ (AHM-17) — reçu PDF. 400 côté backend si la cotisation n'est
 * pas payée ; le bouton associé (CotisationStepperPage) n'est de toute façon affiché que pour
 * les lignes statut=payee, voir onSuccess du stepper et le rendu de l'historique.
 */
export async function telechargerRecuCotisation(cotisationId: string): Promise<Blob> {
  const { data } = await apiClient.get(`/cotisations/${cotisationId}/receipt/`, {
    responseType: "blob",
  });
  return data;
}

/**
 * File des paiements à confirmer manuellement (AHM-53) — cotisations restées "en_attente"
 * (ex. virement SEPA en cours de réconciliation). Même schéma que
 * adhesionsApi.listSouscriptionsEnAttenteJustificatif : un seul filtre statut, première page du
 * cursor seulement (petite association, pas encore de navigation de page sur cette file).
 * "echouee" (paiement carte/PayPal refusé côté simulateur) reste consultable via l'historique du
 * membre ou l'admin Django — hors scope de cette file de travail pour ce MVP.
 */
export async function listCotisationsEnAttenteDePaiement(): Promise<CursorPage<Cotisation>> {
  const { data } = await apiClient.get<CursorPage<Cotisation>>("/cotisations/", {
    params: { statut: "en_attente" },
  });
  return data;
}

/**
 * Liste des cotisations pour la page "Ausstehende Zahlungen" côté Directeur Financier/Admin,
 * élargie le 2026-09-19 (demande utilisateur : correction rétroactive du statut) — un `statut`
 * omis/vide renvoie toutes les cotisations (RH+ voit tout, voir CotisationViewSet.get_queryset),
 * pour retrouver une cotisation déjà "payee" à corriger, pas seulement les "en_attente".
 *
 * Élargie une seconde fois le 2026-09-21 (retour utilisateur : "Filter Möglichkeiten
 * hinzufügen") : `statut` reste géré séparément par les onglets côté page (voir
 * CotisationsEnAttentePage), les autres filtres (type d'article, mode de paiement, recherche
 * libre, plage de date de création) sont transmis tels quels au backend (CotisationFilter) — les
 * filtres vides ne sont jamais envoyés, même principe que membresApi.listMembres.
 */
export async function listCotisationsGestion(
  filtres: CotisationsGestionFiltres = {},
): Promise<CursorPage<Cotisation>> {
  const params = Object.fromEntries(
    Object.entries(filtres).filter(([, value]) => value !== undefined && value !== ""),
  );
  const { data } = await apiClient.get<CursorPage<Cotisation>>("/cotisations/", { params });
  return data;
}

/**
 * Enregistre directement une transaction en espèces déjà reçue pour le compte d'un membre
 * (F-015 étendu, retour utilisateur du 2026-09-21 : "Es soll möglich sein eine Zahlung als
 * Barzahlung einzutragen") — réutilise le même endpoint que le stepper libre-service, mais avec
 * `membre`/`mode_paiement`/`statut` explicites ; réservé côté backend au Directeur
 * Financier/Admin (CotisationViewSet.perform_create, branche "saisie pour autrui").
 */
export async function enregistrerPaiementEspeces(
  payload: CotisationSaisieEspecesPayload,
): Promise<Cotisation> {
  const { data } = await apiClient.post<Cotisation>("/cotisations/", payload);
  return data;
}

/** Nom de fichier suggéré par le serveur (Content-Disposition) — même repli que
 * boutiqueApi.exporterCommandesExcel (voir sa docstring). */
function nomFichierDepuisContentDisposition(contentDisposition: unknown, repli: string): string {
  const valeur = typeof contentDisposition === "string" ? contentDisposition : "";
  const correspondance = /filename="?([^"]+)"?/.exec(valeur);
  return correspondance?.[1] ?? repli;
}

/**
 * GET /cotisations/export/ (ajouté le 2026-09-25, module "Ausstehende Zahlungen" renommé
 * "Zahlungen" — demande utilisateur : "Excel-Export der Zahlungen") — export Excel, mêmes
 * filtres/scope que listCotisationsGestion (statut, type d'article, mode de paiement, recherche
 * libre, plage de date — voir CotisationViewSet.export côté backend).
 */
export async function exporterCotisationsExcel(
  filtres: CotisationsGestionFiltres = {},
): Promise<{ blob: Blob; nomFichier: string }> {
  const params = Object.fromEntries(
    Object.entries(filtres).filter(([, value]) => value !== undefined && value !== ""),
  );
  const { data, headers } = await apiClient.get("/cotisations/export/", {
    params,
    responseType: "blob",
  });
  return {
    blob: data,
    nomFichier: nomFichierDepuisContentDisposition(
      headers["content-disposition"],
      "export_zahlungen.xlsx",
    ),
  };
}

/**
 * POST /cotisations/{id}/changer-statut/ (ajouté le 2026-09-19) — corrige le statut vers
 * n'importe lequel des 5 statuts, avec motif optionnel, réservé au Directeur Financier/Admin
 * côté backend (CotisationViewSet.changer_statut). Contrairement à marquerCotisationPayee,
 * autorise aussi de revenir en arrière depuis "payee".
 */
export async function changerStatutCotisation(
  cotisationId: string,
  payload: ChangerStatutCotisationPayload,
): Promise<Cotisation> {
  const { data } = await apiClient.post<Cotisation>(
    `/cotisations/${cotisationId}/changer-statut/`,
    payload,
  );
  return data;
}

/** GET /cotisations/{id}/historique-statuts/ (ajouté le 2026-09-19) — même scope IDOR que le
 * reste du ViewSet (propriétaire ou RH+). */
export async function getHistoriqueStatutsCotisation(
  cotisationId: string,
): Promise<HistoriqueStatutCotisation[]> {
  const { data } = await apiClient.get<HistoriqueStatutCotisation[]>(
    `/cotisations/${cotisationId}/historique-statuts/`,
  );
  return data;
}

/**
 * POST /cotisations/{id}/marquer-payee/ (AHM-53) — confirme manuellement un paiement reçu hors
 * ligne. Réservé au Directeur Financier/Admin côté backend (CotisationViewSet.marquer_payee) ;
 * `mode_paiement` n'est requis que si la cotisation n'en a pas déjà un.
 */
export async function marquerCotisationPayee(
  cotisationId: string,
  // `date_paiement` (demande utilisateur du 2026-09-29, voir docstring
  // ChangerStatutCotisationPayload dans types/cotisation.ts pour le détail) : même champ que
  // changerStatutCotisation ci-dessus, absente/vide -> comportement inchangé.
  payload: { mode_paiement?: ModePaiement; date_paiement?: string },
): Promise<Cotisation> {
  const { data } = await apiClient.post<Cotisation>(
    `/cotisations/${cotisationId}/marquer-payee/`,
    payload,
  );
  return data;
}

/**
 * Échéances des relances par année (AHM-54) — Directeur Financier/Admin uniquement côté backend
 * (ConfigurationRelanceViewSet). Petite liste (une ligne par année) : première page suffit,
 * même choix que listCotisationsEnAttenteDePaiement.
 */
export async function listConfigurationsRelance(): Promise<CursorPage<ConfigurationRelance>> {
  const { data } = await apiClient.get<CursorPage<ConfigurationRelance>>(
    "/cotisations/configurations-relance/",
  );
  return data;
}

export async function creerConfigurationRelance(
  payload: ConfigurationRelancePayload,
): Promise<ConfigurationRelance> {
  const { data } = await apiClient.post<ConfigurationRelance>(
    "/cotisations/configurations-relance/",
    payload,
  );
  return data;
}

export async function modifierConfigurationRelance(
  id: string,
  payload: { date_echeance: string },
): Promise<ConfigurationRelance> {
  const { data } = await apiClient.patch<ConfigurationRelance>(
    `/cotisations/configurations-relance/${id}/`,
    payload,
  );
  return data;
}

export async function supprimerConfigurationRelance(id: string): Promise<void> {
  await apiClient.delete(`/cotisations/configurations-relance/${id}/`);
}

/**
 * Catalogue d'articles de paiement personnalisés (retour utilisateur du 2026-09-17, voir
 * apps.cotisations.models.ArticleCatalogue). Lecture ouverte à tout authentifié — le backend
 * scope automatiquement aux articles actif=true pour un rôle < Administrateur App
 * (ArticleCatalogueViewSet.get_queryset) ; l'Administrateur App voit aussi les désactivés (pour
 * pouvoir les réactiver).
 */
export async function listArticlesCatalogue(): Promise<CursorPage<ArticleCatalogue>> {
  const { data } = await apiClient.get<CursorPage<ArticleCatalogue>>(
    "/cotisations/articles-catalogue/",
  );
  return data;
}

/** Réservé à l'Administrateur App côté backend (ArticleCataloguePermission). */
export async function creerArticleCatalogue(
  payload: ArticleCataloguePayload,
): Promise<ArticleCatalogue> {
  const { data } = await apiClient.post<ArticleCatalogue>(
    "/cotisations/articles-catalogue/",
    payload,
  );
  return data;
}

/**
 * PATCH partiel — sert à la fois à corriger libellé/montant et à basculer `actif` (pas de
 * suppression exposée, voir docstring de module ArticleCatalogue). Réservé à l'Administrateur
 * App côté backend.
 */
export async function modifierArticleCatalogue(
  id: string,
  payload: Partial<ArticleCataloguePayload> & { actif?: boolean },
): Promise<ArticleCatalogue> {
  const { data } = await apiClient.patch<ArticleCatalogue>(
    `/cotisations/articles-catalogue/${id}/`,
    payload,
  );
  return data;
}
