/**
 * Stepper de paiement libre-service (mockup #pg-cotisation, FDD §3.2, RICEFW F-004, AHM-16).
 *
 * Déplacé depuis pages/cotisations/CotisationStepperPage.tsx le 2026-09-26 (Phase F, demande
 * utilisateur explicite : "Alle Elemente vom 'Mitgliedsbeitrag' nach 'Meine Mitgliedschaft'
 * umziehen. [...] Eintrag 'Mitgliedsbeitrag' entfernen.") — ce composant est désormais rendu
 * comme SECTION de MonAdhesionPage.tsx ("Meine Mitgliedschaft"), plutôt que comme page autonome
 * sous sa propre route/entrée de sidebar. L'ancienne route `/cotisation` reste techniquement
 * active (voir pages/cotisations/CotisationRedirect.tsx) — uniquement pour ne pas casser les
 * liens profonds `?paiement=<id>` déjà utilisés depuis EvenementsPage/ProjetsPage/
 * PublicEvenementsTab (inscription à un événement, contribution à un projet) — mais redirige
 * désormais vers `/mon-adhesion?paiement=<id>` au lieu d'afficher sa propre page.
 *
 * Le contenu/comportement métier n'a PAS changé par rapport à l'ancienne page — seul
 * l'emplacement (section plutôt que page) et la cible de `nouveauPaiement()` (voir plus bas)
 * ont changé.
 *
 * Portée de ce module : 3 étapes (article → mode de paiement → confirmation) en libre-service,
 * au-dessus de l'API déjà construite par AHM-15 (POST /cotisations/ avec statut=payee, cf.
 * apps.cotisations.views).
 *
 * Choix de périmètre actés avec l'utilisateur :
 *  - Seuls les types d'article "cotisation", "adhesion" et "don" sont proposés en création
 *    directe ici — un paiement lié à un événement/projet arrive toujours via le lien direct
 *    `?paiement=<id>` (voir plus bas), jamais créé depuis cette section.
 *  - Ajouté le 2026-09-17 (retour utilisateur, voir apps.cotisations.models.ArticleCatalogue) :
 *    les articles actifs du catalogue géré par l'Administrateur App (/admin/articles-cotisation)
 *    sont proposés ici comme choix supplémentaires (type_article="autre"), à côté des 3 choix
 *    fixes ci-dessus — jamais à leur place.
 *  - Complété le même jour (retour utilisateur : "die bestehende [Cotisation annuelle/Frais
 *    d'adhésion] müssen auch verwaltbar sein") : le montant affiché pour les cartes "cotisation"
 *    et "adhesion" ci-dessus n'est plus la constante MONTANTS_CATALOGUE mais lu depuis les 2
 *    lignes ArticleCatalogue.type_fixe correspondantes (repli sur MONTANTS_CATALOGUE tant que la
 *    requête n'a pas répondu). Ces 2 lignes techniques sont exclues de la liste des articles
 *    personnalisés ci-dessous (elles y apparaîtraient sinon en double, une fois comme carte fixe
 *    et une fois comme article "autre").
 *  - Disponibilité des cartes cotisation/adhésion — changé le 2026-09-17 (retour utilisateur
 *    répété : "Die Artikel müssen komplett gelöscht werden", après qu'une suppression de la ligne
 *    ArticleCatalogue.type_fixe via Django Admin — plutôt qu'une désactivation via /admin/
 *    articles-cotisation — la faisait réapparaître à la connexion suivante) : une carte reste
 *    affichée UNIQUEMENT tant que la requête n'a pas encore répondu (évite un flash "carte absente
 *    puis carte présente" au premier rendu) ; dès que la réponse est là, l'absence de ligne
 *    correspondante masque désormais la carte au même titre qu'une ligne explicitement
 *    actif=false — fail-CLOSED, symétrique à article_catalogue_fixe_actif() côté backend (voir
 *    modèles). Avant ce changement, une ligne supprimée (au lieu de désactivée) faisait réapparaître
 *    la carte au tarif MONTANTS_CATALOGUE, ce qui ne correspondait jamais à l'intention de
 *    l'Administrateur App.
 *  - Aucune donnée bancaire (numéro de carte, IBAN/BIC) n'est saisie sur CETTE section, quel que
 *    soit le mode : pour carte/paypal, la saisie a lieu entièrement sur la page hébergée par le
 *    PSP (Stripe Checkout/PayPal Checkout, AHM-46 ci-dessous) — jamais dans ce formulaire, qui
 *    reste un simple choix de mode. Le virement SEPA n'a toujours pas d'équivalent en ligne
 *    (confirmation manuelle uniquement).
 *
 * AHM-53 (retour utilisateur : recevoir une quittance immédiate pour un virement SEPA non
 * encore réglé est trompeur) : quel que soit le mode de paiement choisi à l'étape 2, le POST de
 * l'étape 3 n'obtient jamais statut=payee en retour — CotisationViewSet.perform_create impose
 * toujours en_attente pour ce flux (voir models.py), aucune passerelle réelle ne pouvant le
 * vérifier. L'écran de confirmation ci-dessous reflète donc un paiement "en attente de
 * confirmation par le Directeur Financier/Admin", pas un paiement déjà réglé — ni référence de
 * transaction, ni reçu PDF tant que ce n'est pas fait (AHM-17 exige statut=payee, voir
 * apps.cotisations.views.receipt).
 *
 * Le reçu PDF (bouton "Télécharger le reçu" du mockup) est disponible depuis AHM-17 —
 * GET /cotisations/{id}/receipt/, téléchargé en Blob puis déclenché côté navigateur, même
 * schéma que MembreImportPage.telechargerTemplate (pas de mutation React Query : c'est un
 * side-effect ponctuel, pas une donnée mise en cache).
 *
 * AHM-46 (passerelles de paiement réelles, écart assumé avec le FDD — voir docstring
 * apps.cotisations.views) : dès que le paiement en_attente ci-dessus est créé, si le mode choisi
 * est carte ou paypal, le stepper enchaîne automatiquement sur
 * POST /cotisations/{id}/initier-paiement-en-ligne/ et redirige le navigateur
 * (window.location.href) vers la page Stripe/PayPal — le virement SEPA reste inchangé (aucune
 * passerelle, confirmation manuelle par le Directeur Financier). Si l'initiation échoue (PSP non
 * configuré, réseau...), le paiement reste simplement en_attente et l'écran de confirmation
 * propose de réessayer, sans bloquer l'utilisateur.
 *
 * PAUSE DU PAIEMENT EN LIGNE (retour utilisateur du 2026-09-19, avant l'activation Stripe/PayPal
 * en production) : MODES_GATEWAY est volontairement vide pour l'instant — "carte" n'est plus
 * proposé du tout, et "paypal" ne redirige plus vers une passerelle réelle mais affiche les
 * coordonnées PayPal de l'association (virement manuel "Amis & Famille", voir
 * components/ui/PaymentInstructions) à côté du virement SEPA déjà existant. Tout le code
 * AHM-46 ci-dessus (redirigerVersGateway, initierPaiementMutation, erreurGateway...) reste
 * intact et fonctionnel — il suffit de restaurer MODES_GATEWAY = ["carte", "paypal"] et de
 * remettre "carte" dans MODES_PROPOSES/la liste de l'étape 2 pour réactiver le paiement en ligne
 * réel dans une phase ultérieure.
 *
 * Lien direct `?paiement=<cotisationId>` (ajouté le 2026-09-20, retour utilisateur : "Wenn ich
 * auf 'Confirmer et payer' clicke, ich soll direkt zur Zahlung springen") : ouvert depuis
 * EvenementsPage.tsx/PublicEvenementsTab.tsx (modal d'inscription "Confirmer et payer", et le
 * bouton "Payer maintenant" de l'onglet "Mes inscriptions") et depuis ProjetsPage.tsx/
 * ProjetDetailPage.tsx (ModaleContribution) vers une Cotisation DÉJÀ créée côté serveur — voir
 * apps.evenements.services.synchroniser_cotisation / apps.cotisations.views (contribution projet)
 * — jamais une nouvelle création. La Cotisation est chargée par `useCotisation(paiementId)`, et
 * l'étape 1 (choix d'article) est sautée pour aller directement à l'étape 2 (choix du mode) :
 * `payer()` n'appelle alors PAS `creerMutation`/POST /cotisations/ (CotisationViewSet n'autorise
 * d'ailleurs même pas PATCH, voir `http_method_names` — un membre ne peut pas non plus corriger le
 * mode a posteriori sur une cotisation existante), il se contente d'afficher l'étape 3 avec cette
 * même cotisation et le mode choisi localement (uniquement pour l'affichage des instructions
 * SEPA/PayPal — la confirmation réelle du paiement reste manuelle, DF/Admin, comme pour tout le
 * reste de ce stepper, AHM-53). Si la cotisation est déjà `payee` (le membre revient sur ce lien
 * après coup), on saute directement à l'étape 3 telle quelle.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import PaymentInstructions from "../ui/PaymentInstructions";
import { telechargerRecuCotisation } from "../../api/cotisations";
import {
  useArticlesCatalogue,
  useCotisation,
  useCreerCotisation,
  useInitierPaiementEnLigne,
  useMesCotisations,
} from "../../hooks/useCotisations";
import { MONTANTS_CATALOGUE } from "../../types/cotisation";
import type { Cotisation, ModePaiement, TypeArticleStepper } from "../../types/cotisation";
import { extractApiErrorMessage } from "../../utils/apiError";

const DON_LIBELLE = "Don libre à l'association";

// Modes redirigés vers une passerelle réelle (AHM-46) — VOLONTAIREMENT VIDE depuis le
// 2026-09-19 (retour utilisateur : le paiement en ligne réel est mis en pause, seuls virement
// SEPA et PayPal manuel — "Amis & Famille", voir PaymentInstructions — sont proposés, confirmés
// manuellement par le Directeur Financier). L'intégration Stripe/PayPal (backend + ce fichier)
// reste intacte pour une réactivation future : il suffira de remettre ["carte", "paypal"] ici et
// "carte" dans la liste de modes ci-dessous (étape 2) pour la réactiver.
const MODES_GATEWAY: ModePaiement[] = [];

// Modes réellement proposés au membre pour le moment (voir commentaire MODES_GATEWAY
// ci-dessus) — "carte" (Stripe) est volontairement absent de cette liste, pas du type
// ModePaiement lui-même.
const MODES_PROPOSES: ModePaiement[] = ["virement_sepa", "paypal"];

const STATUT_STYLES: Record<Cotisation["statut"], string> = {
  en_attente: "bg-status-warningBg text-status-warningText",
  payee: "bg-status-successBg text-status-successText",
  echouee: "bg-status-dangerBg text-status-dangerText",
  remboursee: "bg-bg-tertiary text-text-secondary",
  annulee: "bg-bg-tertiary text-text-secondary",
};

function formatMontant(montant: number): string {
  return `${montant.toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

interface EtapeIndicateurProps {
  numero: 1 | 2 | 3;
  label: string;
  active: boolean;
  franchie: boolean;
}

function EtapeIndicateur({ numero, label, active, franchie }: EtapeIndicateurProps) {
  const cur = active || franchie;
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
          cur ? "bg-ca text-white" : "bg-bg-tertiary text-text-tertiary"
        }`}
      >
        {numero}
      </div>
      <span className={`text-xs font-medium ${cur ? "text-text-primary" : "text-text-tertiary"}`}>
        {label}
      </span>
    </div>
  );
}

export default function PaiementStepper() {
  const { t } = useTranslation("cotisations");
  const navigate = useNavigate();
  const anneeCourante = new Date().getFullYear();

  const [searchParams] = useSearchParams();
  // Lien direct depuis un autre module (voir docstring de tête) — id d'une Cotisation déjà
  // créée côté serveur, jamais d'un article à choisir.
  const paiementId = searchParams.get("paiement") ?? undefined;
  const cotisationLiee = useCotisation(paiementId);

  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [articleChoisi, setArticleChoisi] = useState<TypeArticleStepper>("cotisation");
  const [articleCatalogueId, setArticleCatalogueId] = useState<string | null>(null);
  const [donMontant, setDonMontant] = useState("10");
  const [donErreur, setDonErreur] = useState<string | null>(null);
  const [modePaiement, setModePaiement] = useState<ModePaiement>("virement_sepa");
  const [resultat, setResultat] = useState<Cotisation | null>(null);
  const [recuEnCours, setRecuEnCours] = useState<string | null>(null);
  const [erreurRecu, setErreurRecu] = useState<string | null>(null);
  const [redirectionEnCours, setRedirectionEnCours] = useState(false);
  const [erreurGateway, setErreurGateway] = useState<string | null>(null);

  const historique = useMesCotisations();
  const creerMutation = useCreerCotisation();
  const initierPaiementMutation = useInitierPaiementEnLigne();
  const articlesCatalogue = useArticlesCatalogue();
  // Le backend scope déjà aux articles actif=true pour un rôle < Administrateur App (voir
  // ArticleCatalogueViewSet.get_queryset), mais on refiltre ici par défense en profondeur — un
  // Administrateur App consultant lui-même cette section ne doit pas se voir proposer un article
  // qu'il vient de désactiver. `type_fixe` exclu : ces 2 lignes techniques sont représentées par
  // les cartes cotisation/adhesion ci-dessous, jamais par une carte "autre" supplémentaire.
  const articlesCatalogueActifs = (articlesCatalogue.data?.results ?? []).filter(
    (a) => a.actif && a.type_fixe === null,
  );

  // Tarifs cotisation/adhésion pilotés par l'Administrateur App (2026-09-17, voir docstring de
  // module) — repli sur MONTANTS_CATALOGUE tant que la requête n'a pas encore répondu.
  const articleFixeCotisation = articlesCatalogue.data?.results.find(
    (a) => a.type_fixe === "cotisation",
  );
  const articleFixeAdhesion = articlesCatalogue.data?.results.find(
    (a) => a.type_fixe === "adhesion",
  );
  const montantCotisation = articleFixeCotisation
    ? Number(articleFixeCotisation.montant)
    : MONTANTS_CATALOGUE.cotisation;
  const montantAdhesion = articleFixeAdhesion
    ? Number(articleFixeAdhesion.montant)
    : MONTANTS_CATALOGUE.adhesion;
  // Fail-CLOSED depuis le 2026-09-17 (voir docstring de module) : une carte reste affichée
  // seulement tant que la requête n'a pas encore répondu ; une fois les données là, l'absence de
  // ligne correspondante (supprimée) masque la carte, exactement comme actif=false explicite —
  // symétrique à article_catalogue_fixe_actif() côté backend.
  const cotisationDisponible = articlesCatalogue.data
    ? Boolean(articleFixeCotisation?.actif)
    : true;
  const adhesionDisponible = articlesCatalogue.data ? Boolean(articleFixeAdhesion?.actif) : true;

  function redirigerVersGateway(cotisationId: string) {
    setErreurGateway(null);
    setRedirectionEnCours(true);
    initierPaiementMutation.mutate(cotisationId, {
      onSuccess: ({ redirect_url }) => {
        window.location.href = redirect_url;
      },
      onError: (error) => {
        setRedirectionEnCours(false);
        setErreurGateway(extractApiErrorMessage(error, t("paiement.erreur_gateway")));
      },
    });
  }

  async function telechargerRecu(c: Cotisation) {
    setErreurRecu(null);
    setRecuEnCours(c.id);
    try {
      const blob = await telechargerRecuCotisation(c.id);
      const url = window.URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = `recu-${c.reference_transaction ?? c.id}.pdf`;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErreurRecu(extractApiErrorMessage(error, t("recu.erreur")));
    } finally {
      setRecuEnCours(null);
    }
  }

  const ARTICLES: {
    type: TypeArticleStepper;
    titre: string;
    description: string;
    montant: number | null;
    disponible: boolean;
  }[] = [
    {
      type: "cotisation",
      titre: t("article.cotisation_titre", { annee: anneeCourante }),
      description: t("article.cotisation_description"),
      montant: montantCotisation,
      disponible: cotisationDisponible,
    },
    {
      type: "adhesion",
      titre: t("article.adhesion_titre"),
      description: t("article.adhesion_description"),
      montant: montantAdhesion,
      disponible: adhesionDisponible,
    },
    {
      type: "don",
      titre: t("article.don_titre"),
      description: t("article.don_description"),
      montant: null,
      disponible: true,
    },
  ];
  const ARTICLES_DISPONIBLES = ARTICLES.filter((a) => a.disponible);

  // Si l'article fixe actuellement sélectionné est désactivé pendant que le membre est sur cette
  // page (données rechargées entre-temps), on retombe sur le premier choix encore disponible —
  // seulement à l'étape 1, pour ne jamais changer la sélection après validation (étapes 2/3).
  useEffect(() => {
    if (
      etape === 1 &&
      articleChoisi !== "don" &&
      articleChoisi !== "autre" &&
      !ARTICLES_DISPONIBLES.some((a) => a.type === articleChoisi) &&
      ARTICLES_DISPONIBLES.length > 0
    ) {
      setArticleChoisi(ARTICLES_DISPONIBLES[0].type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotisationDisponible, adhesionDisponible, etape]);

  // Lien direct `?paiement=<id>` (voir docstring de tête) : dès que la Cotisation existante est
  // chargée, on saute l'étape 1 (aucun article à choisir, elle existe déjà) — directement à
  // l'étape 3 si déjà payée (le membre revient sur ce lien après coup), sinon à l'étape 2 (choix
  // du mode) en pré-sélectionnant son mode_paiement actuel s'il en a déjà un.
  useEffect(() => {
    if (!paiementId || !cotisationLiee.data) return;
    const c = cotisationLiee.data;
    if (c.statut === "payee") {
      setResultat(c);
      setEtape(3);
    } else if ((c.statut === "en_attente" || c.statut === "echouee") && etape === 1) {
      setModePaiement(c.mode_paiement || "virement_sepa");
      setEtape(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paiementId, cotisationLiee.data]);

  const articleCatalogueChoisi = articlesCatalogueActifs.find((a) => a.id === articleCatalogueId);

  const donMontantNombre = Number(donMontant.replace(",", "."));
  const montantAffiche = paiementId
    ? Number(cotisationLiee.data?.montant ?? 0)
    : articleChoisi === "don"
      ? Number.isFinite(donMontantNombre)
        ? donMontantNombre
        : 0
      : articleChoisi === "autre"
        ? Number(articleCatalogueChoisi?.montant ?? 0)
        : (ARTICLES.find((a) => a.type === articleChoisi)?.montant ?? 0);
  const libelleAffiche = paiementId
    ? (cotisationLiee.data?.libelle ?? "")
    : articleChoisi === "don"
      ? DON_LIBELLE
      : articleChoisi === "autre"
        ? (articleCatalogueChoisi?.libelle ?? "")
        : (ARTICLES.find((a) => a.type === articleChoisi)?.titre ?? "");

  function allerEtapePaiement() {
    if (articleChoisi === "don") {
      if (!(donMontantNombre > 0)) {
        setDonErreur(t("article.don_montant_erreur"));
        return;
      }
    }
    setDonErreur(null);
    setEtape(2);
  }

  function payer() {
    if (paiementId && cotisationLiee.data) {
      // Cotisation déjà créée côté serveur (voir docstring de tête) — jamais de POST
      // /cotisations/ ici, `mode_paiement` n'est fusionné que localement pour piloter
      // l'affichage des instructions SEPA/PayPal à l'étape 3 (CotisationViewSet n'autorise de
      // toute façon aucune écriture PATCH sur une cotisation existante).
      setResultat({ ...cotisationLiee.data, mode_paiement: modePaiement });
      setEtape(3);
      return;
    }
    const payload =
      articleChoisi === "don"
        ? {
            type_article: "don" as const,
            mode_paiement: modePaiement,
            libelle: DON_LIBELLE,
            montant: donMontantNombre.toFixed(2),
          }
        : articleChoisi === "autre"
          ? {
              type_article: "autre" as const,
              mode_paiement: modePaiement,
              article_catalogue: articleCatalogueId ?? undefined,
            }
          : {
              type_article: articleChoisi,
              mode_paiement: modePaiement,
            };

    creerMutation.mutate(payload, {
      onSuccess: (cotisation) => {
        setResultat(cotisation);
        setEtape(3);
        // AHM-46 : carte/paypal enchaînent immédiatement sur la passerelle réelle — la cotisation
        // reste en_attente jusqu'au webhook, quel que soit le résultat de cette redirection (voir
        // docstring de module). "payee" ne peut en pratique pas arriver ici pour ce flux
        // libre-service (AHM-53), mais on ne redirige jamais une cotisation déjà réglée.
        if (cotisation.statut !== "payee" && MODES_GATEWAY.includes(modePaiement)) {
          redirigerVersGateway(cotisation.id);
        }
      },
    });
  }

  function nouveauPaiement() {
    setArticleChoisi("cotisation");
    setArticleCatalogueId(null);
    setDonMontant("10");
    setDonErreur(null);
    setModePaiement("virement_sepa");
    setResultat(null);
    setRedirectionEnCours(false);
    setErreurGateway(null);
    creerMutation.reset();
    if (paiementId) {
      // Retire `?paiement=...` de l'URL, sinon l'effet ci-dessus resauterait immédiatement à
      // l'étape 2 dès qu'elle repasse à 1. Cible "/mon-adhesion" (et non plus "/cotisation")
      // depuis la Phase F (2026-09-26, fusion Mitgliedsbeitrag -> Meine Mitgliedschaft) : cette
      // section vit désormais exclusivement sous MonAdhesionPage.
      navigate("/mon-adhesion", { replace: true });
    }
    setEtape(1);
  }

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-bold text-text-primary">{t("article.titre")}</h2>

      <div className="mb-5 flex items-center gap-3">
        <EtapeIndicateur
          numero={1}
          label={t("etape.choisir")}
          active={etape === 1}
          franchie={etape > 1}
        />
        <div className="h-px w-8 bg-text-tertiary/30" />
        <EtapeIndicateur
          numero={2}
          label={t("etape.paiement")}
          active={etape === 2}
          franchie={etape > 2}
        />
        <div className="h-px w-8 bg-text-tertiary/30" />
        <EtapeIndicateur
          numero={3}
          label={t("etape.confirmation")}
          active={etape === 3}
          franchie={false}
        />
      </div>

      {paiementId && etape === 1 && (
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          {cotisationLiee.isLoading && (
            <p className="text-sm text-text-tertiary">{t("paiement.chargement_lien")}</p>
          )}
          {cotisationLiee.isError && (
            <p className="text-sm text-status-dangerText">{t("paiement.erreur_lien")}</p>
          )}
        </div>
      )}

      {!paiementId && etape === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-bold text-text-primary">{t("article.titre")}</h3>
            <div className="space-y-2">
              {ARTICLES_DISPONIBLES.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => {
                    setArticleChoisi(a.type);
                    setArticleCatalogueId(null);
                  }}
                  className={`flex w-full items-center justify-between rounded-cid border px-3 py-2 text-left ${
                    articleChoisi === a.type
                      ? "border-ca bg-cal/20"
                      : "border-text-tertiary/20 hover:bg-bg-tertiary"
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{a.titre}</div>
                    <div className="text-xs text-text-tertiary">{a.description}</div>
                  </div>
                  {a.montant !== null && (
                    <div className="text-sm font-bold text-ca">{formatMontant(a.montant)}</div>
                  )}
                </button>
              ))}
              {/* Articles supplémentaires gérés par l'Administrateur App (voir docstring de
                  module) — mêmes cartes que ci-dessus, sélection identifiée par l'id de
                  l'article plutôt que par son type (toujours "autre"). */}
              {articlesCatalogueActifs.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => {
                    setArticleChoisi("autre");
                    setArticleCatalogueId(article.id);
                  }}
                  className={`flex w-full items-center justify-between rounded-cid border px-3 py-2 text-left ${
                    articleChoisi === "autre" && articleCatalogueId === article.id
                      ? "border-ca bg-cal/20"
                      : "border-text-tertiary/20 hover:bg-bg-tertiary"
                  }`}
                >
                  <div className="text-sm font-semibold text-text-primary">{article.libelle}</div>
                  <div className="text-sm font-bold text-ca">
                    {formatMontant(Number(article.montant))}
                  </div>
                </button>
              ))}
              {articlesCatalogue.isLoading && (
                <p className="text-xs text-text-tertiary">{t("article.catalogue_chargement")}</p>
              )}
              {articlesCatalogue.isError && (
                <p className="text-xs text-status-dangerText">{t("article.catalogue_erreur")}</p>
              )}
            </div>

            {articleChoisi === "don" && (
              <div className="mt-3">
                <label
                  htmlFor="don-montant"
                  className="mb-1 block text-xs font-medium text-text-secondary"
                >
                  {t("article.don_montant_label")}
                </label>
                <input
                  id="don-montant"
                  type="number"
                  min="1"
                  step="0.01"
                  value={donMontant}
                  onChange={(e) => {
                    setDonMontant(e.target.value);
                    setDonErreur(null);
                  }}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
                {donErreur && <p className="mt-1 text-xs text-status-dangerText">{donErreur}</p>}
              </div>
            )}
          </div>

          <div>
            <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-bold text-text-primary">{t("recap.titre")}</h3>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">{t("recap.article")}</dt>
                  <dd className="font-medium text-text-primary">{libelleAffiche}</dd>
                </div>
                <div className="flex justify-between border-t border-text-tertiary/10 pt-1.5 font-bold">
                  <dt className="text-text-primary">{t("recap.montant")}</dt>
                  <dd className="text-ca">{formatMontant(montantAffiche)}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={allerEtapePaiement}
                className="mt-3 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad"
              >
                {t("continuer")}
              </button>
            </div>

            <div className="mt-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-bold text-text-primary">{t("historique.titre")}</h3>
              {historique.isLoading && (
                <p className="text-sm text-text-tertiary">{t("historique.chargement")}</p>
              )}
              {historique.isError && (
                <p className="text-sm text-status-dangerText">{t("historique.erreur")}</p>
              )}
              {historique.data && historique.data.results.length === 0 && (
                <p className="text-sm text-text-tertiary">{t("historique.aucun")}</p>
              )}
              {erreurRecu && <p className="mb-2 text-xs text-status-dangerText">{erreurRecu}</p>}
              {historique.data && historique.data.results.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                        <th className="py-1">{t("historique.col_date")}</th>
                        <th className="py-1">{t("historique.col_libelle")}</th>
                        <th className="py-1">{t("historique.col_montant")}</th>
                        <th className="py-1">{t("historique.col_statut")}</th>
                        <th className="py-1">{t("historique.col_recu")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Retour utilisateur du 2026-09-27 : la kachel ne doit pas étirer la page —
                        seuls les 5 paiements les plus récents sont affichés (le tri "-created_at"
                        du backend, voir CotisationViewSet.ordering, garantit qu'il s'agit bien
                        des plus récents, jamais d'un sous-ensemble arbitraire). */}
                      {historique.data.results.slice(0, 5).map((c) => (
                        <tr key={c.id} className="border-b border-text-tertiary/10 last:border-0">
                          <td className="py-1">{formatDate(c.date_paiement ?? c.created_at)}</td>
                          <td className="py-1">{c.libelle}</td>
                          <td className="py-1">{formatMontant(Number(c.montant))}</td>
                          <td className="py-1">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[c.statut]}`}
                            >
                              {t(`statut.${c.statut}`)}
                            </span>
                          </td>
                          <td className="py-1">
                            {c.statut === "payee" && (
                              <button
                                type="button"
                                onClick={() => telechargerRecu(c)}
                                disabled={recuEnCours === c.id}
                                className="font-medium text-ca hover:underline disabled:opacity-40"
                              >
                                {recuEnCours === c.id ? t("recu.en_cours") : t("recu.telecharger")}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {etape === 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-bold text-text-primary">{t("paiement.titre")}</h3>
            <div className="space-y-2">
              {[
                {
                  mode: "virement_sepa" as const,
                  titre: t("paiement.sepa_titre"),
                  desc: t("paiement.sepa_description"),
                },
                {
                  mode: "paypal" as const,
                  titre: t("paiement.paypal_titre"),
                  desc: t("paiement.paypal_description"),
                },
              ]
                .filter((m) => MODES_PROPOSES.includes(m.mode))
                .map((m) => (
                  <label
                    key={m.mode}
                    className={`flex cursor-pointer items-center gap-3 rounded-cid border px-3 py-2 ${
                      modePaiement === m.mode ? "border-ca bg-cal/20" : "border-text-tertiary/20"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mode_paiement"
                      checked={modePaiement === m.mode}
                      onChange={() => setModePaiement(m.mode)}
                    />
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{m.titre}</div>
                      <div className="text-xs text-text-tertiary">{m.desc}</div>
                    </div>
                  </label>
                ))}
            </div>
            <p className="mt-3 text-xs text-text-tertiary">
              {MODES_GATEWAY.includes(modePaiement)
                ? t("paiement.note_gateway")
                : t("paiement.note")}
            </p>
            {!MODES_GATEWAY.includes(modePaiement) && (
              <PaymentInstructions
                mode={modePaiement === "paypal" ? "paypal" : "virement_sepa"}
                className="mt-3"
              />
            )}
          </div>

          <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h3 className="mb-3 text-xs font-bold text-text-primary">{t("recap.titre")}</h3>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("recap.article")}</dt>
                <dd className="font-medium text-text-primary">{libelleAffiche}</dd>
              </div>
              <div className="flex justify-between font-bold">
                <dt className="text-text-primary">{t("recap.montant")}</dt>
                <dd className="text-ca">{formatMontant(montantAffiche)}</dd>
              </div>
            </dl>

            {creerMutation.isError && (
              <p className="mt-2 text-sm text-status-dangerText">
                {extractApiErrorMessage(creerMutation.error, t("paiement.erreur"))}
              </p>
            )}

            <button
              type="button"
              onClick={payer}
              disabled={creerMutation.isPending}
              className="mt-3 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {paiementId
                ? t("paiement.voir_instructions")
                : t("paiement.payer", { montant: formatMontant(montantAffiche).replace(" €", "") })}
            </button>
            {/* Pas de retour à l'étape 1 pour un lien direct (voir docstring de tête) : il n'y a
                aucun article à choisir, revenir en arrière resauterait immédiatement ici. */}
            {!paiementId && (
              <button
                type="button"
                onClick={() => setEtape(1)}
                className="mt-2 w-full rounded-cid border border-text-tertiary/30 px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary"
              >
                {t("paiement.retour")}
              </button>
            )}
          </div>
        </div>
      )}

      {etape === 3 && resultat && (
        <div className="rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
          {resultat.statut === "payee" ? (
            <>
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-status-successBg text-2xl text-status-successText">
                ✓
              </div>
              <div className="mb-1 text-lg font-bold text-text-primary">
                {t("confirmation.titre")}
              </div>
              <div className="mb-4 text-sm text-text-tertiary">{t("confirmation.sous_titre")}</div>
            </>
          ) : (
            <>
              {/* AHM-53 : aucun mode de paiement en libre-service n'est confirmé à la création —
                  voir docstring en tête de fichier. */}
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-status-warningBg text-2xl text-status-warningText">
                ⏳
              </div>
              <div className="mb-1 text-lg font-bold text-text-primary">
                {t("confirmation.titre_attente")}
              </div>
              <div className="mb-4 text-sm text-text-tertiary">
                {t("confirmation.sous_titre_attente")}
              </div>

              {(resultat.mode_paiement === "virement_sepa" ||
                resultat.mode_paiement === "paypal") && (
                <div className="mx-auto mb-4 max-w-sm">
                  <PaymentInstructions mode={resultat.mode_paiement} />
                </div>
              )}

              {MODES_GATEWAY.includes(resultat.mode_paiement as ModePaiement) && (
                <div className="mx-auto mb-4 max-w-sm">
                  {erreurGateway ? (
                    <>
                      <p className="mb-2 text-sm text-status-dangerText">{erreurGateway}</p>
                      <button
                        type="button"
                        onClick={() => redirigerVersGateway(resultat.id)}
                        disabled={initierPaiementMutation.isPending}
                        className="w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
                      >
                        {t("paiement.reessayer_gateway")}
                      </button>
                    </>
                  ) : (
                    redirectionEnCours && (
                      <p className="text-sm text-text-tertiary">
                        {t("paiement.redirection_en_cours")}
                      </p>
                    )
                  )}
                </div>
              )}
            </>
          )}

          <dl className="mx-auto mb-5 max-w-sm space-y-1.5 rounded-cid border border-text-tertiary/10 p-4 text-left text-sm">
            {resultat.reference_transaction && (
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("confirmation.reference")}</dt>
                <dd className="font-mono text-text-primary">{resultat.reference_transaction}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("confirmation.article")}</dt>
              <dd className="text-text-primary">{resultat.libelle}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("confirmation.montant")}</dt>
              <dd className="font-bold text-ca">{formatMontant(Number(resultat.montant))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">
                {resultat.statut === "payee" ? t("confirmation.date") : t("confirmation.statut")}
              </dt>
              <dd className="text-text-primary">
                {resultat.statut === "payee"
                  ? formatDate(resultat.date_paiement)
                  : t(`statut.${resultat.statut}`)}
              </dd>
            </div>
          </dl>

          {erreurRecu && <p className="mb-3 text-sm text-status-dangerText">{erreurRecu}</p>}

          <div className="flex justify-center gap-2">
            {resultat.statut === "payee" && (
              <button
                type="button"
                onClick={() => telechargerRecu(resultat)}
                disabled={recuEnCours === resultat.id}
                className="rounded-cid border border-ca px-3 py-1.5 text-sm font-medium text-ca hover:bg-cal/20 disabled:opacity-40"
              >
                {recuEnCours === resultat.id ? t("recu.en_cours") : t("recu.telecharger")}
              </button>
            )}
            <button
              type="button"
              onClick={nouveauPaiement}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("confirmation.nouveau_paiement")}
            </button>
            <Link
              to="/dashboard"
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
            >
              {t("confirmation.accueil")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
