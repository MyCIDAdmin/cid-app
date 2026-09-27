/**
 * Client API — module boutique (TDD §2.4, backend/apps/boutique/views.py).
 */
import { apiClient } from "./client";
import type { CursorPage } from "../types/membre";
import type {
  BonAchat,
  BonAchatVerification,
  ChangerStatutCommandePayload,
  Commande,
  ConfirmerPaiementCommandePayload,
  ExpedierCommandePayload,
  InitierPaiementEnLigneCommandePayload,
  PaiementEnLigneCommandeResponse,
  PasserCommandePayload,
  Produit,
  ProduitImage,
  ProduitImagePayload,
  ProduitPayload,
  RegleReduction,
  RegleReductionPayload,
  Retour,
  RetourPayload,
  StatutBonAchat,
  StatutCommande,
  StatutProduit,
  VarianteProduit,
  VariantePayload,
  VendreEspecesCommandePayload,
  VerifierBonAchatPayload,
} from "../types/boutique";

export interface ProduitsFiltres {
  categorie?: string;
  statut?: StatutProduit;
  nouveaute?: boolean;
  cursor?: string;
}

/**
 * Catalogue — lecture ouverte à tout authentifié (CatalogueBoutiquePermission) : un rôle
 * < Bureau Admin ne reçoit de toute façon que les produits publiés (voir
 * ProduitViewSet.get_queryset côté backend), inutile de le refiltrer ici.
 */
export async function listProduits(filtres: ProduitsFiltres = {}): Promise<CursorPage<Produit>> {
  const { data } = await apiClient.get<CursorPage<Produit>>("/boutique/produits/", {
    params: filtres,
  });
  return data;
}

/**
 * Détail d'un produit (page ProduitDetailPage, `/boutique/:id`, demande utilisateur du
 * 2026-09-26 : porter la page de détail de https://www.mycid.org/shop) — même règle d'accès
 * que listProduits (CatalogueBoutiquePermission ; le backend ne renvoie de toute façon que les
 * produits publiés à un rôle < Bureau Admin, voir ProduitViewSet.get_queryset).
 */
export async function getProduit(id: string): Promise<Produit> {
  const { data } = await apiClient.get<Produit>(`/boutique/produits/${id}/`);
  return data;
}

export async function creerProduit(payload: ProduitPayload): Promise<Produit> {
  const { data } = await apiClient.post<Produit>("/boutique/produits/", payload);
  return data;
}

export async function modifierProduit(
  id: string,
  payload: Partial<ProduitPayload>,
): Promise<Produit> {
  const { data } = await apiClient.patch<Produit>(`/boutique/produits/${id}/`, payload);
  return data;
}

export async function supprimerProduit(id: string): Promise<void> {
  await apiClient.delete(`/boutique/produits/${id}/`);
}

/**
 * Upload de l'image produit — appel distinct de `modifierProduit` (JSON) car il envoie du
 * `multipart/form-data` (axios détecte FormData et fixe lui-même le Content-Type/boundary,
 * aucune config client supplémentaire nécessaire). Validation MIME + stockage MinIO déjà en
 * place côté backend (Produit.image, storage.py) — voir CLAUDE.md §8.
 */
export async function televerserImageProduit(id: string, fichier: File): Promise<Produit> {
  const formData = new FormData();
  formData.append("image", fichier);
  const { data } = await apiClient.patch<Produit>(`/boutique/produits/${id}/`, formData);
  return data;
}

/**
 * Galerie de photos supplémentaires (demande utilisateur du 2026-09-27, point 13.1 "mehr als
 * ein Bild pro Produkt hochladen... die Bilder können User sich im Shop anschauen") — même
 * principe que apps.projets/ajouterImageProjet : `multipart/form-data`, lecture ouverte à tout
 * le monde (voir CatalogueBoutiquePermission côté backend), écriture réservée à la page
 * "Shop-Verwaltung". Pas d'appel de listing dédié : `Produit.images` est déjà imbriqué dans la
 * réponse de /boutique/produits/ (voir ProduitSerializer côté backend, même convention que
 * Projet.images) — ces mutations invalident simplement la requête produit(s) parente.
 */
export async function ajouterImageProduit(payload: ProduitImagePayload): Promise<ProduitImage> {
  const formData = new FormData();
  formData.append("produit", payload.produit);
  formData.append("image", payload.image);
  if (payload.ordre !== undefined) {
    formData.append("ordre", String(payload.ordre));
  }
  const { data } = await apiClient.post<ProduitImage>("/boutique/produit-images/", formData);
  return data;
}

export async function supprimerImageProduit(id: string): Promise<void> {
  await apiClient.delete(`/boutique/produit-images/${id}/`);
}

export async function listVariantes(produitId: string): Promise<CursorPage<VarianteProduit>> {
  const { data } = await apiClient.get<CursorPage<VarianteProduit>>("/boutique/variantes/", {
    params: { produit: produitId },
  });
  return data;
}

/**
 * Revalidation live du stock panier (`VarianteProduitViewSet.filterset_fields` expose
 * `id__in`) — utilisée à l'ouverture du panier pour détecter les articles devenus
 * "ausverkauft" depuis leur ajout (le panier ne conserve qu'un instantané figé du stock,
 * voir store/panierStore.ts). Retourne un tableau vide sans appel réseau si `ids` est vide.
 */
export async function listVariantesParIds(ids: string[]): Promise<VarianteProduit[]> {
  if (ids.length === 0) return [];
  const { data } = await apiClient.get<CursorPage<VarianteProduit>>("/boutique/variantes/", {
    params: { id__in: ids.join(",") },
  });
  return data.results;
}

export async function creerVariante(payload: VariantePayload): Promise<VarianteProduit> {
  const { data } = await apiClient.post<VarianteProduit>("/boutique/variantes/", payload);
  return data;
}

export async function modifierVariante(
  id: string,
  payload: Partial<VariantePayload>,
): Promise<VarianteProduit> {
  const { data } = await apiClient.patch<VarianteProduit>(`/boutique/variantes/${id}/`, payload);
  return data;
}

export async function supprimerVariante(id: string): Promise<void> {
  await apiClient.delete(`/boutique/variantes/${id}/`);
}

export interface ReglesReductionFiltres {
  produit?: string;
  cursor?: string;
}

/**
 * Paliers de réduction par quantité (demande utilisateur du 2026-09-23) — lecture ouverte à
 * tout authentifié (voir RegleReductionViewSet.get_queryset, un rôle < Bureau Admin ne reçoit
 * de toute façon que les règles actives d'un produit publié) ; écriture Bureau Admin+, même
 * permission que Produit/VarianteProduit (CatalogueBoutiquePermission).
 */
export async function listReglesReduction(
  filtres: ReglesReductionFiltres = {},
): Promise<CursorPage<RegleReduction>> {
  const { data } = await apiClient.get<CursorPage<RegleReduction>>("/boutique/regles-reduction/", {
    params: filtres,
  });
  return data;
}

export async function creerRegleReduction(payload: RegleReductionPayload): Promise<RegleReduction> {
  const { data } = await apiClient.post<RegleReduction>("/boutique/regles-reduction/", payload);
  return data;
}

export async function modifierRegleReduction(
  id: string,
  payload: Partial<RegleReductionPayload>,
): Promise<RegleReduction> {
  const { data } = await apiClient.patch<RegleReduction>(
    `/boutique/regles-reduction/${id}/`,
    payload,
  );
  return data;
}

export async function supprimerRegleReduction(id: string): Promise<void> {
  await apiClient.delete(`/boutique/regles-reduction/${id}/`);
}

export interface CommandesFiltres {
  statut?: StatutCommande;
  /** Recherche libre sur le nom du destinataire (icontains côté backend) — ajouté le
   * 2026-09-25, demande utilisateur module "Shop-Verwaltung" ("Filtermöglichkeiten hinzufügen
   * z.B. Datumsintervall, Empfänger"). */
  destinataire?: string;
  /** Bornes de l'intervalle de dates de commande (ISO "AAAA-MM-JJ"), voir
   * apps.boutique.filters.CommandeFilter.date_apres/date_avant — comparées à la DATE de
   * Commande.created_at, jamais à l'heure exacte. */
  date_apres?: string;
  date_avant?: string;
  cursor?: string;
}

/**
 * Bureau Admin+ voit toutes les commandes ; en dessous, uniquement les siennes (IDOR géré
 * côté backend — CommandeViewSet.get_queryset) : cette fonction sert donc aussi bien à
 * "Mes commandes" (membre) qu'à la liste de gestion admin, selon le rôle courant.
 */
export async function listCommandes(filtres: CommandesFiltres = {}): Promise<CursorPage<Commande>> {
  const { data } = await apiClient.get<CursorPage<Commande>>("/boutique/commandes/", {
    params: filtres,
  });
  return data;
}

export async function passerCommande(payload: PasserCommandePayload): Promise<Commande> {
  const { data } = await apiClient.post<Commande>("/boutique/commandes/passer/", payload);
  return data;
}

/**
 * Vente au comptoir/vereinfachter Kassenverkauf pour le compte d'un autre membre (ajouté le
 * 2026-09-21, F-015) — voir CommandeViewSet.vendre_especes côté backend.
 */
export async function vendreEspeces(payload: VendreEspecesCommandePayload): Promise<Commande> {
  const { data } = await apiClient.post<Commande>("/boutique/commandes/vendre-especes/", payload);
  return data;
}

/**
 * GET /boutique/commandes/{id}/ (page de retour de paiement, même principe que
 * cotisationsApi.getCotisation/AHM-46) — même scope IDOR que le reste du ViewSet : propriétaire
 * ou Bureau Admin+ uniquement (CommandeViewSet.get_queryset).
 */
export async function getCommande(id: string): Promise<Commande> {
  const { data } = await apiClient.get<Commande>(`/boutique/commandes/${id}/`);
  return data;
}

export async function annulerCommande(id: string): Promise<Commande> {
  const { data } = await apiClient.post<Commande>(`/boutique/commandes/${id}/annuler/`);
  return data;
}

export async function changerStatutCommande(
  id: string,
  payload: ChangerStatutCommandePayload,
): Promise<Commande> {
  const { data } = await apiClient.post<Commande>(
    `/boutique/commandes/${id}/changer-statut/`,
    payload,
  );
  return data;
}

/**
 * Confirme la réception du paiement (en_attente -> confirmee), Directeur Financier+ —
 * demande utilisateur du 2026-09-15. Aucune passerelle de paiement réelle n'est appelée ici
 * (voir ModePaiementCommande côté types) : c'est une confirmation déclarative, la passerelle
 * réelle étant hors périmètre (ticket AHM-27).
 */
export async function confirmerPaiementCommande(
  id: string,
  payload: ConfirmerPaiementCommandePayload,
): Promise<Commande> {
  const { data } = await apiClient.post<Commande>(
    `/boutique/commandes/${id}/confirmer-paiement/`,
    payload,
  );
  return data;
}

/**
 * POST /boutique/commandes/{id}/initier-paiement-en-ligne/ (ajouté le 2026-09-17, même principe
 * que cotisationsApi.initierPaiementEnLigne/AHM-46) — crée une session Stripe Checkout ou une
 * commande PayPal Checkout pour cette commande et renvoie son URL de redirection. Réservé au
 * propriétaire de la commande (paiement en libre-service uniquement), voir
 * apps.boutique.views.CommandeViewSet.initier_paiement_en_ligne.
 */
export async function initierPaiementEnLigneCommande(
  id: string,
  payload: InitierPaiementEnLigneCommandePayload,
): Promise<PaiementEnLigneCommandeResponse> {
  const { data } = await apiClient.post<PaiementEnLigneCommandeResponse>(
    `/boutique/commandes/${id}/initier-paiement-en-ligne/`,
    payload,
  );
  return data;
}

/**
 * Expédie la commande (-> expediee), Directeur Financier+. `payload.nacherfassement: true`
 * pour une saisie rétroactive (Alt-/Sonderfälle) — voir ExpedierCommandePayload.
 */
export async function expedierCommande(
  id: string,
  payload: ExpedierCommandePayload,
): Promise<Commande> {
  const { data } = await apiClient.post<Commande>(`/boutique/commandes/${id}/expedier/`, payload);
  return data;
}

/**
 * GET /boutique/commandes/{id}/confirmation/ (ajouté le 2026-09-25, demande utilisateur module
 * "Shop-Verwaltung") — Bestellbestätigung PDF, disponible pour toute commande quel que soit son
 * statut. Même principe que cotisationsApi.telechargerRecuCotisation (blob + téléchargement
 * déclenché côté composant).
 */
export async function telechargerConfirmationCommande(id: string): Promise<Blob> {
  const { data } = await apiClient.get(`/boutique/commandes/${id}/confirmation/`, {
    responseType: "blob",
  });
  return data;
}

/**
 * GET /boutique/commandes/{id}/facture/ (ajouté le 2026-09-25) — Rechnung PDF, disponible
 * uniquement une fois le paiement de la commande confirmé ; 400 côté backend sinon (le bouton
 * associé n'est de toute façon affiché que pour une commande dont `date_paiement_confirme` est
 * renseignée, voir GestionCommandesTab).
 */
export async function telechargerFactureCommande(id: string): Promise<Blob> {
  const { data } = await apiClient.get(`/boutique/commandes/${id}/facture/`, {
    responseType: "blob",
  });
  return data;
}

/** Nom de fichier suggéré par le serveur (Content-Disposition) — même repli que
 * membresApi (voir sa docstring) : un téléchargement ne doit jamais échouer pour un simple
 * souci de nommage. */
function nomFichierDepuisContentDisposition(contentDisposition: unknown, repli: string): string {
  const valeur = typeof contentDisposition === "string" ? contentDisposition : "";
  const correspondance = /filename="?([^"]+)"?/.exec(valeur);
  return correspondance?.[1] ?? repli;
}

/**
 * GET /boutique/commandes/export/ (ajouté le 2026-09-25, demande utilisateur module
 * "Shop-Verwaltung" : "Es soll möglich sein die Bestellungen als Excel zu exportieren") — export
 * Excel, mêmes filtres/scope que listCommandes (statut, destinataire, date_apres/date_avant —
 * jamais paginé, voir CommandeViewSet.export côté backend).
 */
export async function exporterCommandesExcel(
  filtres: CommandesFiltres = {},
): Promise<{ blob: Blob; nomFichier: string }> {
  // `cursor` n'a pas de sens pour un export (jamais paginé, voir CommandeViewSet.export) —
  // omis explicitement plutôt que transmis tel quel au cas où l'appelant le fournirait.
  const { statut, destinataire, date_apres, date_avant } = filtres;
  const { data, headers } = await apiClient.get("/boutique/commandes/export/", {
    params: { statut, destinataire, date_apres, date_avant },
    responseType: "blob",
  });
  return {
    blob: data,
    nomFichier: nomFichierDepuisContentDisposition(
      headers["content-disposition"],
      "export_commandes.xlsx",
    ),
  };
}

export interface RetoursFiltres {
  commande?: string;
  cursor?: string;
}

/** Retours partiels par ligne de commande — Bureau Admin+ (voir RetourPermission). */
export async function listRetours(filtres: RetoursFiltres = {}): Promise<CursorPage<Retour>> {
  const { data } = await apiClient.get<CursorPage<Retour>>("/boutique/retours/", {
    params: filtres,
  });
  return data;
}

export async function creerRetour(payload: RetourPayload): Promise<Retour> {
  const { data } = await apiClient.post<Retour>("/boutique/retours/", payload);
  return data;
}

// --- Bons d'achat (demande utilisateur du 2026-09-23 : "Es soll möglich sein Gutscheine zu
// Kaufen") ---

export interface BonsAchatFiltres {
  statut?: StatutBonAchat;
  cursor?: string;
}

/**
 * Bureau Admin+ voit tous les bons d'achat ; en dessous, uniquement les siens — même principe
 * IDOR que listCommandes (voir BonAchatViewSet.get_queryset côté backend). Un bon n'est plus
 * acheté via un endpoint dédié depuis le 2026-09-23 (voir docstring de tête de types/boutique.ts)
 * : c'est un Produit(type_produit=bon_achat) comme un autre, acheté via passerCommande/
 * vendreEspeces — BonAchatViewSet est désormais en lecture seule (+ `verifier`) côté backend.
 */
export async function listBonsAchat(filtres: BonsAchatFiltres = {}): Promise<CursorPage<BonAchat>> {
  const { data } = await apiClient.get<CursorPage<BonAchat>>("/boutique/bons-achat/", {
    params: filtres,
  });
  return data;
}

/** POST /boutique/bons-achat/verifier/ — aperçu non-consommant d'un code au checkout (voir
 * PanierCommandePage), ouvert à tout authentifié : n'importe quel détenteur du code peut
 * l'interroger (bon d'achat transmissible). */
export async function verifierBonAchat(
  payload: VerifierBonAchatPayload,
): Promise<BonAchatVerification> {
  const { data } = await apiClient.post<BonAchatVerification>(
    "/boutique/bons-achat/verifier/",
    payload,
  );
  return data;
}
