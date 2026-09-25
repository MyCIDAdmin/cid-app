/**
 * File des paiements en attente à confirmer manuellement — vue Directeur Financier/Admin
 * (AHM-53). Il n'existe pas encore de passerelle de paiement réelle (AHM-46) : le stepper
 * libre-service (AHM-16) enregistre toujours un paiement déjà "payee", donc la seule façon
 * d'obtenir une cotisation "en_attente" aujourd'hui est une saisie manuelle pour un autre membre
 * (F-015) restée non réglée — ex. un virement SEPA en cours de réconciliation. Cette page
 * remplace le détour par l'admin Django pour confirmer ce paiement.
 *
 * Élargie le 2026-09-19 (demande utilisateur : "Bei 'Ausstehende Zahlungen' muss es möglich sein
 * die Historie zu behalten und Zahlungsstatus nachträglich zu ändern") : un filtre de statut
 * permet de retrouver n'importe quelle cotisation (pas seulement "en_attente"), chaque ligne
 * gagne un historique dépliable (HistoriqueStatutCotisation) et un contrôle "changer le statut"
 * qui, contrairement à la confirmation rapide ci-dessous, autorise n'importe quelle transition —
 * y compris revenir en arrière depuis "payee" (décision actée avec l'utilisateur : "Admin kann
 * jeden Status ändern + volles Änderungsprotokoll").
 *
 * Élargie une seconde fois le 2026-09-21 (retour utilisateur, 3 demandes) :
 *  1. Le filtre de statut devient des onglets (un par statut + "Tous"), plus rapide à utiliser
 *     qu'un menu déroulant pour un nombre de valeurs aussi restreint (5 statuts).
 *  2. Une ligne de filtres additionnels (type d'article, mode de paiement, recherche libre sur
 *     le membre/libellé, plage de date de création) vient compléter les onglets — voir
 *     CotisationsGestionFiltres et apps.cotisations.filters.CotisationFilter côté backend.
 *  3. Un formulaire "Enregistrer un paiement en espèces" (PaiementEspecesForm ci-dessous) permet
 *     de saisir directement une transaction déjà reçue en main propre (Barzahlung), sans passer
 *     par la confirmation d'une ligne en_attente préexistante — nouveau mode de paiement
 *     ModePaiement.ESPECES, réservé au Directeur Financier/Admin (voir CotisationSaisieEspeces
 *     Payload et CotisationViewSet.perform_create côté backend).
 *
 * Chaque ligne résout le nom du membre via useMembre(cotisation.membre) — un composant séparé
 * par ligne (CotisationGestionRow), même raison que JustificatifQueueRow dans
 * AdminJustificatifsPage.tsx (règles des Hooks : pas d'appel de hook dans une boucle .map()).
 *
 * Élargie une troisième fois le 2026-09-24 (retour utilisateur : "Die Ausstehende Zahlung
 * für die Teilnahme im Tippspiel soll im Modul 'Ausstehende Zahlungen' auftauchen und
 * genehmigt werden und nicht im Fan-Club Modul") : `TippspielZahlungenPanel` affiche et
 * confirme désormais ici les paiements de participation au Tippspiel (module Fan-Club) —
 * un système de paiement volontairement autonome, distinct du modèle `Cotisation` qui
 * structure le reste de cette page (décision utilisateur d'origine : "Eigenständiges
 * einfaches System"), d'où une section séparée plutôt qu'une ligne de plus dans le tableau
 * ci-dessous. Voir `components/cotisations/TippspielZahlungenPanel.tsx`.
 *
 * Renommée le 2026-09-25 (demande utilisateur, module "Ausstehende Zahlungen" : "Modul
 * 'Ausstehende Zahlungen' in 'Zahlungen' umbenennen") : label-only (nav.cotisations_en_attente,
 * en_attente_paiement.titre, rbac.page_cotisations_attente — voir les locales), aucune URL ni
 * nom de fichier/variable ne change. Cohérent avec le contenu réel de la page depuis le
 * 2026-09-21 : les onglets couvrent déjà tous les statuts, pas seulement les paiements en
 * attente. Un bouton "Excel exportieren" (même demande) exporte la sélection filtrée via
 * GET /cotisations/export/ — mêmes filtres que le tableau, même principe blob+téléchargement que
 * GestionCommandesTab.tsx (module Shop-Verwaltung).
 */
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { exporterCotisationsExcel } from "../../api/cotisations";
import { useMembre } from "../../hooks/useMembres";
import { usePageAccess } from "../../hooks/useRbac";
import {
  useArticlesCatalogue,
  useChangerStatutCotisation,
  useCotisationsGestion,
  useEnregistrerPaiementEspeces,
  useHistoriqueStatutsCotisation,
  useMarquerCotisationPayee,
} from "../../hooks/useCotisations";
import { useEvenements, useInscrireEspeces } from "../../hooks/useEvenements";
import { useCampagneActive, useSouscrireEspeces } from "../../hooks/useAdhesions";
import { useProduits, useVendreEspeces } from "../../hooks/useBoutique";
import type {
  Cotisation,
  CotisationSaisieEspecesPayload,
  ModePaiement,
  StatutCotisation,
  TypeArticle,
} from "../../types/cotisation";
import type { MembreListItem } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";
import MembreSearchPicker from "../../components/membres/MembreSearchPicker";
import TippspielZahlungenPanel from "../../components/cotisations/TippspielZahlungenPanel";

/**
 * Types proposés par le formulaire "Barzahlung eintragen" (PaiementEspecesForm ci-dessous) —
 * distinct de TypeArticle (backend) : "boutique" et "mitgliedschaftsbeitrag" ne sont JAMAIS
 * envoyés comme `type_article` à POST /cotisations/, ils déclenchent chacun un endpoint dédié
 * (même principe que "evenement" déjà en place, voir soumettre() ci-dessous) — "boutique" un
 * vrai produit/variante de la boutique (POST /boutique/commandes/vendre-especes/), "mitglied
 * schaftsbeitrag" une vraie Souscription à une offre d'adhésion en cours (POST /adhesions/
 * souscriptions/souscrire-especes/).
 */
type TypeArticleEspeces = TypeArticle | "boutique" | "mitgliedschaftsbeitrag";

const MODES_PAIEMENT: ModePaiement[] = ["carte", "virement_sepa", "paypal", "especes"];
const STATUTS: StatutCotisation[] = ["en_attente", "payee", "echouee", "remboursee", "annulee"];
const STATUTS_CONFIRMABLES: StatutCotisation[] = ["en_attente", "echouee"];
// Filtre "type d'article" : les 6 valeurs possibles côté backend (voir TypeArticle).
const TYPES_ARTICLE_FILTRE: TypeArticle[] = [
  "cotisation",
  "adhesion",
  "evenement",
  "don",
  "autre",
  "autre_libre",
];
// Types proposés pour une saisie manuelle en espèces (formulaire "Barzahlung eintragen").
//
// Élargi le 2026-09-21 (retour utilisateur, 4 demandes) :
//  1. "Shop-Artikel" (valeur "boutique") pointe désormais vers de VRAIS produits/variantes de
//     la boutique (vente au comptoir/vereinfachter Kassenverkauf, stock décrémenté) — voir
//     POST /boutique/commandes/vendre-especes/.
//  2. "mitgliedschaftsbeitrag" ajouté — les offres d'adhésion en cours (campagne publiée), crée
//     une vraie Souscription payée immédiatement — voir POST /adhesions/souscriptions/
//     souscrire-especes/.
//  3. "cotisation"/"adhesion" retirés de cette liste (ils y créaient une simple ligne de
//     cotisation libre, sans jamais mettre à jour le statut associatif annuel ni une
//     Souscription réelle) — remplacés par "mitgliedschaftsbeitrag" ci-dessus pour tout ce qui
//     concerne l'adhésion ; la cotisation annuelle "classique" reste soit payée en libre-service
//     (stepper), soit confirmée depuis une ligne "en_attente" déjà existante
//     (CotisationGestionRow ci-dessus), jamais créée de toutes pièces ici.
//  4. L'ancien type "autre" (articles du catalogue ArticleCatalogue.type_fixe=null, ex.
//     T-shirt/écharpe personnalisés — PAS liés à la boutique) garde sa valeur mais est relabellé
//     "Beitragsartikel" (clé `type_article.autre`, voir locales) pour ne plus se confondre avec
//     le nouveau "Shop-Artikel" ci-dessus.
//
// "evenement" (ajouté le 2026-09-21 précédemment) et "autre_libre" restent inchangés — voir
// soumettre() ci-dessous.
const TYPES_ARTICLE_ESPECES: TypeArticleEspeces[] = [
  "mitgliedschaftsbeitrag",
  "evenement",
  "boutique",
  "don",
  "autre",
  "autre_libre",
];

function formatMontant(montant: string): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatDateHeure(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Déclenche le téléchargement d'un blob côté navigateur — même pattern que
 * GestionCommandesTab.declencherTelechargement. */
function declencherTelechargement(blob: Blob, nomFichier: string) {
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}

interface CotisationGestionRowProps {
  cotisation: Cotisation;
  /** task #216 : seuls "marquer comme payée" et "changer le statut" sont des actions d'écriture
   * sur cette page (page_cotisations_attente) — désactivés en lecture seule, transmis par le
   * parent plutôt que ré-interrogé via usePageAccess ici (évite un hook par ligne). */
  modifiable: boolean;
}

function CotisationGestionRow({ cotisation, modifiable }: CotisationGestionRowProps) {
  const { t } = useTranslation(["cotisations", "common"]);
  const membre = useMembre(cotisation.membre);
  const marquerPayeeMutation = useMarquerCotisationPayee();
  const changerStatutMutation = useChangerStatutCotisation();

  const [modePaiement, setModePaiement] = useState<ModePaiement>(
    (cotisation.mode_paiement as ModePaiement) || "virement_sepa",
  );
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);
  const [nouveauStatut, setNouveauStatut] = useState<StatutCotisation>(cotisation.statut);
  const [motif, setMotif] = useState("");

  const historique = useHistoriqueStatutsCotisation(cotisation.id, historiqueOuvert);

  function confirmerPaiement() {
    marquerPayeeMutation.mutate({ id: cotisation.id, payload: { mode_paiement: modePaiement } });
  }

  function appliquerChangementStatut() {
    changerStatutMutation.mutate(
      { id: cotisation.id, payload: { statut: nouveauStatut, motif } },
      { onSuccess: () => setMotif("") },
    );
  }

  return (
    <>
      <tr className="border-b border-text-tertiary/10 last:border-0 align-top">
        <td className="px-4 py-2">{formatDate(cotisation.created_at)}</td>
        <td className="px-4 py-2">
          {membre.isLoading
            ? t("en_attente_paiement.chargement")
            : membre.data
              ? `${membre.data.prenom} ${membre.data.nom} (${membre.data.numero_membre})`
              : "—"}
        </td>
        <td className="px-4 py-2">{cotisation.libelle}</td>
        <td className="px-4 py-2 font-semibold text-ca">{formatMontant(cotisation.montant)}</td>
        <td className="px-4 py-2">{t(`statut.${cotisation.statut}`)}</td>
        <td className="px-4 py-2">
          {STATUTS_CONFIRMABLES.includes(cotisation.statut) && (
            <div className="mb-2 flex items-center gap-1">
              <select
                value={modePaiement}
                onChange={(e) => setModePaiement(e.target.value as ModePaiement)}
                disabled={!modifiable}
                title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs disabled:opacity-30"
              >
                {MODES_PAIEMENT.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`en_attente_paiement.mode.${mode}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={confirmerPaiement}
                disabled={marquerPayeeMutation.isPending || !modifiable}
                title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
                className="rounded-cid bg-status-successText px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
              >
                {marquerPayeeMutation.isPending
                  ? t("en_attente_paiement.en_cours")
                  : t("en_attente_paiement.confirmer")}
              </button>
            </div>
          )}
          {marquerPayeeMutation.isError && (
            <p className="mb-2 text-xs text-status-dangerText">
              {extractApiErrorMessage(
                marquerPayeeMutation.error,
                t("en_attente_paiement.erreur_action"),
              )}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1">
            <select
              aria-label={t("en_attente_paiement.changer_statut_label")}
              value={nouveauStatut}
              onChange={(e) => setNouveauStatut(e.target.value as StatutCotisation)}
              disabled={!modifiable}
              title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs disabled:opacity-30"
            >
              {STATUTS.map((statut) => (
                <option key={statut} value={statut}>
                  {t(`statut.${statut}`)}
                </option>
              ))}
            </select>
            <input
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder={t("en_attente_paiement.motif_placeholder") ?? ""}
              disabled={!modifiable}
              title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
              className="min-w-[8rem] rounded-cid border border-text-tertiary/30 px-2 py-1 text-xs disabled:opacity-30"
            />
            <button
              type="button"
              onClick={appliquerChangementStatut}
              disabled={
                changerStatutMutation.isPending ||
                nouveauStatut === cotisation.statut ||
                !modifiable
              }
              title={!modifiable ? (t("common:acces.lecture_seule_tooltip") ?? "") : ""}
              className="rounded-cid border border-ca px-2 py-1 text-xs font-medium text-ca hover:bg-cal disabled:opacity-40"
            >
              {changerStatutMutation.isPending
                ? t("en_attente_paiement.en_cours")
                : t("en_attente_paiement.changer_statut")}
            </button>
            <button
              type="button"
              onClick={() => setHistoriqueOuvert((v) => !v)}
              className="rounded-cid px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
            >
              {historiqueOuvert
                ? t("en_attente_paiement.masquer_historique")
                : t("en_attente_paiement.voir_historique")}
            </button>
          </div>
          {changerStatutMutation.isError && (
            <p className="mt-1 text-xs text-status-dangerText">
              {extractApiErrorMessage(
                changerStatutMutation.error,
                t("en_attente_paiement.erreur_changement_statut"),
              )}
            </p>
          )}
        </td>
      </tr>
      {historiqueOuvert && (
        <tr className="border-b border-text-tertiary/10 last:border-0 bg-bg-tertiary/30">
          <td colSpan={6} className="px-4 py-3">
            {historique.isLoading && (
              <p className="text-xs text-text-tertiary">{t("en_attente_paiement.chargement")}</p>
            )}
            {historique.isError && (
              <p className="text-xs text-status-dangerText">
                {t("en_attente_paiement.erreur_historique")}
              </p>
            )}
            {historique.data && historique.data.length === 0 && (
              <p className="text-xs text-text-tertiary">
                {t("en_attente_paiement.historique_vide")}
              </p>
            )}
            {historique.data && historique.data.length > 0 && (
              <ul className="space-y-1 text-xs text-text-secondary">
                {historique.data.map((entree) => (
                  <li key={entree.id}>
                    {formatDateHeure(entree.created_at)} — {t(`statut.${entree.ancien_statut}`)} →{" "}
                    {t(`statut.${entree.nouveau_statut}`)}
                    {entree.modifie_par_nom && ` (${entree.modifie_par_nom})`}
                    {entree.motif && ` — ${entree.motif}`}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TabButton({ active, onClick, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium ${
        active ? "border-b-2 border-ca text-ca" : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}

interface PaiementEspecesFormProps {
  onClose: () => void;
}

/**
 * Formulaire "Enregistrer un paiement en espèces" (ajouté le 2026-09-21, voir docstring de
 * module) — réutilise POST /cotisations/ (même endpoint que le stepper libre-service et que la
 * saisie F-015 existante), avec mode_paiement="especes" et statut="payee" explicites : la
 * transaction est considérée comme déjà reçue au moment de la saisie (contrairement à la
 * confirmation d'une ligne en_attente déjà existante, gérée par CotisationGestionRow ci-dessus).
 *
 * Élargi le 2026-09-21 (retour utilisateur, 3 demandes) :
 *  1. Le type "autre" (article du catalogue de paiement, voir ArticleCatalogue) est renommé
 *     "Shop-Artikel"/"Article boutique" côté affichage (clé `type_article.autre`, plus parlante
 *     que "Katalogartikel" pour un article personnalisé du type T-shirt/écharpe...) et filtre
 *     désormais aussi sur `actif` (même filtre que CotisationStepperPage — un article désactivé
 *     n'a jamais de raison d'apparaître dans une nouvelle saisie, ce qui produisait sinon un 400
 *     silencieux côté serveur à la soumission) ; un état de chargement/erreur/liste vide est
 *     affiché sous le menu plutôt qu'un simple "—" qui ne permettait pas de distinguer "en train
 *     de charger" de "aucun article créé — voir la page Beitragsartikel".
 *  2. Type "evenement" ajouté — contrairement aux autres types ci-dessous, il ne crée PAS de
 *     Cotisation via ce même POST /cotisations/ (une Cotisation de type evenement n'est jamais
 *     créée directement, voir apps.evenements.services) : sélectionner un événement affiche un
 *     second menu (événements publiés et payants, voir useEvenements) et la soumission appelle
 *     un endpoint dédié, POST /evenements/evenements/inscrire-especes/ (useInscrireEspeces), qui
 *     inscrit le membre ET confirme le paiement en une seule fois.
 *  3. Type "autre_libre" ajouté — même mécanique libre (libellé + montant saisis à la main) que
 *     "don", mais distinct sémantiquement (un don volontaire n'est pas la même chose qu'un
 *     article ponctuel non catalogué, ex. un remboursement) ; voir TypeArticle.AUTRE_LIBRE.
 *
 * Élargi une seconde fois le 2026-09-21 (retour utilisateur, "Shop-Artikel soll für Artikel aus
 * Boutique sein" / "Füge mitgliedschaftsbeitrag hinzu mit den aktuellen Angebote" / "Jahresbeitrag
 * und Beitrittsbeitrag sind nicht vorhanden" / "Füge Beitragsartikel hinzu") — voir le commentaire
 * de TYPES_ARTICLE_ESPECES ci-dessus pour le détail des 4 changements. Deux nouveaux types suivent
 * le même principe que "evenement" ci-dessus (endpoint dédié, aucune Cotisation créée directement
 * via ce POST /cotisations/) :
 *  - "boutique" : sélectionner un produit puis une variante (voir useProduits) et une quantité
 *    appelle POST /boutique/commandes/vendre-especes/ (useVendreEspeces) — vente au comptoir,
 *    aucune adresse de livraison, stock décrémenté côté serveur.
 *  - "mitgliedschaftsbeitrag" : sélectionner une offre de la campagne d'adhésion publiée en cours
 *    (voir useCampagneActive) appelle POST /adhesions/souscriptions/souscrire-especes/
 *    (useSouscrireEspeces) — crée une vraie Souscription et la paie immédiatement.
 */
function PaiementEspecesForm({ onClose }: PaiementEspecesFormProps) {
  const { t } = useTranslation("cotisations");
  const [membre, setMembre] = useState<MembreListItem | null>(null);
  const [typeArticle, setTypeArticle] = useState<TypeArticleEspeces>("mitgliedschaftsbeitrag");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [articleCatalogueId, setArticleCatalogueId] = useState("");
  const [evenementId, setEvenementId] = useState("");
  const [places, setPlaces] = useState("1");
  const [offreId, setOffreId] = useState("");
  const [produitId, setProduitId] = useState("");
  const [varianteId, setVarianteId] = useState("");
  const [quantiteBoutique, setQuantiteBoutique] = useState("1");

  const mutation = useEnregistrerPaiementEspeces();
  const inscrireEspecesMutation = useInscrireEspeces();
  const souscrireEspecesMutation = useSouscrireEspeces();
  const vendreEspecesMutation = useVendreEspeces();
  const articlesCatalogue = useArticlesCatalogue();
  const evenementsActifs = useEvenements({ statut: "publie" });
  const campagneActive = useCampagneActive();
  const produitsPublies = useProduits({ statut: "publie" });
  // Seuls les articles personnalisés (type_fixe=null) actuellement proposés ont du sens ici —
  // cotisation/adhésion sont déjà couverts par leurs propres options de type_article, pas par un
  // article_catalogue ; `actif` filtré comme dans CotisationStepperPage (voir docstring ci-dessus).
  const articlesPersonnalises =
    articlesCatalogue.data?.results.filter((a) => a.actif && a.type_fixe === null) ?? [];
  // Un événement gratuit n'a jamais de paiement à confirmer (voir apps.evenements.services.
  // synchroniser_cotisation, qui ne crée pas de Cotisation dans ce cas) — hors de portée de ce
  // formulaire de saisie cash, qui sert justement à confirmer un paiement.
  const evenementsPayants = (evenementsActifs.data?.results ?? []).filter((ev) => !ev.gratuit);
  // Mêmes offres que celles proposées à un membre en libre-service (visible=true) — un rabais
  // reste hors de portée ici (voir docstring de module), le prix plein de l'offre est toujours
  // appliqué. `useCampagneActive` renvoie une 404 (isError) tant qu'aucune campagne n'est publiée.
  const offresDisponibles = (campagneActive.data?.offres ?? []).filter((o) => o.visible);
  const produitsDisponibles = produitsPublies.data?.results ?? [];
  const produitSelectionne = produitsDisponibles.find((p) => p.id === produitId) ?? null;
  const variantesDisponibles = produitSelectionne?.variantes ?? [];

  const montantInvalide =
    (typeArticle === "don" || typeArticle === "autre_libre") && (!montant || Number(montant) <= 0);
  const libelleManquant = typeArticle === "autre_libre" && !libelle.trim();
  const articleManquant = typeArticle === "autre" && !articleCatalogueId;
  const evenementManquant = typeArticle === "evenement" && !evenementId;
  const placesInvalides = typeArticle === "evenement" && (!places || Number(places) < 1);
  const offreManquante = typeArticle === "mitgliedschaftsbeitrag" && !offreId;
  const varianteManquante = typeArticle === "boutique" && !varianteId;
  const quantiteBoutiqueInvalide =
    typeArticle === "boutique" && (!quantiteBoutique || Number(quantiteBoutique) < 1);
  const formulaireValide =
    Boolean(membre) &&
    !montantInvalide &&
    !libelleManquant &&
    !articleManquant &&
    !evenementManquant &&
    !placesInvalides &&
    !offreManquante &&
    !varianteManquante &&
    !quantiteBoutiqueInvalide;

  function reinitialiser() {
    setMembre(null);
    setMontant("");
    setLibelle("");
    setArticleCatalogueId("");
    setEvenementId("");
    setPlaces("1");
    setOffreId("");
    setProduitId("");
    setVarianteId("");
    setQuantiteBoutique("1");
  }

  function soumettre(e: FormEvent) {
    e.preventDefault();
    if (!membre || !formulaireValide) return;

    if (typeArticle === "evenement") {
      inscrireEspecesMutation.mutate(
        { membre: membre.id, evenement: evenementId, places: Number(places) },
        {
          onSuccess: () => {
            reinitialiser();
            onClose();
          },
        },
      );
      return;
    }

    if (typeArticle === "mitgliedschaftsbeitrag") {
      souscrireEspecesMutation.mutate(
        { membre: membre.id, offre: offreId },
        {
          onSuccess: () => {
            reinitialiser();
            onClose();
          },
        },
      );
      return;
    }

    if (typeArticle === "boutique") {
      vendreEspecesMutation.mutate(
        { membre: membre.id, variante: varianteId, quantite: Number(quantiteBoutique) },
        {
          onSuccess: () => {
            reinitialiser();
            onClose();
          },
        },
      );
      return;
    }

    if (typeArticle === "projet") {
      // Une contribution "projet" (module Projets & Actions) n'est jamais saisie depuis ce
      // formulaire générique — elle n'est pas proposée dans TYPES_ARTICLE_ESPECES ci-dessus, un
      // paiement espèces pour un projet se fait depuis la kachel elle-même. Ce garde-fou
      // n'existe que pour satisfaire l'exhaustivité de TypeScript sur TypeArticle.
      return;
    }

    const payload: CotisationSaisieEspecesPayload = {
      membre: membre.id,
      type_article: typeArticle,
      mode_paiement: "especes",
      statut: "payee",
    };
    if (typeArticle === "don") {
      payload.montant = montant;
      payload.libelle = libelle || t("article.don_titre");
    } else if (typeArticle === "autre_libre") {
      payload.montant = montant;
      payload.libelle = libelle;
    } else if (typeArticle === "autre") {
      payload.article_catalogue = articleCatalogueId;
    }

    mutation.mutate(payload, {
      onSuccess: () => {
        reinitialiser();
        onClose();
      },
    });
  }

  const mutationEnCours =
    mutation.isPending ||
    inscrireEspecesMutation.isPending ||
    souscrireEspecesMutation.isPending ||
    vendreEspecesMutation.isPending;

  return (
    <form
      onSubmit={soumettre}
      className="mb-4 space-y-3 rounded-cid-lg bg-bg-primary p-4 shadow-sm"
    >
      <h2 className="text-sm font-bold text-text-primary">
        {t("en_attente_paiement.especes_titre")}
      </h2>

      <div>
        <label className="mb-1 block text-[10px] uppercase text-text-tertiary">
          {t("en_attente_paiement.especes_champ_membre")}
        </label>
        <MembreSearchPicker
          selection={membre}
          onSelect={setMembre}
          placeholder={t("en_attente_paiement.especes_rechercher_membre_placeholder") ?? ""}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="cotisations-especes-type-article"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("en_attente_paiement.especes_champ_type_article")}
          </label>
          <select
            id="cotisations-especes-type-article"
            value={typeArticle}
            onChange={(e) => setTypeArticle(e.target.value as TypeArticleEspeces)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            {TYPES_ARTICLE_ESPECES.map((ta) => (
              <option key={ta} value={ta}>
                {t(`en_attente_paiement.type_article.${ta}`)}
              </option>
            ))}
          </select>
        </div>

        {(typeArticle === "don" || typeArticle === "autre_libre") && (
          <>
            <div>
              <label
                htmlFor="cotisations-especes-montant"
                className="mb-1 block text-[10px] uppercase text-text-tertiary"
              >
                {t("en_attente_paiement.especes_champ_montant")}
              </label>
              <input
                id="cotisations-especes-montant"
                type="number"
                min="0.01"
                step="0.01"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                className="w-28 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="cotisations-especes-libelle"
                className="mb-1 block text-[10px] uppercase text-text-tertiary"
              >
                {t("en_attente_paiement.especes_champ_libelle")}
              </label>
              <input
                id="cotisations-especes-libelle"
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                placeholder={
                  (typeArticle === "don"
                    ? t("article.don_titre")
                    : t("en_attente_paiement.especes_champ_libelle")) ?? ""
                }
                className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
          </>
        )}

        {typeArticle === "autre" && (
          <div>
            <label
              htmlFor="cotisations-especes-article"
              className="mb-1 block text-[10px] uppercase text-text-tertiary"
            >
              {t("en_attente_paiement.especes_champ_article")}
            </label>
            <select
              id="cotisations-especes-article"
              value={articleCatalogueId}
              onChange={(e) => setArticleCatalogueId(e.target.value)}
              disabled={articlesCatalogue.isLoading}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {articlesPersonnalises.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle} ({formatMontant(a.montant)})
                </option>
              ))}
            </select>
            {articlesCatalogue.isLoading && (
              <p className="mt-1 text-xs text-text-tertiary">
                {t("en_attente_paiement.chargement")}
              </p>
            )}
            {articlesCatalogue.isError && (
              <p className="mt-1 text-xs text-status-dangerText">
                {t("en_attente_paiement.especes_beitragsartikel_erreur")}
              </p>
            )}
            {articlesCatalogue.data && articlesPersonnalises.length === 0 && (
              <p className="mt-1 max-w-xs text-xs text-text-tertiary">
                {t("en_attente_paiement.especes_beitragsartikel_aucun")}
              </p>
            )}
          </div>
        )}

        {typeArticle === "mitgliedschaftsbeitrag" && (
          <div>
            <label
              htmlFor="cotisations-especes-offre"
              className="mb-1 block text-[10px] uppercase text-text-tertiary"
            >
              {t("en_attente_paiement.especes_champ_offre")}
            </label>
            <select
              id="cotisations-especes-offre"
              value={offreId}
              onChange={(e) => setOffreId(e.target.value)}
              disabled={campagneActive.isLoading}
              className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
            >
              <option value="">—</option>
              {offresDisponibles.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nom} ({formatMontant(o.prix_plein)})
                </option>
              ))}
            </select>
            {campagneActive.isLoading && (
              <p className="mt-1 text-xs text-text-tertiary">
                {t("en_attente_paiement.chargement")}
              </p>
            )}
            {campagneActive.isError && (
              <p className="mt-1 max-w-xs text-xs text-status-dangerText">
                {t("en_attente_paiement.especes_offre_aucune_campagne")}
              </p>
            )}
            {campagneActive.data && offresDisponibles.length === 0 && (
              <p className="mt-1 max-w-xs text-xs text-text-tertiary">
                {t("en_attente_paiement.especes_offre_aucune")}
              </p>
            )}
          </div>
        )}

        {typeArticle === "boutique" && (
          <>
            <div>
              <label
                htmlFor="cotisations-especes-produit"
                className="mb-1 block text-[10px] uppercase text-text-tertiary"
              >
                {t("en_attente_paiement.especes_champ_produit")}
              </label>
              <select
                id="cotisations-especes-produit"
                value={produitId}
                onChange={(e) => {
                  setProduitId(e.target.value);
                  setVarianteId("");
                }}
                disabled={produitsPublies.isLoading}
                className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {produitsDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} ({formatMontant(p.prix_final)})
                  </option>
                ))}
              </select>
              {produitsPublies.isLoading && (
                <p className="mt-1 text-xs text-text-tertiary">
                  {t("en_attente_paiement.chargement")}
                </p>
              )}
              {produitsPublies.isError && (
                <p className="mt-1 max-w-xs text-xs text-status-dangerText">
                  {t("en_attente_paiement.especes_shop_erreur")}
                </p>
              )}
              {produitsPublies.data && produitsDisponibles.length === 0 && (
                <p className="mt-1 max-w-xs text-xs text-text-tertiary">
                  {t("en_attente_paiement.especes_produit_aucun")}
                </p>
              )}
            </div>
            {produitSelectionne && (
              <div>
                <label
                  htmlFor="cotisations-especes-variante"
                  className="mb-1 block text-[10px] uppercase text-text-tertiary"
                >
                  {t("en_attente_paiement.especes_champ_variante")}
                </label>
                <select
                  id="cotisations-especes-variante"
                  value={varianteId}
                  onChange={(e) => setVarianteId(e.target.value)}
                  className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {variantesDisponibles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.taille, v.couleur].filter(Boolean).join(" / ") || "—"} (
                      {t("en_attente_paiement.especes_stock", { stock: v.stock })})
                    </option>
                  ))}
                </select>
                {variantesDisponibles.length === 0 && (
                  <p className="mt-1 max-w-xs text-xs text-text-tertiary">
                    {t("en_attente_paiement.especes_variante_aucune")}
                  </p>
                )}
              </div>
            )}
            <div>
              <label
                htmlFor="cotisations-especes-quantite"
                className="mb-1 block text-[10px] uppercase text-text-tertiary"
              >
                {t("en_attente_paiement.especes_champ_quantite")}
              </label>
              <input
                id="cotisations-especes-quantite"
                type="number"
                min="1"
                step="1"
                value={quantiteBoutique}
                onChange={(e) => setQuantiteBoutique(e.target.value)}
                className="w-20 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
          </>
        )}

        {typeArticle === "evenement" && (
          <>
            <div>
              <label
                htmlFor="cotisations-especes-evenement"
                className="mb-1 block text-[10px] uppercase text-text-tertiary"
              >
                {t("en_attente_paiement.especes_champ_evenement")}
              </label>
              <select
                id="cotisations-especes-evenement"
                value={evenementId}
                onChange={(e) => setEvenementId(e.target.value)}
                disabled={evenementsActifs.isLoading}
                className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              >
                <option value="">—</option>
                {evenementsPayants.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.titre} — {formatDate(ev.date_evenement)} ({formatMontant(ev.cout)})
                  </option>
                ))}
              </select>
              {evenementsActifs.isLoading && (
                <p className="mt-1 text-xs text-text-tertiary">
                  {t("en_attente_paiement.chargement")}
                </p>
              )}
              {evenementsActifs.isError && (
                <p className="mt-1 text-xs text-status-dangerText">
                  {t("en_attente_paiement.especes_evenement_erreur")}
                </p>
              )}
              {evenementsActifs.data && evenementsPayants.length === 0 && (
                <p className="mt-1 max-w-xs text-xs text-text-tertiary">
                  {t("en_attente_paiement.especes_evenement_aucun")}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="cotisations-especes-places"
                className="mb-1 block text-[10px] uppercase text-text-tertiary"
              >
                {t("en_attente_paiement.especes_champ_places")}
              </label>
              <input
                id="cotisations-especes-places"
                type="number"
                min="1"
                step="1"
                value={places}
                onChange={(e) => setPlaces(e.target.value)}
                className="w-20 rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={!formulaireValide || mutationEnCours}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
        >
          {mutationEnCours
            ? t("en_attente_paiement.en_cours")
            : t("en_attente_paiement.especes_soumettre")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-cid px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
        >
          {t("en_attente_paiement.especes_annuler")}
        </button>
      </div>

      {mutation.isError && (
        <p className="text-xs text-status-dangerText">
          {extractApiErrorMessage(mutation.error, t("en_attente_paiement.especes_erreur"))}
        </p>
      )}
      {inscrireEspecesMutation.isError && (
        <p className="text-xs text-status-dangerText">
          {extractApiErrorMessage(
            inscrireEspecesMutation.error,
            t("en_attente_paiement.especes_erreur"),
          )}
        </p>
      )}
      {souscrireEspecesMutation.isError && (
        <p className="text-xs text-status-dangerText">
          {extractApiErrorMessage(
            souscrireEspecesMutation.error,
            t("en_attente_paiement.especes_erreur"),
          )}
        </p>
      )}
      {vendreEspecesMutation.isError && (
        <p className="text-xs text-status-dangerText">
          {extractApiErrorMessage(
            vendreEspecesMutation.error,
            t("en_attente_paiement.especes_erreur"),
          )}
        </p>
      )}
    </form>
  );
}

export default function CotisationsEnAttentePage() {
  const { t } = useTranslation(["cotisations", "common"]);
  const { accessible, modifiable } = usePageAccess("page_cotisations_attente");
  const [statutFiltre, setStatutFiltre] = useState<StatutCotisation | "">("en_attente");
  const [typeArticleFiltre, setTypeArticleFiltre] = useState<TypeArticle | "">("");
  const [modePaiementFiltre, setModePaiementFiltre] = useState<ModePaiement | "">("");
  const [q, setQ] = useState("");
  const [dateCreationApres, setDateCreationApres] = useState("");
  const [dateCreationAvant, setDateCreationAvant] = useState("");
  const [especesOuvert, setEspecesOuvert] = useState(false);
  const [exportEnCours, setExportEnCours] = useState(false);
  const [erreurExport, setErreurExport] = useState<string | null>(null);

  const filtresGestion = {
    statut: statutFiltre,
    type_article: typeArticleFiltre,
    mode_paiement: modePaiementFiltre,
    q,
    date_creation_apres: dateCreationApres,
    date_creation_avant: dateCreationAvant,
  };
  const gestion = useCotisationsGestion(filtresGestion);

  const filtresActifs = Boolean(
    typeArticleFiltre || modePaiementFiltre || q || dateCreationApres || dateCreationAvant,
  );

  function reinitialiserFiltres() {
    setTypeArticleFiltre("");
    setModePaiementFiltre("");
    setQ("");
    setDateCreationApres("");
    setDateCreationAvant("");
  }

  async function exporterExcel() {
    setErreurExport(null);
    setExportEnCours(true);
    try {
      const { blob, nomFichier } = await exporterCotisationsExcel(filtresGestion);
      declencherTelechargement(blob, nomFichier);
    } catch (error) {
      setErreurExport(extractApiErrorMessage(error, t("en_attente_paiement.export_erreur")));
    } finally {
      setExportEnCours(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t("en_attente_paiement.titre")}</h1>
          <p className="text-sm text-text-tertiary">{t("en_attente_paiement.sous_titre")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exporterExcel}
            disabled={exportEnCours}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
          >
            {exportEnCours
              ? t("en_attente_paiement.export_en_cours")
              : t("en_attente_paiement.export_excel")}
          </button>
          <button
            type="button"
            onClick={() => setEspecesOuvert((v) => !v)}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
          >
            {especesOuvert
              ? t("en_attente_paiement.especes_fermer")
              : t("en_attente_paiement.especes_ouvrir")}
          </button>
        </div>
      </div>

      {accessible && !modifiable && (
        <p className="mb-4 rounded-cid-lg bg-bg-tertiary px-4 py-2 text-sm text-text-secondary">
          {t("common:acces.lecture_seule_banniere")}
        </p>
      )}

      {erreurExport && <p className="mb-4 text-xs text-status-dangerText">{erreurExport}</p>}

      <TippspielZahlungenPanel />

      {especesOuvert && <PaiementEspecesForm onClose={() => setEspecesOuvert(false)} />}

      {/* Onglets de statut (retour utilisateur du 2026-09-21) — remplacent le menu déroulant
          précédent, le nombre de statuts (5 + "Tous") s'y prête mieux. */}
      <div className="mb-3 flex flex-wrap gap-1 border-b border-text-tertiary/20">
        <TabButton
          active={statutFiltre === ""}
          onClick={() => setStatutFiltre("")}
          label={t("en_attente_paiement.filtre_tous")}
        />
        {STATUTS.map((statut) => (
          <TabButton
            key={statut}
            active={statutFiltre === statut}
            onClick={() => setStatutFiltre(statut)}
            label={t(`statut.${statut}`)}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-cid-lg bg-bg-primary p-3 shadow-sm">
        <div>
          <label
            htmlFor="cotisations-filtre-q"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("en_attente_paiement.filtre_recherche")}
          </label>
          <input
            id="cotisations-filtre-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("en_attente_paiement.filtre_recherche_placeholder") ?? ""}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="cotisations-filtre-type-article"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("en_attente_paiement.filtre_type_article")}
          </label>
          <select
            id="cotisations-filtre-type-article"
            value={typeArticleFiltre}
            onChange={(e) => setTypeArticleFiltre(e.target.value as TypeArticle | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("en_attente_paiement.filtre_tous")}</option>
            {TYPES_ARTICLE_FILTRE.map((ta) => (
              <option key={ta} value={ta}>
                {t(`en_attente_paiement.type_article.${ta}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="cotisations-filtre-mode-paiement"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("en_attente_paiement.filtre_mode_paiement")}
          </label>
          <select
            id="cotisations-filtre-mode-paiement"
            value={modePaiementFiltre}
            onChange={(e) => setModePaiementFiltre(e.target.value as ModePaiement | "")}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          >
            <option value="">{t("en_attente_paiement.filtre_tous")}</option>
            {MODES_PAIEMENT.map((mode) => (
              <option key={mode} value={mode}>
                {t(`en_attente_paiement.mode.${mode}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="cotisations-filtre-date-apres"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("en_attente_paiement.filtre_date_apres")}
          </label>
          <input
            id="cotisations-filtre-date-apres"
            type="date"
            value={dateCreationApres}
            onChange={(e) => setDateCreationApres(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="cotisations-filtre-date-avant"
            className="mb-1 block text-[10px] uppercase text-text-tertiary"
          >
            {t("en_attente_paiement.filtre_date_avant")}
          </label>
          <input
            id="cotisations-filtre-date-avant"
            type="date"
            value={dateCreationAvant}
            onChange={(e) => setDateCreationAvant(e.target.value)}
            className="rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
          />
        </div>
        {filtresActifs && (
          <button
            type="button"
            onClick={reinitialiserFiltres}
            className="text-xs font-medium text-ca underline"
          >
            {t("en_attente_paiement.reinitialiser_filtres")}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-cid-lg bg-bg-primary shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-text-tertiary/20 text-left text-xs font-semibold uppercase text-text-tertiary">
              <th className="px-4 py-2">{t("en_attente_paiement.col_date")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_membre")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_libelle")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_montant")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_statut")}</th>
              <th className="px-4 py-2">{t("en_attente_paiement.col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {gestion.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("en_attente_paiement.chargement")}
                </td>
              </tr>
            )}
            {gestion.isError && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-status-dangerText">
                  {t("en_attente_paiement.erreur_chargement")}
                </td>
              </tr>
            )}
            {gestion.data && gestion.data.results.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-tertiary">
                  {t("en_attente_paiement.aucun")}
                </td>
              </tr>
            )}
            {gestion.data?.results.map((c) => (
              <CotisationGestionRow key={c.id} cotisation={c} modifiable={modifiable} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
