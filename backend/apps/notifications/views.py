"""
Vues API — app notifications :
  GET  /notifications/                      — mes notifications (IDOR : jamais celles d'un
                                                autre utilisateur), filtrables par
                                                ?lu=/?type_notification=
  POST /notifications/{id}/marquer-lue/     — marque une notification comme lue
  POST /notifications/tout-marquer-lu/      — marque toutes mes notifications non lues comme lues
  POST /notifications/marquer-lues-prefixe/ — marque comme lues mes notifications non lues dont
                                                `lien` commence par ?prefixe= (demande utilisateur
                                                du 2026-09-16 : le point d'activité de la sidebar
                                                doit disparaître — et donc faire baisser le badge
                                                de la cloche avec lui, un seul état de lecture,
                                                voir Sidebar.tsx/useMarquerLuesPrefixe côté
                                                frontend — dès que le membre ouvre le module
                                                concerné)
  GET  /notifications/non-lues-count/       — compteur pour le badge de la cloche (layout React)

Pas de create/update/destroy exposés : une notification n'est jamais créée ni modifiée par un
appel client (voir serializers.py) — seul `services.notifier` en crée, depuis les autres apps.
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from .filters import NotificationFilter
from .models import Notification, ParametresNotification
from .permissions import NotificationPermission, ParametresNotificationPermission
from .serializers import NotificationSerializer, ParametresNotificationSerializer


class NotificationsCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class NotificationViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [NotificationPermission]
    serializer_class = NotificationSerializer
    pagination_class = NotificationsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = NotificationFilter

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Notification.objects.none()
        return Notification.objects.filter(destinataire=user)

    @action(detail=True, methods=["post"], url_path="marquer-lue")
    def marquer_lue(self, request, pk=None):
        notification = self.get_object()
        if not notification.lu:
            notification.lu = True
            notification.save(update_fields=["lu"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="tout-marquer-lu")
    def tout_marquer_lu(self, request):
        nombre = self.get_queryset().filter(lu=False).update(lu=True)
        return Response({"marquees": nombre})

    @action(detail=False, methods=["post"], url_path="marquer-lues-prefixe")
    def marquer_lues_prefixe(self, request):
        prefixe = (request.data.get("prefixe") or "").strip()
        if not prefixe:
            return Response({"marquees": 0})
        nombre = self.get_queryset().filter(lu=False, lien__startswith=prefixe).update(lu=True)
        return Response({"marquees": nombre})

    @action(detail=False, methods=["get"], url_path="non-lues-count")
    def non_lues_count(self, request):
        return Response({"count": self.get_queryset().filter(lu=False).count()})


class ParametresNotificationView(APIView):
    """
    GET/PATCH /notifications/parametres/ — activation/désactivation des emails de notification
    par module, réservée à l'Administrateur App (ajouté le 2026-09-19, voir models.
    ParametresNotification et permissions.ParametresNotificationPermission). Singleton
    (ParametresNotification.get_solo) : pas de ModelViewSet, un simple GET/PATCH suffit, même
    principe qu'un futur endpoint de configuration globale plutôt qu'une collection.
    """

    permission_classes = [ParametresNotificationPermission]

    def get(self, request):
        parametres = ParametresNotification.get_solo()
        return Response(ParametresNotificationSerializer(parametres).data)

    def patch(self, request):
        parametres = ParametresNotification.get_solo()
        serializer = ParametresNotificationSerializer(parametres, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(modifie_par=getattr(request.user, "membre", None))
        return Response(serializer.data)
