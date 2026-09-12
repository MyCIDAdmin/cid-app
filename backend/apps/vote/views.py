"""
Vues API — app vote (SCD §4.2, FDD F-008, RICEFW W-006) :

  GET/POST  /votes/                — liste / création (POST = lancement immédiat, Admin
                                      App + Bureau Admin uniquement — voir permissions.py)
  GET       /votes/{id}/           — détail (tout authentifié)
  POST      /votes/{id}/cloturer/  — clôture manuelle anticipée (Admin App + Bureau Admin)
  GET       /votes/{id}/resultats/ — résultats agrégés, uniquement si statut=cloturee

La soumission du bulletin de vote lui-même NE PASSE PAS par cette API REST — elle se fait
exclusivement via le WebSocket (apps.vote.consumers.VoteConsumer, SDD §2.3), afin que la
diffusion en direct du compteur de participation et la vérification anti-doublon partagent
un seul et même point d'entrée. Voir consumers.py."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .filters import VoteSessionFilter
from .models import StatutSession, VoteOption, VoteSession
from .permissions import VoteSessionPermission
from .security import generer_anonymat_sel
from .serializers import VoteSessionCreateSerializer, VoteSessionSerializer
from .services import calculer_resultats
from .tasks import envoyer_notification_ouverture, envoyer_notification_resultats


class VoteSessionPagination(PageNumberPagination):
    page_size = 20


class VoteSessionViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [VoteSessionPermission]
    pagination_class = VoteSessionPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = VoteSessionFilter
    queryset = VoteSession.objects.prefetch_related("options").select_related("created_by")

    def get_serializer_class(self):
        if self.action == "create":
            return VoteSessionCreateSerializer
        return VoteSessionSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = self._creer_session(serializer.validated_data, request.user)
        envoyer_notification_ouverture.delay(str(session.id))
        return Response(VoteSessionSerializer(session).data, status=201)

    @transaction.atomic
    def _creer_session(self, validated_data, user):
        options_data = validated_data.pop("options")
        membres_selectionnes = validated_data.pop("membres_selectionnes", [])
        duree_minutes = validated_data["duree_minutes"]
        maintenant = timezone.now()

        session = VoteSession.objects.create(
            **validated_data,
            created_by=user,
            anonymat_sel=generer_anonymat_sel(),
            statut=StatutSession.OUVERTE,
            date_fin=maintenant + timedelta(minutes=duree_minutes),
        )
        if membres_selectionnes:
            session.membres_selectionnes.set(membres_selectionnes)
        VoteOption.objects.bulk_create(
            [VoteOption(session=session, ordre=i, **opt) for i, opt in enumerate(options_data)]
        )
        return session

    @action(detail=True, methods=["post"])
    def cloturer(self, request, pk=None):
        session = self.get_object()
        if session.statut != StatutSession.OUVERTE:
            raise ValidationError({"statut": "Cette session est déjà clôturée."})
        session.statut = StatutSession.CLOTUREE
        session.date_cloture = timezone.now()
        session.save(update_fields=["statut", "date_cloture"])
        envoyer_notification_resultats.delay(str(session.id))
        self._broadcast_resultats(session)
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["get"])
    def resultats(self, request, pk=None):
        session = self.get_object()
        if not session.resultats_visibles:
            raise PermissionDenied(
                "Les résultats ne sont visibles qu'après la clôture de la session (SCD §7.5)."
            )
        return Response(calculer_resultats(session))

    @staticmethod
    def _broadcast_resultats(session):
        """Diffuse la disponibilité des résultats au groupe WebSocket de la session — même
        mécanisme que la clôture automatique Celery Beat (voir tasks.clore_sessions_expirees),
        factorisé ici pour ne pas dupliquer la logique de group_send entre les deux points
        d'entrée (clôture manuelle vs automatique)."""
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f"vote_{session.id}",
            {"type": "resultats_disponibles", "payload": calculer_resultats(session)},
        )
