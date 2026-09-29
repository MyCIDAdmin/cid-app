/**
 * Hooks React Query — module cotisations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as cotisationsApi from "../api/cotisations";
import type {
  ArticleCataloguePayload,
  ChangerStatutCotisationPayload,
  ConfigurationRelancePayload,
  CotisationContribuerProjetPayload,
  CotisationCreatePayload,
  CotisationsGestionFiltres,
  CotisationSaisieEspecesPayload,
  ModePaiement,
} from "../types/cotisation";

const cotisationsKeys = {
  all: ["cotisations"] as const,
  mesCotisations: () => [...cotisationsKeys.all, "mes-cotisations"] as const,
  detail: (id: string) => [...cotisationsKeys.all, "detail", id] as const,
  enAttenteDePaiement: () => [...cotisationsKeys.all, "en-attente-paiement"] as const,
  gestion: (filtres: CotisationsGestionFiltres = {}) =>
    [...cotisationsKeys.all, "gestion", filtres] as const,
  historiqueStatuts: (id: string) => [...cotisationsKeys.all, "historique-statuts", id] as const,
  configurationsRelance: () => [...cotisationsKeys.all, "configurations-relance"] as const,
  articlesCatalogue: () => [...cotisationsKeys.all, "articles-catalogue"] as const,
};

export function useMesCotisations() {
  return useQuery({
    queryKey: cotisationsKeys.mesCotisations(),
    queryFn: () => cotisationsApi.listMesCotisations(),
  });
}

/**
 * Détail d'une cotisation (AHM-46, page de retour Stripe/PayPal) — le statut n'est fiable
 * qu'après passage du webhook (asynchrone), d'où `refetch` exposé pour un bouton "vérifier à
 * nouveau" côté page plutôt qu'un polling automatique.
 */
export function useCotisation(id: string | undefined) {
  return useQuery({
    queryKey: cotisationsKeys.detail(id ?? ""),
    queryFn: () => cotisationsApi.getCotisation(id as string),
    enabled: Boolean(id),
  });
}

export function useCreerCotisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CotisationCreatePayload) => cotisationsApi.creerCotisation(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cotisationsKeys.all }),
  });
}

/**
 * Contribution libre à un projet (module Projets & Actions) — invalide aussi la clé racine
 * "projets" (littérale : projetsKeys n'est pas exportée par useProjets.ts) puisque
 * Projet.montant_collecte/nb_contributeurs/contributeurs dépendent de ce nouvel enregistrement,
 * même principe que useInscrireEspeces (evenements) sur la clé "cotisations".
 */
export function useContribuerProjet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CotisationContribuerProjetPayload) =>
      cotisationsApi.contribuerProjet(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.all });
      queryClient.invalidateQueries({ queryKey: ["projets"] });
    },
  });
}

/**
 * Initie un paiement en ligne (Stripe/PayPal Checkout, AHM-46) — le composant appelant est
 * responsable de la redirection (`window.location.href = redirect_url`) après succès.
 */
export function useInitierPaiementEnLigne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cotisationId: string) => cotisationsApi.initierPaiementEnLigne(cotisationId),
    onSuccess: (_data, cotisationId) =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.detail(cotisationId) }),
  });
}

/** File des paiements à confirmer manuellement (AHM-53) — Directeur Financier/Admin. */
export function useCotisationsEnAttenteDePaiement() {
  return useQuery({
    queryKey: cotisationsKeys.enAttenteDePaiement(),
    queryFn: () => cotisationsApi.listCotisationsEnAttenteDePaiement(),
  });
}

export function useMarquerCotisationPayee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { mode_paiement?: ModePaiement; date_paiement?: string };
    }) => cotisationsApi.marquerCotisationPayee(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cotisationsKeys.all }),
  });
}

/**
 * Liste élargie pour la page "Ausstehende Zahlungen" (ajoutée le 2026-09-19, filtres élargis le
 * 2026-09-21) — un statut vide renvoie toutes les cotisations, pour retrouver une cotisation
 * déjà "payee" à corriger.
 */
export function useCotisationsGestion(filtres: CotisationsGestionFiltres = {}) {
  return useQuery({
    queryKey: cotisationsKeys.gestion(filtres),
    queryFn: () => cotisationsApi.listCotisationsGestion(filtres),
  });
}

/**
 * Enregistrement direct d'un paiement en espèces (retour utilisateur du 2026-09-21) — voir
 * cotisationsApi.enregistrerPaiementEspeces. Invalide toute la clé racine, même principe que les
 * autres mutations de ce module (marquer_payee/changer_statut) : la nouvelle ligne doit
 * apparaître dans la file "Ausstehende Zahlungen" et dans l'historique du membre concerné.
 */
export function useEnregistrerPaiementEspeces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CotisationSaisieEspecesPayload) =>
      cotisationsApi.enregistrerPaiementEspeces(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cotisationsKeys.all }),
  });
}

export function useChangerStatutCotisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ChangerStatutCotisationPayload }) =>
      cotisationsApi.changerStatutCotisation(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.all });
      queryClient.invalidateQueries({
        queryKey: cotisationsKeys.historiqueStatuts(variables.id),
      });
    },
  });
}

/** Historique des changements de statut d'une cotisation — chargé à la demande (dépliant),
 * voir `enabled`. */
export function useHistoriqueStatutsCotisation(cotisationId: string, enabled: boolean) {
  return useQuery({
    queryKey: cotisationsKeys.historiqueStatuts(cotisationId),
    queryFn: () => cotisationsApi.getHistoriqueStatutsCotisation(cotisationId),
    enabled,
  });
}

/** Échéances des relances par année (AHM-54) — Directeur Financier/Admin. */
export function useConfigurationsRelance() {
  return useQuery({
    queryKey: cotisationsKeys.configurationsRelance(),
    queryFn: () => cotisationsApi.listConfigurationsRelance(),
  });
}

export function useCreerConfigurationRelance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ConfigurationRelancePayload) =>
      cotisationsApi.creerConfigurationRelance(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.configurationsRelance() }),
  });
}

export function useModifierConfigurationRelance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { date_echeance: string } }) =>
      cotisationsApi.modifierConfigurationRelance(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.configurationsRelance() }),
  });
}

export function useSupprimerConfigurationRelance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cotisationsApi.supprimerConfigurationRelance(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.configurationsRelance() }),
  });
}

/**
 * Catalogue d'articles de paiement personnalisés (retour utilisateur du 2026-09-17). Lecture
 * ouverte à tout authentifié (utilisé aussi bien par le stepper membre que par la page de
 * gestion Administrateur App) — le scope actif=true / tous est déjà géré côté backend selon le
 * rôle, voir cotisationsApi.listArticlesCatalogue.
 */
export function useArticlesCatalogue() {
  return useQuery({
    queryKey: cotisationsKeys.articlesCatalogue(),
    queryFn: () => cotisationsApi.listArticlesCatalogue(),
  });
}

export function useCreerArticleCatalogue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ArticleCataloguePayload) => cotisationsApi.creerArticleCatalogue(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.articlesCatalogue() }),
  });
}

export function useModifierArticleCatalogue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<ArticleCataloguePayload> & { actif?: boolean };
    }) => cotisationsApi.modifierArticleCatalogue(id, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: cotisationsKeys.articlesCatalogue() }),
  });
}
