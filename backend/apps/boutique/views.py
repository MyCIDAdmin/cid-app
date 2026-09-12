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
                                                    voir models.TRANSITIONS_STATUT_COMMANDE)

Pas de create/update/destroy génériques exposés sur Commande : une fois créée (via
`passer`), elle n'évolue que par ses actions dédiées — registre append-only, même
convention que Cotisation/Souscription.

Notifications (Phase 2B, voir notifications.py) : `passer` et `changer_statut` (transition vers
`expediee`) déclenchent chacun un email + une notification in-app — voir
apps.notifications.models.TypeNotification.BOUTIQUE_COMMANDE_CONFIRMEE/EXPEDIEE.
"""

from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import CommandeFilter, ProduitFilter
from .models import (
    STATUTS_ANNULABLES,
    TRANSITIONS_STATUT_COMMANDE,
    Commande,
    LigneCommande,
    Produit,
    StatutCommande,
    StatutProduit,
    VarianteProduit,
)
from .notifications import notifier_commande_confirmee, notifier_commande_expediee
from .permissions import (
    GESTION_CATALOGUE_MIN_LEVEL,
    ORDER_VISIBILITY_MIN_LEVEL,
    CatalogueBoutiquePermission,
    CommandePermission,
)
from .serializers import (
    ChangerStatutCommandeSerializer,
    CommandeSerializer,
    PasserCommandeSerializer,
    ProduitSerializer,
    VarianteProduitSerializer,
)


class BoutiqueCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class ProduitViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CatalogueBoutiquePermission]
    serializer_class = ProduitSerializer
    pagination_class = BoutiqueCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = ProduitFilter

    def get_queryset(self):
        queryset = Produit.objects.prefetch_related("variantes").all()
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_CATALOGUE_MIN_LEVEL
        ):
            return queryset
        return queryset.filter(statut=StatutProduit.PUBLIE)


class VarianteProduitViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CatalogueBoutiquePermission]
    serializer_class = VarianteProduitSerializer
    pagination_class = BoutiqueCursorPagination
    filterset_fields = ["produit"]

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

            montant_total = 0
            for ligne in lignes_demandees:
                variante = variantes[ligne["variante"].id]
                quantite = ligne["quantite"]
                prix_unitaire = variante.produit.prix
                LigneCommande.objects.create(
                    commande=commande,
                    variante=variante,
                    quantite=quantite,
                    prix_unitaire=prix_unitaire,
                )
                variante.stock -= quantite
                variante.save(update_fields=["stock"])
                montant_total += prix_unitaire * quantite

            commande.montant_total = montant_total
            commande.save(update_fields=["montant_total"])

        notifier_commande_confirmee(commande)
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
            commande.statut = StatutCommande.ANNULEE
            commande.save(update_fields=["statut"])
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
            commande.statut = nouveau_statut
            commande.save(update_fields=["statut"])

        if nouveau_statut == StatutCommande.EXPEDIEE:
            notifier_commande_expediee(commande)

        return Response(self.get_serializer(commande).data)
