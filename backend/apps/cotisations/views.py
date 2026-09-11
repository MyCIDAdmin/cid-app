"""
Vues API — app cotisations (TDD §2.4) :
  GET   /cotisations/           — liste (scope selon rôle, RH+ voit tout)
  POST  /cotisations/           — enregistrer un paiement (libre-service, ou pour autrui si DG+)
  GET   /cotisations/{id}/      — détail (scope selon rôle)
  GET   /cotisations/{id}/receipt/       — reçu PDF (AHM-17, RICEFW R-010/W-002)
  POST  /cotisations/{id}/marquer-payee/ — confirmer manuellement un paiement reçu hors ligne
                                            (AHM-53, DF/Admin uniquement)

Pas de PUT/PATCH/DELETE : registre financier append-only (voir models.py) — seule exception
volontaire, l'action `marquer_payee` ci-dessous, réservée au Directeur Financier/Admin.

Règle AHM-53 (retour utilisateur : recevoir une quittance immédiate pour un virement SEPA non
encore réglé est trompeur) : `perform_create` impose toujours statut=en_attente pour un paiement
en libre-service (le membre paie pour lui-même), quel que soit le mode de paiement choisi et quel
que soit le statut transmis par le client — il n'existe pas de passerelle de paiement réelle
(AHM-46) capable de le vérifier. Seule la saisie pour le compte d'un AUTRE membre par le
Directeur Financier/Admin (F-015, staff qui constate une transaction déjà reçue) conserve le
statut transmis par le client.
"""

from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import CotisationFilter
from .models import Cotisation, ModePaiement, StatutCotisation
from .pdf import generate_receipt_pdf
from .permissions import READ_ALL_MIN_LEVEL, SAISIE_POUR_AUTRUI_MIN_LEVEL, CotisationPermission
from .serializers import CotisationSerializer

# Statuts depuis lesquels une confirmation manuelle de paiement (marquer_payee) est autorisée.
# "payee" (déjà fait), "remboursee" et "annulee" sont des statuts terminaux qu'on ne réécrit pas.
STATUTS_CONFIRMABLES_EN_PAYEE = {StatutCotisation.EN_ATTENTE, StatutCotisation.ECHOUEE}


class CotisationCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class CotisationViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [CotisationPermission]
    serializer_class = CotisationSerializer
    pagination_class = CotisationCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = CotisationFilter

    def get_queryset(self):
        queryset = Cotisation.objects.select_related("membre", "saisie_par").all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_MIN_LEVEL:
            return queryset
        # Protection IDOR (SCD §2.3 A01) : sous RH, uniquement les cotisations de sa propre
        # fiche membre (si elle existe et est liée à son compte).
        membre = getattr(user, "membre", None)
        return queryset.filter(membre=membre) if membre else queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        membre_self = getattr(user, "membre", None)
        membre_cible = serializer.validated_data.get("membre")

        if membre_cible and membre_cible != membre_self:
            if ROLE_LEVELS.get(user.role, 0) < SAISIE_POUR_AUTRUI_MIN_LEVEL:
                raise PermissionDenied(
                    "Seuls le Directeur Financier ou l'Administrateur peuvent enregistrer une "
                    "transaction pour le compte d'un autre membre."
                )
            serializer.save(membre=membre_cible, saisie_par=membre_self)
            return

        if membre_self is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )
        # AHM-53 : jamais fait confiance au statut transmis par le client en libre-service — voir
        # docstring de ce module. Le paiement reste en_attente jusqu'à confirmation manuelle
        # (marquer_payee ci-dessous) ; aucune référence de transaction/reçu tant qu'il ne l'est pas.
        serializer.save(membre=membre_self, saisie_par=None, statut=StatutCotisation.EN_ATTENTE)

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """
        GET /cotisations/{id}/receipt/ — reçu PDF (AHM-17). get_object() applique le même
        scope IDOR que list/retrieve (CotisationPermission.has_object_permission) : propriétaire
        ou RH+ uniquement.
        """
        cotisation = self.get_object()
        if cotisation.statut != StatutCotisation.PAYEE:
            raise ValidationError(
                "Le reçu n'est disponible que pour une cotisation payée "
                f"(statut actuel : {cotisation.get_statut_display()})."
            )

        pdf_bytes = generate_receipt_pdf(cotisation)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="recu-{cotisation.reference_transaction}.pdf"'
        )
        return response

    @action(detail=True, methods=["post"], url_path="marquer-payee")
    def marquer_payee(self, request, pk=None):
        """
        POST /cotisations/{id}/marquer-payee/ — confirme la réception d'un paiement effectué hors
        ligne (virement SEPA en attente de réconciliation, chèque, espèces...), AHM-53. get_object()
        applique le même scope IDOR que list/retrieve (propriétaire ou RH+), mais l'exécution de
        l'action elle-même est réservée au Directeur Financier et à l'Administrateur App
        (SAISIE_POUR_AUTRUI_MIN_LEVEL) : le RH garde un accès en lecture seule sur ce module.
        """
        cotisation = self.get_object()

        if ROLE_LEVELS.get(request.user.role, 0) < SAISIE_POUR_AUTRUI_MIN_LEVEL:
            raise PermissionDenied(
                "Seuls le Directeur Financier ou l'Administrateur peuvent marquer un paiement "
                "comme reçu."
            )

        if cotisation.statut not in STATUTS_CONFIRMABLES_EN_PAYEE:
            raise ValidationError(
                "Seule une cotisation en attente ou échouée peut être marquée comme payée "
                f"(statut actuel : {cotisation.get_statut_display()})."
            )

        mode_paiement = request.data.get("mode_paiement", "")
        if mode_paiement:
            if mode_paiement not in ModePaiement.values:
                raise ValidationError({"mode_paiement": "Mode de paiement invalide."})
            cotisation.mode_paiement = mode_paiement
        elif not cotisation.mode_paiement:
            raise ValidationError(
                {
                    "mode_paiement": (
                        "Le mode de paiement doit être précisé pour confirmer ce paiement."
                    )
                }
            )

        cotisation.statut = StatutCotisation.PAYEE
        # save() (voir models.py) génère la référence de transaction et la date de paiement
        # puisque le statut passe à "payee" sans référence existante.
        cotisation.save()

        return Response(CotisationSerializer(cotisation).data)
