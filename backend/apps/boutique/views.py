"""
Vues API — app boutique (FDD §3.4) :
  GET/POST   /boutique/produits/                — catalogue (lecture: tous — brouillons/
                                                    archivés réservés Bureau Admin+ ;
                                                    écriture: Bureau Admin+)
  GET/POST   /boutique/variantes/                — variantes (même règle d'accès)
  GET        /boutique/commandes/                — scope selon rôle (Bureau Admin+ voit
                                                    tout, sinon les siennes — FDD §2.2)
  POST       /boutique/commandes/passer/         — passer commande (stock vérifié et
                                                    décrémenté atomiquement, SELECT FOR
                                                    UPDATE ; prix recalculé côté serveur)
  POST       /boutique/commandes/{id}/annuler/   — annuler (propriétaire ou Bureau
                                                    Admin+, depuis en_attente/confirmée) —
                                                    restitue le stock atomiquement
  POST       /boutique/commandes/{id}/changer-statut/ — faire progresser le statut
                                                    (Bureau Admin+ — transitions validées,
                                                    voir models.TRANSITIONS_STATUT_COMMANDE ;
                                                    n'inclut PLUS confirmee/expediee, voir
                                                    ci-dessous)
  POST       /boutique/commandes/{id}/initier-paiement-en-ligne/ — crée une session Stripe
                                                    ou commande PayPal Checkout pour cette
                                                    commande et renvoie son URL de
                                                    redirection ; propriétaire uniquement
                                                    (ajouté le 2026-09-17, voir
                                                    apps.boutique.webhooks pour la
                                                    confirmation asynchrone côté PSP)
  POST       /boutique/commandes/{id}/confirmer-paiement/ — confirme la réception d'un
                                                    paiement (en_attente -> confirmee),
                                                    Directeur Financier+ (demande
                                                    utilisateur du 2026-09-15) — reste la
                                                    seule voie pour virement/espèces ; pour
                                                    un paiement en ligne, la confirmation
                                                    passe par le webhook PSP, pas par cette
                                                    action
  POST       /boutique/commandes/{id}/expedier/  — expédie avec numéro de suivi
                                                    (-> expediee), Directeur Financier+ ;
                                                    `nacherfassement=true` saute
                                                    directement à expediee pour une
                                                    commande gérée hors flux normal
  GET        /boutique/commandes/{id}/confirmation/ — Bestellbestätigung PDF, disponible
                                                    pour toute commande quel que soit son
                                                    statut (ajouté le 2026-09-25)
  GET        /boutique/commandes/{id}/facture/   — Rechnung PDF, disponible uniquement
                                                    après confirmation du paiement (ajouté
                                                    le 2026-09-25)
  GET        /boutique/commandes/export/         — export Excel des commandes, mêmes
                                                    filtres/scope que la liste (ajouté le
                                                    2026-09-25)
  GET/POST   /boutique/retours/                  — retours partiels par ligne de
                                                    commande (Bureau Admin+), réintègre le
                                                    stock atomiquement
  GET/POST   /boutique/regles-reduction/         — paliers de réduction par quantité (lecture:
                                                    tous — inactifs/produit non publié réservés
                                                    Bureau Admin+ ; écriture: Bureau Admin+ —
                                                    ajouté le 2026-09-23)
  GET        /boutique/bons-achat/               — mes bons d'achat / vue d'ensemble Bureau
                                                    Admin+ — désormais purement en lecture (voir
                                                    ci-dessous, plus de création/confirmation
                                                    dédiée)
  POST       /boutique/bons-achat/verifier/      — vérifie un code sans le consommer (aperçu
                                                    checkout), tout authentifié

Pas de create/update/destroy génériques exposés sur Commande : une fois créée (via
`passer`), elle n'évolue que par ses actions dédiées — registre append-only, même
convention que Cotisation/Souscription.

Notifications (Phase 2B, voir notifications.py) : `passer` et `expedier` déclenchent chacun un
email + une notification in-app — voir
apps.notifications.models.TypeNotification.BOUTIQUE_COMMANDE_CONFIRMEE/EXPEDIEE.
`confirmer_paiement` et la création d'un Retour ne déclenchent volontairement pas d'email
(hors du périmètre demandé le 2026-09-15 — seules la confirmation de commande et l'expédition en
ont un). Un BonAchat vient d'être créé (voir _generer_bons_achat ci-dessous) déclenche lui aussi
un email + une notification in-app — voir notifications.notifier_bon_achat_actif.

Offres personnalisées et bons d'achat (demande utilisateur du 2026-09-23, révisée le même jour :
achat d'un bon d'achat intégré au catalogue plutôt que via un module séparé — voir docstring de
tête de models.py) :
  - `passer`/`vendre_especes` appliquent automatiquement les RegleReduction actives du produit de
    chaque ligne (calculer_reduction_quantite) pour une ligne PHYSIQUE, et `passer` accepte en
    plus un `code_bon_achat` optionnel déduit du total (dépense d'un bon existant) — toujours
    recalculé/validé côté serveur sous verrou (CLAUDE.md §8), jamais fait confiance à un montant
    envoyé par le client.
  - Un bon d'achat s'achète désormais comme n'importe quel produit : une ligne dont la variante
    appartient à un Produit `type_produit=BON_ACHAT` porte un `montant` choisi par l'acheteur
    (revalidé côté serveur, voir serializers.py) au lieu du prix catalogue, ignore toute
    RegleReduction et ne touche à aucun stock (voir `_construire_ligne_avec_reduction`). Dès que
    la Commande qui la contient passe à CONFIRMEE — immédiatement dans `passer` si intégralement
    couverte par un bon existant, dans `vendre_especes`, via `confirmer_paiement` manuel, ou via
    le webhook PSP (`webhooks._confirmer_paiement_gateway`) — `_generer_bons_achat` crée le(s)
    BonAchat correspondant(s), déjà ACTIF, et envoie l'email/notification existants.
"""

from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS
from apps.cotisations.gateways import GatewayError, creer_commande_paypal, creer_session_stripe
from apps.cotisations.permissions import SAISIE_POUR_AUTRUI_MIN_LEVEL
from apps.membres.utils_http import xlsx_response
from apps.rbac.permissions import module_access_permission
from apps.rbac.services import is_elevated_for_module

from .exports import construire_classeur_commandes
from .filters import CommandeFilter, ProduitFilter, RetourFilter
from .models import (
    STATUTS_ANNULABLES,
    STATUTS_CONFIRMABLES_PAIEMENT,
    STATUTS_EXPEDIABLES_NACERFASSEMENT,
    STATUTS_EXPEDIABLES_NORMAL,
    TRANSITIONS_STATUT_COMMANDE,
    BonAchat,
    Commande,
    LigneCommande,
    ModePaiementCommande,
    Produit,
    ProduitImage,
    RegleReduction,
    Retour,
    StatutBonAchat,
    StatutCommande,
    StatutProduit,
    TypeProduit,
    UtilisationBonAchat,
    VarianteProduit,
    calculer_reduction_quantite,
)
from .notifications import (
    notifier_bon_achat_actif,
    notifier_commande_annulee,
    notifier_commande_confirmee,
    notifier_commande_expediee,
    notifier_nouvelle_commande_staff,
)
from .pdf import generate_confirmation_pdf, generate_facture_pdf
from .permissions import (
    GESTION_CATALOGUE_MIN_LEVEL,
    ORDER_VISIBILITY_MIN_LEVEL,
    BonAchatPermission,
    CatalogueBoutiquePermission,
    CommandePermission,
    RetourPermission,
)
from .serializers import (
    BonAchatSerializer,
    BonAchatVerificationSerializer,
    ChangerStatutCommandeSerializer,
    CommandeSerializer,
    ConfirmerPaiementCommandeSerializer,
    ExpedierCommandeSerializer,
    InitierPaiementEnLigneCommandeSerializer,
    PasserCommandeSerializer,
    ProduitImageSerializer,
    ProduitSerializer,
    RegleReductionSerializer,
    RetourSerializer,
    VarianteProduitSerializer,
    VendreEspecesCommandeSerializer,
    VerifierBonAchatSerializer,
)


class BoutiqueCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class VarianteCursorPagination(CursorPagination):
    """Bug préexistant corrigé au passage : VarianteProduit ne porte pas de `created_at`
    (contrairement à Produit/Commande), donc `BoutiqueCursorPagination` (ordering sur
    `-created_at`) faisait échouer en 500 tout listing de /boutique/variantes/ — y compris
    l'appel `?id__in=...` ajouté ici pour la revalidation du stock panier. `id` (UUID,
    toujours présent et unique) est un tri stable suffisant pour ce endpoint."""

    page_size = 20
    ordering = ("id",)


class ProduitViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CatalogueBoutiquePermission]
    serializer_class = ProduitSerializer
    pagination_class = BoutiqueCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = ProduitFilter

    def get_queryset(self):
        # prefetch_related("regles_reduction") : évite le N+1 côté
        # ProduitSerializer.get_regles_reduction_actives (ajouté le 2026-09-23).
        queryset = Produit.objects.prefetch_related("variantes", "regles_reduction").all()
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_CATALOGUE_MIN_LEVEL
        ):
            return queryset
        return queryset.filter(statut=StatutProduit.PUBLIE)


class ProduitImageViewSet(ModelViewSet):
    """Galerie de photos supplémentaires par produit (demande utilisateur du 2026-09-27, point
    13.1 "mehr als ein Bild pro Produkt hochladen... User können sie im Shop anschauen") — même
    règle d'accès que Produit (CatalogueBoutiquePermission : lecture ouverte à tout le monde, y
    compris anonyme, écriture réservée à "Shop-Verwaltung" page_boutique lecture_ecriture).
    Contrairement à apps.projets.views.ProjetImageViewSet, pas de vérification manuelle
    supplémentaire dans perform_create : il n'existe pas ici de notion de "responsable d'un
    produit précis" comme pour Projet.responsable — l'accès en écriture est uniquement porté
    par le rôle/la page RBAC, déjà entièrement vérifié par has_permission."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CatalogueBoutiquePermission]
    serializer_class = ProduitImageSerializer
    pagination_class = BoutiqueCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["produit"]
    queryset = ProduitImage.objects.select_related("produit", "uploaded_by")

    def perform_create(self, serializer):
        membre = getattr(self.request.user, "membre", None)
        serializer.save(uploaded_by=membre)


class RegleReductionViewSet(ModelViewSet):
    """Paliers de réduction par quantité (demande utilisateur du 2026-09-23) — même règle
    d'accès que Produit/VarianteProduit, voir permissions.py."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CatalogueBoutiquePermission]
    serializer_class = RegleReductionSerializer
    pagination_class = BoutiqueCursorPagination
    filterset_fields = {"produit": ["exact", "in"], "actif": ["exact"]}

    def get_queryset(self):
        queryset = RegleReduction.objects.select_related("produit").all()
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_CATALOGUE_MIN_LEVEL
        ):
            return queryset
        return queryset.filter(actif=True, produit__statut=StatutProduit.PUBLIE)


class VarianteProduitViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CatalogueBoutiquePermission]
    serializer_class = VarianteProduitSerializer
    pagination_class = VarianteCursorPagination
    # Forme dict pour exposer `?id__in=uuid1,uuid2,...` — utilisé par le panier frontend pour
    # revalider en un seul appel le stock courant de toutes les variantes qu'il contient
    # (détection "ausverkauft" / rupture de stock survenue depuis l'ajout au panier).
    filterset_fields = {"produit": ["exact"], "id": ["in"]}

    def get_queryset(self):
        queryset = VarianteProduit.objects.select_related("produit").all()
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_CATALOGUE_MIN_LEVEL
        ):
            return queryset
        return queryset.filter(produit__statut=StatutProduit.PUBLIE)


def _restituer_stock(commande):
    """Restitue atomiquement le stock des lignes d'une commande annulée — verrouille les
    variantes concernées, triées par id pour éviter tout interblocage avec `passer`. Les lignes
    bon_achat sont ignorées (aucun stock n'a jamais été décrémenté pour elles à la création, voir
    _construire_ligne_avec_reduction/passer) — leur restituer du "stock" créerait une valeur
    incohérente sur la VarianteProduit sentinelle sans aucune signification métier."""
    lignes = list(
        LigneCommande.objects.filter(commande=commande)
        .select_related("variante", "variante__produit")
        .order_by("variante_id")
    )
    lignes = [
        ligne for ligne in lignes if ligne.variante.produit.type_produit != TypeProduit.BON_ACHAT
    ]
    if not lignes:
        return
    variante_ids = sorted({ligne.variante_id for ligne in lignes})
    variantes = {
        v.id: v for v in VarianteProduit.objects.select_for_update().filter(id__in=variante_ids)
    }
    for ligne in lignes:
        variante = variantes[ligne.variante_id]
        variante.stock += ligne.quantite
        variante.save(update_fields=["stock"])


def _restituer_bon_achat(commande):
    """Restitue le solde d'un bon d'achat appliqué à une commande annulée (demande utilisateur
    du 2026-09-23, appelée aux côtés de `_restituer_stock` dans `annuler`/`changer_statut`) —
    même principe de verrouillage. `commande.bon_achat`/`montant_bon_achat` et
    l'UtilisationBonAchat déjà créée restent inchangés (trace historique de ce qui avait été
    appliqué, même convention append-only que Retour) ; seul le solde/statut du bon lui-même est
    réajusté pour redevenir utilisable."""
    if commande.bon_achat_id is None or commande.montant_bon_achat <= 0:
        return
    bon = BonAchat.objects.select_for_update().get(id=commande.bon_achat_id)
    bon.solde += commande.montant_bon_achat
    if bon.statut == StatutBonAchat.EPUISE:
        bon.statut = StatutBonAchat.ACTIF
    bon.save(update_fields=["solde", "statut", "updated_at"])


def _construire_ligne_avec_reduction(variante, quantite, montant=None, membre=None):
    """Calcule la ligne (kwargs prêts pour LigneCommande.objects.create) et le sous-total NET
    d'un article, réduction quantité comprise (demande utilisateur du 2026-09-23) — partagé par
    `passer` et `vendre_especes` pour ne jamais dupliquer cette logique entre les deux points
    d'entrée qui créent des LigneCommande (CLAUDE.md §8 : toujours recalculé côté serveur,
    jamais fait confiance au frontend).

    Pour un bon d'achat (variante.produit.type_produit=BON_ACHAT, ajouté le 2026-09-23) :
    `montant` (déjà revalidé contre bon_achat_montant_min/max par le serializer appelant) sert de
    prix_unitaire au lieu de prix_final, et aucune RegleReduction ne s'applique — un bon d'achat
    n'a pas vocation à être soldé/offert par lot.

    `membre` (demande utilisateur, mycid.org/shop — prix membre/non-membre) : le Membre pour qui
    cette ligne est facturée — celui de request.user dans `passer` (achat pour soi), ou le
    membre_cible dans `vendre_especes` (vente au comptoir pour autrui, le prix membre suit alors
    ce membre-là, jamais le staff qui saisit la vente). Résolu via Produit.prix_pour_membre — SEUL
    point qui décide entre `prix_membre` et `prix_final` (CLAUDE.md §8), jamais un indicateur
    envoyé par le client. Sans objet pour un bon d'achat (montant déjà libre, voir ci-dessus)."""
    est_bon_achat = variante.produit.type_produit == TypeProduit.BON_ACHAT
    if est_bon_achat:
        prix_unitaire = montant
        sous_total_net = (prix_unitaire * quantite).quantize(Decimal("0.01"))
        ligne_kwargs = {
            "variante": variante,
            "quantite": quantite,
            "prix_unitaire": prix_unitaire,
            "quantite_offerte": 0,
            "pourcentage_reduction_quantite": None,
            "reduction_quantite": Decimal("0.00"),
        }
        return ligne_kwargs, sous_total_net

    prix_unitaire, _est_prix_membre = variante.produit.prix_pour_membre(membre)
    reduction = calculer_reduction_quantite(variante.produit, quantite)

    quantite_payee = quantite - reduction.quantite_offerte
    sous_total_apres_cadeau = (prix_unitaire * quantite_payee).quantize(Decimal("0.01"))
    if reduction.pourcentage_applique:
        facteur = Decimal(100 - reduction.pourcentage_applique) / Decimal(100)
        sous_total_net = (sous_total_apres_cadeau * facteur).quantize(Decimal("0.01"))
    else:
        sous_total_net = sous_total_apres_cadeau

    sous_total_brut = (prix_unitaire * quantite).quantize(Decimal("0.01"))
    reduction_quantite_montant = sous_total_brut - sous_total_net

    ligne_kwargs = {
        "variante": variante,
        "quantite": quantite,
        "prix_unitaire": prix_unitaire,
        "quantite_offerte": reduction.quantite_offerte,
        "pourcentage_reduction_quantite": reduction.pourcentage_applique,
        "reduction_quantite": reduction_quantite_montant,
    }
    return ligne_kwargs, sous_total_net


def _generer_bons_achat(commande):
    """Crée les BonAchat correspondant aux lignes bon_achat d'une Commande qui vient de passer à
    CONFIRMEE (demande utilisateur du 2026-09-23, achat intégré au catalogue) — appelée depuis
    les quatre chemins qui peuvent confirmer une commande : `passer` (couverture totale
    immédiate par un bon existant), `vendre_especes`, `confirmer_paiement` manuel, et le webhook
    PSP (`webhooks._confirmer_paiement_gateway`). Chaque ligne bon_achat produit `quantite`
    BonAchat indépendants (un même montant peut donc être dupliqué en plusieurs codes distincts,
    ex. quantite=2 à 50 € = deux bons de 50 € chacun, jamais un seul bon de 100 €). Chaque bon est
    créé déjà ACTIF (voir BonAchat.activer/StatutBonAchat) et déclenche l'email/notification
    existants — jamais appelée deux fois pour la même commande (chaque appelant transitionne le
    statut sous verrou/garde d'idempotence juste avant, voir docstring de tête du fichier)."""
    lignes_bon_achat = commande.lignes.select_related("variante__produit").filter(
        variante__produit__type_produit=TypeProduit.BON_ACHAT
    )
    for ligne in lignes_bon_achat:
        for _i in range(ligne.quantite):
            bon = BonAchat(
                montant_initial=ligne.prix_unitaire,
                solde=ligne.prix_unitaire,
                achete_par=commande.membre,
                mode_paiement=commande.mode_paiement,
                paiement_confirme_par=commande.paiement_confirme_par,
                reference_paiement=commande.reference_paiement,
            )
            bon.activer()
            bon.save()
            notifier_bon_achat_actif(bon)


class CommandeViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    # apps.rbac Phase B (ajouté le 2026-09-23) : module_access_permission("boutique") est une
    # porte SUPPLÉMENTAIRE (DRF combine en ET logique) — jamais à la place de
    # CommandePermission, qui reste la source de vérité pour les 5 rôles système.
    permission_classes = [CommandePermission, module_access_permission("boutique")]
    serializer_class = CommandeSerializer
    pagination_class = BoutiqueCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = CommandeFilter

    def get_queryset(self):
        queryset = Commande.objects.select_related("membre").prefetch_related(
            "lignes", "lignes__variante", "lignes__variante__produit"
        )
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL or is_elevated_for_module(
            user, "boutique"
        ):
            return queryset
        membre = getattr(user, "membre", None)
        return queryset.filter(membre=membre) if membre else queryset.none()

    @action(detail=False, methods=["post"])
    def passer(self, request):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )

        serializer = PasserCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        lignes_demandees = data["lignes"]

        with transaction.atomic():
            # Verrouille les variantes dans un ordre stable (tri par id) : deux commandes
            # concurrentes partageant des articles sont ainsi sérialisées sans risque
            # d'interblocage croisé (FDD §3.4 "SELECT FOR UPDATE sur stock").
            variante_ids = sorted({ligne["variante"].id for ligne in lignes_demandees})
            variantes = {
                v.id: v
                for v in VarianteProduit.objects.select_for_update()
                .select_related("produit")
                .prefetch_related("produit__regles_reduction")
                .filter(id__in=variante_ids)
            }

            for ligne in lignes_demandees:
                variante = variantes[ligne["variante"].id]
                # Un bon d'achat n'a pas de stock réel — voir _construire_ligne_avec_reduction/
                # docstring de tête du module — la VarianteProduit sentinelle qui l'ancre n'est
                # jamais vérifiée ni décrémentée.
                if variante.produit.type_produit == TypeProduit.BON_ACHAT:
                    continue
                if variante.stock < ligne["quantite"]:
                    raise ValidationError(
                        {
                            "lignes": (
                                f"Stock insuffisant pour « {variante} » "
                                f"({variante.stock} disponible(s))."
                            )
                        }
                    )

            commande = Commande.objects.create(
                membre=membre,
                nom_destinataire=data["nom_destinataire"],
                adresse_livraison=data["adresse_livraison"],
                code_postal_livraison=data["code_postal_livraison"],
                ville_livraison=data["ville_livraison"],
                pays_livraison=data["pays_livraison"],
                telephone_livraison=data.get("telephone_livraison", ""),
            )

            montant_total = Decimal("0.00")
            for ligne in lignes_demandees:
                variante = variantes[ligne["variante"].id]
                quantite = ligne["quantite"]
                est_bon_achat = variante.produit.type_produit == TypeProduit.BON_ACHAT
                # prix_final (ou prix_membre si `membre` est actif) + réduction quantité (jamais
                # un total envoyé par le client) — ou, pour un bon d'achat, le montant choisi par
                # l'acheteur (déjà revalidé par PasserCommandeSerializer) — voir
                # _construire_ligne_avec_reduction/CLAUDE.md §8.
                ligne_kwargs, sous_total_net = _construire_ligne_avec_reduction(
                    variante,
                    quantite,
                    montant=ligne.get("montant") if est_bon_achat else None,
                    membre=membre,
                )
                LigneCommande.objects.create(commande=commande, **ligne_kwargs)
                if not est_bon_achat:
                    variante.stock -= quantite
                    variante.save(update_fields=["stock"])
                montant_total += sous_total_net

            commande.montant_total = montant_total

            # Bon d'achat optionnel (demande utilisateur du 2026-09-23) — verrouillé et validé
            # ici, jamais avant (CLAUDE.md §8 : un code peut être épuisé par une commande
            # concurrente entre la saisie et ce point).
            code_bon_achat = data.get("code_bon_achat", "").strip()
            if code_bon_achat:
                try:
                    bon = BonAchat.objects.select_for_update().get(code__iexact=code_bon_achat)
                except BonAchat.DoesNotExist as exc:
                    raise ValidationError(
                        {"code_bon_achat": "Code de bon d'achat invalide."}
                    ) from exc
                if not bon.utilisable:
                    raise ValidationError(
                        {
                            "code_bon_achat": (
                                "Ce bon d'achat n'est plus utilisable (expiré, épuisé ou "
                                "paiement non confirmé)."
                            )
                        }
                    )
                montant_applique = min(bon.solde, montant_total)
                bon.solde -= montant_applique
                if bon.solde <= 0:
                    bon.statut = StatutBonAchat.EPUISE
                bon.save(update_fields=["solde", "statut", "updated_at"])
                UtilisationBonAchat.objects.create(
                    bon_achat=bon, commande=commande, montant=montant_applique
                )
                commande.bon_achat = bon
                commande.montant_bon_achat = montant_applique

            update_fields = ["montant_total", "bon_achat", "montant_bon_achat"]
            # Bon d'achat couvrant intégralement la commande (demande utilisateur du
            # 2026-09-23) : confirmée immédiatement, sans étape de paiement supplémentaire —
            # même principe déclaratif que vendre_especes, mais mode_paiement=BON_ACHAT plutôt
            # qu'ESPECES pour rester traçable dans les rapports/emails.
            if commande.montant_du <= 0:
                commande.statut = StatutCommande.CONFIRMEE
                commande.mode_paiement = ModePaiementCommande.BON_ACHAT
                commande.date_paiement_confirme = timezone.now()
                update_fields += ["statut", "mode_paiement", "date_paiement_confirme"]

            commande.save(update_fields=update_fields)
            commande_confirmee_immediatement = commande.statut == StatutCommande.CONFIRMEE

        notifier_commande_confirmee(commande)
        notifier_nouvelle_commande_staff(commande)
        # Bons d'achat éventuels (demande utilisateur du 2026-09-23) — seulement si la commande
        # vient d'être confirmée dans ce même appel (couverture totale par un bon existant) ;
        # sinon ce sera confirmer_paiement/le webhook PSP qui s'en chargera à la confirmation
        # réelle du paiement (voir _generer_bons_achat, appelée après commit, jamais dans la
        # transaction, même principe que les notifications ci-dessus).
        if commande_confirmee_immediatement:
            _generer_bons_achat(commande)
        return Response(self.get_serializer(commande).data, status=201)

    @action(detail=False, methods=["post"], url_path="vendre-especes")
    def vendre_especes(self, request):
        """Vente au comptoir/vereinfachter Kassenverkauf (ajoutée le 2026-09-21, retour
        utilisateur : "Shop-Artikel soll für Artikel aus Boutique sein", formulaire "Barzahlung
        eintragen") — réservée au Directeur Financier/Admin App, même principe F-015 que
        EvenementViewSet.inscrire_especes/SouscriptionViewSet.souscrire_especes.

        Contrairement à `passer`, aucune adresse de livraison réelle n'est demandée (retrait en
        main propre — des valeurs de livraison fictives sont enregistrées ci-dessous pour
        satisfaire les champs obligatoires du modèle Commande) ; la commande est créée
        directement confirmée avec paiement en espèces, en un seul appel plutôt que
        `passer` + `confirmer_paiement`. Le stock reste décrémenté atomiquement (SELECT FOR
        UPDATE), même principe que `passer` ci-dessus (FDD §3.4)."""
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) < SAISIE_POUR_AUTRUI_MIN_LEVEL:
            raise PermissionDenied(
                "Seul le Directeur Financier ou l'Admin App peut saisir une vente en espèces "
                "pour un autre membre."
            )

        serializer = VendreEspecesCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        membre_cible = data["membre"]
        quantite = data["quantite"]

        est_bon_achat = data["variante"].produit.type_produit == TypeProduit.BON_ACHAT

        with transaction.atomic():
            # Même principe de verrouillage que `passer` ci-dessus (FDD §3.4) — sauté pour un
            # bon d'achat, qui n'a pas de stock réel (voir _construire_ligne_avec_reduction).
            variante = (
                VarianteProduit.objects.select_for_update()
                .select_related("produit")
                .get(id=data["variante"].id)
            )
            if not est_bon_achat and variante.stock < quantite:
                raise ValidationError(
                    {
                        "variante": (
                            f"Stock insuffisant pour « {variante} » "
                            f"({variante.stock} disponible(s))."
                        )
                    }
                )

            commande = Commande.objects.create(
                membre=membre_cible,
                nom_destinataire=str(membre_cible),
                adresse_livraison="Retrait en main propre (vente en espèces au comptoir)",
                code_postal_livraison="00000",
                ville_livraison="Vente au comptoir",
                pays_livraison="Allemagne",
                statut=StatutCommande.CONFIRMEE,
                mode_paiement=ModePaiementCommande.ESPECES,
                date_paiement_confirme=timezone.now(),
                paiement_confirme_par=getattr(user, "membre", None),
            )
            # prix_final (ou prix_membre si membre_cible est actif) + réduction quantité (même
            # principe que `passer` ci-dessus, CLAUDE.md §8) — ou, pour un bon d'achat, le montant
            # choisi (voir _construire_ligne_avec_reduction). Le prix membre suit toujours
            # membre_cible (le bénéficiaire de la vente), jamais `user` (qui saisit la vente).
            ligne_kwargs, sous_total_net = _construire_ligne_avec_reduction(
                variante,
                quantite,
                montant=data.get("montant") if est_bon_achat else None,
                membre=membre_cible,
            )
            LigneCommande.objects.create(commande=commande, **ligne_kwargs)
            if not est_bon_achat:
                variante.stock -= quantite
                variante.save(update_fields=["stock"])
            commande.montant_total = sous_total_net
            commande.save(update_fields=["montant_total"])

        # Vente au comptoir toujours immédiatement confirmée — voir _generer_bons_achat
        # (demande utilisateur du 2026-09-23, un Gutschein peut aussi se vendre en espèces).
        _generer_bons_achat(commande)
        return Response(self.get_serializer(commande).data, status=201)

    @action(detail=True, methods=["post"])
    def annuler(self, request, pk=None):
        commande = self.get_object()
        if commande.statut not in STATUTS_ANNULABLES:
            raise ValidationError(
                {"statut": "Cette commande ne peut plus être annulée à ce stade."}
            )
        with transaction.atomic():
            _restituer_stock(commande)
            _restituer_bon_achat(commande)
            commande.statut = StatutCommande.ANNULEE
            commande.save(update_fields=["statut"])
        # Notification (ajoutée le 2026-09-16) uniquement quand ce n'est pas le client lui-même
        # qui vient d'annuler sa propre commande — voir notifications.notifier_commande_annulee.
        proprietaire_user = getattr(commande.membre, "user", None)
        if proprietaire_user is not None and proprietaire_user.id != request.user.id:
            notifier_commande_annulee(commande)
        return Response(self.get_serializer(commande).data)

    @action(detail=True, methods=["post"], url_path="changer-statut")
    def changer_statut(self, request, pk=None):
        commande = self.get_object()
        serializer = ChangerStatutCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        nouveau_statut = serializer.validated_data["statut"]

        transitions_valides = TRANSITIONS_STATUT_COMMANDE.get(commande.statut, set())
        if nouveau_statut not in transitions_valides:
            raise ValidationError(
                {
                    "statut": (
                        f"Transition invalide : {commande.get_statut_display()} -> "
                        f"{StatutCommande(nouveau_statut).label}."
                    )
                }
            )

        with transaction.atomic():
            if nouveau_statut == StatutCommande.ANNULEE:
                _restituer_stock(commande)
                _restituer_bon_achat(commande)
            commande.statut = nouveau_statut
            commande.save(update_fields=["statut"])

        if nouveau_statut == StatutCommande.EXPEDIEE:
            notifier_commande_expediee(commande)
        elif nouveau_statut == StatutCommande.ANNULEE:
            # changer_statut est réservé à ORDER_VISIBILITY_MIN_LEVEL (Bureau Admin+, voir
            # CommandePermission) : jamais le client lui-même, contrairement à `annuler`
            # ci-dessus — toujours notifier (ajouté le 2026-09-16).
            notifier_commande_annulee(commande)

        return Response(self.get_serializer(commande).data)

    @action(detail=True, methods=["post"], url_path="initier-paiement-en-ligne")
    def initier_paiement_en_ligne(self, request, pk=None):
        """
        POST /boutique/commandes/{id}/initier-paiement-en-ligne/ (ajouté le 2026-09-17, même
        principe que Cotisation.initier_paiement_en_ligne/AHM-46) — crée une session Stripe
        Checkout ou une commande PayPal Checkout pour cette commande et renvoie son URL de
        redirection. Réservé au propriétaire de la commande (paiement en libre-service
        uniquement — CommandePermission autorise aussi le Bureau Admin+ à voir/gérer une
        commande d'autrui, mais pas à payer à sa place)."""
        commande = self.get_object()
        membre_self = getattr(request.user, "membre", None)

        if membre_self is None or commande.membre_id != membre_self.id:
            raise PermissionDenied(
                "Seul le titulaire de cette commande peut initier un paiement en ligne."
            )

        if commande.statut not in STATUTS_CONFIRMABLES_PAIEMENT:
            raise ValidationError(
                {
                    "statut": (
                        "Seule une commande en attente peut être payée en ligne "
                        f"(statut actuel : {commande.get_statut_display()})."
                    )
                }
            )

        serializer = InitierPaiementEnLigneCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        passerelle = serializer.validated_data["passerelle"]

        if commande.montant_du <= 0:
            # Ne devrait pas arriver en pratique : `passer` confirme immédiatement une commande
            # entièrement couverte par un bon d'achat (voir docstring de tête du fichier) —
            # garde défensive plutôt qu'un crash Stripe/PayPal sur un montant nul, vérifiée après
            # la validation du serializer pour ne jamais masquer une erreur de saisie (ex.
            # `passerelle` invalide) derrière ce cas limite.
            raise ValidationError(
                {
                    "statut": (
                        "Cette commande n'a rien à régler en ligne (déjà couverte par un "
                        "bon d'achat)."
                    )
                }
            )

        success_url = f"{settings.FRONTEND_URL}/boutique/commande/retour?commande={commande.id}"
        cancel_url = (
            f"{settings.FRONTEND_URL}/boutique/commande/retour?commande={commande.id}&annule=1"
        )
        try:
            if passerelle == "stripe":
                redirect_url = creer_session_stripe(
                    commande.id,
                    commande.numero_commande,
                    commande.montant_du,
                    success_url,
                    cancel_url,
                )
            else:
                redirect_url = creer_commande_paypal(
                    commande.id,
                    commande.numero_commande,
                    commande.montant_du,
                    success_url,
                    cancel_url,
                )
        except GatewayError as exc:
            # Message volontairement générique côté client (jamais de détail interne PSP) —
            # même principe que CotisationViewSet.initier_paiement_en_ligne. La commande reste
            # en_attente : le membre peut réessayer plus tard, ou payer par virement/espèces
            # (confirmé manuellement par le Directeur Financier via confirmer_paiement).
            raise ValidationError(
                {
                    "gateway": (
                        "Le paiement en ligne n'est pas disponible pour le moment. "
                        "Contactez le Directeur Financier."
                    )
                }
            ) from exc

        return Response({"redirect_url": redirect_url})

    @action(detail=True, methods=["post"], url_path="confirmer-paiement")
    def confirmer_paiement(self, request, pk=None):
        """Confirme la réception du paiement d'une commande encore en_attente
        (en_attente -> confirmee) — Directeur Financier+, voir permissions.py. Ne déclenche
        volontairement aucune notification de commande (voir docstring module) — mais génère et
        notifie les éventuels bons d'achat de la commande (voir _generer_bons_achat, demande
        utilisateur du 2026-09-23)."""
        commande = self.get_object()
        if commande.statut not in STATUTS_CONFIRMABLES_PAIEMENT:
            raise ValidationError(
                {
                    "statut": (
                        "Le paiement ne peut être confirmé que pour une commande en attente "
                        f"(statut actuel : {commande.get_statut_display()})."
                    )
                }
            )

        serializer = ConfirmerPaiementCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        membre = getattr(request.user, "membre", None)
        commande.mode_paiement = serializer.validated_data["mode_paiement"]
        commande.date_paiement_confirme = timezone.now()
        commande.paiement_confirme_par = membre
        commande.statut = StatutCommande.CONFIRMEE
        commande.save(
            update_fields=[
                "mode_paiement",
                "date_paiement_confirme",
                "paiement_confirme_par",
                "statut",
            ]
        )
        _generer_bons_achat(commande)
        return Response(self.get_serializer(commande).data)

    @action(detail=True, methods=["post"])
    def expedier(self, request, pk=None):
        """Expédie une commande (-> expediee), Directeur Financier+ — voir permissions.py.

        Flux normal : depuis confirmee/en_preparation, le paiement ayant déjà été confirmé
        via `confirmer_paiement`. `nacherfassement=True` (demande utilisateur du 2026-09-15)
        autorise en plus le saut direct depuis en_attente pour une commande gérée hors flux
        normal (vente en personne, virement reçu avant la mise en place du système, etc.) —
        dans ce cas `mode_paiement` doit être fourni et vient rétroactivement renseigner les
        champs de confirmation de paiement, pour qu'une commande expediee ait toujours un
        paiement confirmé quel que soit le chemin emprunté."""
        commande = self.get_object()
        serializer = ExpedierCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        nacherfassement = data["nacherfassement"]

        statuts_valides = (
            STATUTS_EXPEDIABLES_NACERFASSEMENT if nacherfassement else STATUTS_EXPEDIABLES_NORMAL
        )
        if commande.statut not in statuts_valides:
            raise ValidationError(
                {
                    "statut": (
                        "Cette commande ne peut pas être expédiée depuis son statut actuel "
                        f"({commande.get_statut_display()})."
                    )
                }
            )

        update_fields = ["statut", "numero_suivi", "transporteur", "date_expedition"]
        commande.statut = StatutCommande.EXPEDIEE
        commande.numero_suivi = data["numero_suivi"]
        commande.transporteur = data.get("transporteur", "")
        commande.date_expedition = data.get("date_expedition") or timezone.now()

        if nacherfassement and commande.date_paiement_confirme is None:
            membre = getattr(request.user, "membre", None)
            commande.mode_paiement = data["mode_paiement"]
            commande.date_paiement_confirme = timezone.now()
            commande.paiement_confirme_par = membre
            update_fields += [
                "mode_paiement",
                "date_paiement_confirme",
                "paiement_confirme_par",
            ]

        commande.save(update_fields=update_fields)
        notifier_commande_expediee(commande)
        return Response(self.get_serializer(commande).data)

    @action(detail=True, methods=["get"])
    def confirmation(self, request, pk=None):
        """
        GET /boutique/commandes/{id}/confirmation/ — Bestellbestätigung PDF (demande
        utilisateur du 2026-09-25, module "Shop-Verwaltung"). Disponible pour TOUTE commande
        quel que soit son statut (comme une confirmation de commande e-commerce classique,
        envoyée dès la passation) — get_object() applique le même scope IDOR que list/retrieve
        (CommandePermission.has_object_permission : propriétaire ou Bureau Admin+/élevé sur le
        module boutique).
        """
        commande = self.get_object()
        pdf_bytes = generate_confirmation_pdf(commande)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="bestellbestaetigung-{commande.numero_commande}.pdf"'
        )
        return response

    @action(detail=True, methods=["get"])
    def facture(self, request, pk=None):
        """
        GET /boutique/commandes/{id}/facture/ — Rechnung PDF (demande utilisateur du
        2026-09-25), disponible uniquement une fois le paiement confirmé
        (date_paiement_confirme renseignée, par confirmer_paiement/le webhook PSP/expedier en
        nacherfassement) — même principe que CotisationViewSet.receipt (AHM-17). get_object()
        applique le même scope IDOR que confirmation ci-dessus.
        """
        commande = self.get_object()
        if commande.date_paiement_confirme is None:
            raise ValidationError(
                "La facture n'est disponible qu'une fois le paiement de la commande confirmé "
                f"(statut actuel : {commande.get_statut_display()})."
            )
        pdf_bytes = generate_facture_pdf(commande)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="rechnung-{commande.numero_commande}.pdf"'
        )
        return response

    @action(detail=False, methods=["get"])
    def export(self, request):
        """
        GET /boutique/commandes/export/ — export Excel des commandes (demande utilisateur du
        2026-09-25, module "Shop-Verwaltung" : "Es soll möglich sein die Bestellungen als Excel
        zu exportieren"). Réutilise exactement le même scope IDOR (get_queryset) et les mêmes
        filtres (statut, membre, date_apres/date_avant, destinataire — voir CommandeFilter) que
        GET /boutique/commandes/, pour que l'export corresponde toujours à ce que l'écran de
        liste montre avec les mêmes filtres — même principe que
        apps.membres.export_views.MembreExportView. Non paginé (self.filter_queryset, pas
        self.paginate_queryset) : l'export contient toute la sélection filtrée, pas une seule
        page du cursor.
        """
        queryset = self.filter_queryset(self.get_queryset())
        classeur = construire_classeur_commandes(queryset)
        nom_fichier = f"export_commandes_{timezone.localtime():%Y%m%d_%H%M}.xlsx"
        return xlsx_response(classeur, nom_fichier)


class RetourViewSet(ModelViewSet):
    """Retours partiels par ligne de commande — voir models.Retour et permissions.py.

    Pas d'update/destroy : un retour enregistré est définitif (registre append-only, même
    convention que Commande). La réintégration de stock est atomique, verrouillée dans le
    même ordre (tri par id de variante) que `passer`/`_restituer_stock` pour éviter tout
    interblocage avec une commande passée ou annulée concurremment."""

    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [RetourPermission]
    serializer_class = RetourSerializer
    pagination_class = BoutiqueCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = RetourFilter

    def get_queryset(self):
        return Retour.objects.select_related(
            "commande", "ligne_commande", "ligne_commande__variante", "enregistre_par"
        ).all()

    def perform_create(self, serializer):
        ligne_commande = serializer.validated_data["ligne_commande"]
        quantite = serializer.validated_data["quantite"]

        with transaction.atomic():
            # Reverrouille la ligne/variante et revalide la quantité retournable sous
            # verrou — le contrôle déjà fait dans RetourSerializer.validate() ne protège pas
            # contre deux retours concurrents sur la même ligne (même principe que
            # CommandeViewSet.passer, voir docstring module).
            variante = VarianteProduit.objects.select_for_update().get(
                id=ligne_commande.variante_id
            )
            ligne = LigneCommande.objects.select_for_update().get(id=ligne_commande.id)
            if quantite > ligne.quantite_retournable:
                raise ValidationError(
                    {
                        "quantite": (
                            "Quantité supérieure à ce qui reste retournable pour cette ligne "
                            f"({ligne.quantite_retournable})."
                        )
                    }
                )
            variante.stock += quantite
            variante.save(update_fields=["stock"])
            serializer.save(enregistre_par=getattr(self.request.user, "membre", None))


class BonAchatViewSet(ModelViewSet):
    """Bons d'achat/Gutscheine — voir docstring de tête du fichier et de models.py. Depuis le
    2026-09-23 (achat intégré au catalogue), ce ViewSet est PUREMENT EN LECTURE côté API
    publique : un BonAchat n'est plus jamais créé/confirmé ici, mais généré automatiquement par
    `_generer_bons_achat` quand la Commande qui le contient est confirmée (voir
    CommandeViewSet.passer/vendre_especes/confirmer_paiement et
    apps.boutique.webhooks._confirmer_paiement_gateway). Seule `verifier` reste une action
    dédiée (aperçu d'un code au checkout, sans lien avec la création)."""

    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [BonAchatPermission]
    serializer_class = BonAchatSerializer
    pagination_class = BoutiqueCursorPagination
    filterset_fields = {"statut": ["exact"]}

    def get_queryset(self):
        queryset = BonAchat.objects.select_related("achete_par").all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL:
            return queryset
        membre = getattr(user, "membre", None)
        return queryset.filter(achete_par=membre) if membre else queryset.none()

    @action(detail=False, methods=["post"])
    def verifier(self, request):
        """POST /boutique/bons-achat/verifier/ — vérifie un code sans le consommer (aperçu au
        checkout, voir PanierCommandePage frontend). Ouvert à tout authentifié : le détenteur
        d'un code n'est pas forcément son acheteur (bon d'achat transmissible)."""
        serializer = VerifierBonAchatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["code"].strip()
        try:
            bon = BonAchat.objects.get(code__iexact=code)
        except BonAchat.DoesNotExist as exc:
            raise NotFound({"code": "Code de bon d'achat invalide."}) from exc
        return Response(BonAchatVerificationSerializer(bon).data)
