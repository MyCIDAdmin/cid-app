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
  POST       /boutique/commandes/{id}/confirmer-paiement/ — confirme la réception d'un
                                                    paiement (en_attente -> confirmee),
                                                    Directeur Financier+ (demande
                                                    utilisateur du 2026-09-15)
  POST       /boutique/commandes/{id}/expedier/  — expédie avec numéro de suivi
                                                    (-> expediee), Directeur Financier+ ;
                                                    `nacherfassement=true` saute
                                                    directement à expediee pour une
                                                    commande gérée hors flux normal
  GET/POST   /boutique/retours/                  — retours partiels par ligne de
                                                    commande (Bureau Admin+), réintègre le
                                                    stock atomiquement

Pas de create/update/destroy génériques exposés sur Commande : une fois créée (via
`passer`), elle n'évolue que par ses actions dédiées — registre append-only, même
convention que Cotisation/Souscription.

Notifications (Phase 2B, voir notifications.py) : `passer` et `expedier` déclenchent chacun un
email + une notification in-app — voir
apps.notifications.models.TypeNotification.BOUTIQUE_COMMANDE_CONFIRMEE/EXPEDIEE.
`confirmer_paiement` et la création d'un Retour ne déclenchent volontairement pas d'email
(hors du périmètre demandé le 2026-09-15 — seules la confirmation de commande et l'expédition en
ont un).
"""

from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import CommandeFilter, ProduitFilter, RetourFilter
from .models import (
    STATUTS_ANNULABLES,
    STATUTS_CONFIRMABLES_PAIEMENT,
    STATUTS_EXPEDIABLES_NACERFASSEMENT,
    STATUTS_EXPEDIABLES_NORMAL,
    TRANSITIONS_STATUT_COMMANDE,
    Commande,
    LigneCommande,
    Produit,
    Retour,
    StatutCommande,
    StatutProduit,
    VarianteProduit,
)
from .notifications import (
    notifier_commande_annulee,
    notifier_commande_confirmee,
    notifier_commande_expediee,
    notifier_nouvelle_commande_staff,
)
from .permissions import (
    GESTION_CATALOGUE_MIN_LEVEL,
    ORDER_VISIBILITY_MIN_LEVEL,
    PAIEMENT_EXPEDITION_MIN_LEVEL,
    CatalogueBoutiquePermission,
    CommandePermission,
    RetourPermission,
)
from .serializers import (
    ChangerStatutCommandeSerializer,
    CommandeSerializer,
    ConfirmerPaiementCommandeSerializer,
    ExpedierCommandeSerializer,
    PasserCommandeSerializer,
    ProduitSerializer,
    RetourSerializer,
    VarianteProduitSerializer,
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
                # prix_final (jamais prix seul) : applique un éventuel rabais actif au
                # moment de la commande, gelé sur la ligne (CLAUDE.md §8).
                prix_unitaire = variante.produit.prix_final
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
        notifier_nouvelle_commande_staff(commande)
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
