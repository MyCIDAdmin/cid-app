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
  GET/POST   /boutique/retours/                  — retours partiels par ligne de
                                                    commande (Bureau Admin+), réintègre le
                                                    stock atomiquement
  GET/POST   /boutique/regles-reduction/         — paliers de réduction par quantité (lecture:
                                                    tous — inactifs/produit non publié réservés
                                                    Bureau Admin+ ; écriture: Bureau Admin+ —
                                                    ajouté le 2026-09-23)
  POST       /boutique/bons-achat/acheter/       — acheter un bon d'achat (montant libre,
                                                    ajouté le 2026-09-23, voir models.BonAchat)
  POST       /boutique/bons-achat/{id}/initier-paiement-en-ligne/ — idem Commande, propriétaire
                                                    uniquement
  POST       /boutique/bons-achat/{id}/confirmer-paiement/ — paiement manuel (virement/
                                                    espèces), Directeur Financier+
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
ont un). Un BonAchat activé (webhook PSP ou confirmer_paiement manuel) déclenche lui aussi un
email + une notification in-app — voir notifications.notifier_bon_achat_actif.

Offres personnalisées et bons d'achat (demande utilisateur du 2026-09-23, voir docstring de
tête de models.py) : `passer`/`vendre_especes` appliquent désormais automatiquement les
RegleReduction actives du produit de chaque ligne (calculer_reduction_quantite), et `passer`
accepte en plus un `code_bon_achat` optionnel déduit du total — toujours recalculé/validé côté
serveur sous verrou (CLAUDE.md §8), jamais fait confiance à un montant envoyé par le client.
"""

from decimal import Decimal

from django.conf import settings
from django.db import transaction
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

from .filters import CommandeFilter, ProduitFilter, RetourFilter
from .models import (
    STATUTS_ANNULABLES,
    STATUTS_BON_ACHAT_CONFIRMABLES,
    STATUTS_CONFIRMABLES_PAIEMENT,
    STATUTS_EXPEDIABLES_NACERFASSEMENT,
    STATUTS_EXPEDIABLES_NORMAL,
    TRANSITIONS_STATUT_COMMANDE,
    BonAchat,
    Commande,
    LigneCommande,
    ModePaiementCommande,
    Produit,
    RegleReduction,
    Retour,
    StatutBonAchat,
    StatutCommande,
    StatutProduit,
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
from .permissions import (
    GESTION_CATALOGUE_MIN_LEVEL,
    ORDER_VISIBILITY_MIN_LEVEL,
    PAIEMENT_EXPEDITION_MIN_LEVEL,
    BonAchatPermission,
    CatalogueBoutiquePermission,
    CommandePermission,
    RetourPermission,
)
from .serializers import (
    AcheterBonAchatSerializer,
    BonAchatSerializer,
    BonAchatVerificationSerializer,
    ChangerStatutCommandeSerializer,
    CommandeSerializer,
    ConfirmerPaiementCommandeSerializer,
    ExpedierCommandeSerializer,
    InitierPaiementEnLigneCommandeSerializer,
    PasserCommandeSerializer,
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
    variantes concernées, triées par id pour éviter tout interblocage avec `passer`."""
    lignes = list(
        LigneCommande.objects.filter(commande=commande)
        .select_related("variante")
        .order_by("variante_id")
    )
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


def _construire_ligne_avec_reduction(variante, quantite):
    """Calcule la ligne (kwargs prêts pour LigneCommande.objects.create) et le sous-total NET
    d'un article, réduction quantité comprise (demande utilisateur du 2026-09-23) — partagé par
    `passer` et `vendre_especes` pour ne jamais dupliquer cette logique entre les deux points
    d'entrée qui créent des LigneCommande (CLAUDE.md §8 : toujours recalculé côté serveur,
    jamais fait confiance au frontend)."""
    prix_unitaire = variante.produit.prix_final
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


class CommandeViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [CommandePermission]
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
        if ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL:
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
                # prix_final + réduction quantité (jamais un total envoyé par le client) —
                # voir _construire_ligne_avec_reduction/CLAUDE.md §8.
                ligne_kwargs, sous_total_net = _construire_ligne_avec_reduction(variante, quantite)
                LigneCommande.objects.create(commande=commande, **ligne_kwargs)
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
                    raise ValidationError({"code_bon_achat": "Code de bon d'achat invalide."}) from exc
                if not bon.utilisable:
                    raise ValidationError(
                        {"code_bon_achat": "Ce bon d'achat n'est plus utilisable (expiré, épuisé ou paiement non confirmé)."}
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

        notifier_commande_confirmee(commande)
        notifier_nouvelle_commande_staff(commande)
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

        with transaction.atomic():
            # Même principe de verrouillage que `passer` ci-dessus (FDD §3.4).
            variante = (
                VarianteProduit.objects.select_for_update()
                .select_related("produit")
                .get(id=data["variante"].id)
            )
            if variante.stock < quantite:
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
            # prix_final + réduction quantité (même principe que `passer` ci-dessus, CLAUDE.md §8) —
            # voir _construire_ligne_avec_reduction.
            ligne_kwargs, sous_total_net = _construire_ligne_avec_reduction(variante, quantite)
            LigneCommande.objects.create(commande=commande, **ligne_kwargs)
            variante.stock -= quantite
            variante.save(update_fields=["stock"])
            commande.montant_total = sous_total_net
            commande.save(update_fields=["montant_total"])

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
                {"statut": "Cette commande n'a rien à régler en ligne (déjà couverte par un bon d'achat)."}
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
        volontairement aucune notification (voir docstring module)."""
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
    """Bons d'achat/Gutscheine (demande utilisateur du 2026-09-23) — voir docstring de tête du
    fichier et de models.py. Pas d'update/destroy génériques : un bon n'évolue que via ses
    actions dédiées (registre append-only, même convention que Commande)."""

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
    def acheter(self, request):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )
        serializer = AcheterBonAchatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        montant = serializer.validated_data["montant"]

        bon = BonAchat.objects.create(montant_initial=montant, solde=montant, achete_par=membre)
        return Response(self.get_serializer(bon).data, status=201)

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

    @action(detail=True, methods=["post"], url_path="initier-paiement-en-ligne")
    def initier_paiement_en_ligne(self, request, pk=None):
        """Même principe exact que CommandeViewSet.initier_paiement_en_ligne — réservé au
        propriétaire du bon (même si BonAchatPermission.has_object_permission autorise aussi le
        Bureau Admin+ à consulter/gérer le bon d'un autre, ce n'est jamais lui qui paie à sa
        place, voir CommandePermission)."""
        bon = self.get_object()
        membre_self = getattr(request.user, "membre", None)

        if membre_self is None or bon.achete_par_id != membre_self.id:
            raise PermissionDenied(
                "Seul l'acheteur de ce bon peut initier son paiement en ligne."
            )
        if bon.statut not in STATUTS_BON_ACHAT_CONFIRMABLES:
            raise ValidationError(
                {
                    "statut": (
                        "Seul un bon d'achat en attente peut être payé en ligne "
                        f"(statut actuel : {bon.get_statut_display()})."
                    )
                }
            )

        serializer = InitierPaiementEnLigneCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        passerelle = serializer.validated_data["passerelle"]

        success_url = f"{settings.FRONTEND_URL}/boutique/bon-achat/retour?bon={bon.id}"
        cancel_url = f"{settings.FRONTEND_URL}/boutique/bon-achat/retour?bon={bon.id}&annule=1"
        # Préfixe "BON-" (voir apps.boutique.webhooks._resoudre_reference) : distingue sans
        # ambiguïté une référence de BonAchat de celle d'une Commande côté webhook PSP, les deux
        # partageant le même compte marchand Stripe/PayPal.
        reference = f"BON-{bon.id}"
        libelle = f"Bon d'achat Clubistes in Deutschland — {bon.montant_initial} €"
        try:
            if passerelle == "stripe":
                redirect_url = creer_session_stripe(
                    reference, libelle, bon.montant_initial, success_url, cancel_url
                )
            else:
                redirect_url = creer_commande_paypal(
                    reference, libelle, bon.montant_initial, success_url, cancel_url
                )
        except GatewayError as exc:
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
        """Confirme la réception d'un paiement manuel (virement/espèces) d'un bon encore
        EN_ATTENTE — Directeur Financier+ (voir BonAchatPermission), même principe que
        CommandeViewSet.confirmer_paiement. Un paiement en ligne passe par le webhook PSP, pas
        par cette action (voir apps.boutique.webhooks)."""
        bon = self.get_object()
        if bon.statut not in STATUTS_BON_ACHAT_CONFIRMABLES:
            raise ValidationError(
                {
                    "statut": (
                        "Le paiement ne peut être confirmé que pour un bon en attente "
                        f"(statut actuel : {bon.get_statut_display()})."
                    )
                }
            )
        serializer = ConfirmerPaiementCommandeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        membre = getattr(request.user, "membre", None)
        bon.mode_paiement = serializer.validated_data["mode_paiement"]
        bon.paiement_confirme_par = membre
        bon.activer()
        bon.save(
            update_fields=[
                "mode_paiement",
                "paiement_confirme_par",
                "statut",
                "date_paiement_confirme",
                "date_expiration",
            ]
        )
        notifier_bon_achat_actif(bon)
        return Response(self.get_serializer(bon).data)
