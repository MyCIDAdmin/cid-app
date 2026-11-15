"""Kategorien und Angebote zu „Hilfe gesucht“ (Nov. 2026).

GET               /projets/hilfe-kategorien/              aktive Kategorien (auch anonym lesbar) ;
                                                          ?alle=1 mit deaktivierten (nur Büro)
POST/PATCH/DELETE /projets/hilfe-kategorien/{id}/         nur Recht „Meldungen genehmigen“
GET/POST          /projets/hilfe-angebote/                Mitglied: eigene Angebote anlegen/sehen ;
                                                          Büro (Recht „Meldungen genehmigen“): alle
POST              /projets/hilfe-angebote/{id}/zurueckziehen/   eigenes offenes Angebot
POST              /projets/hilfe-angebote/{id}/annehmen/        Büro, optional mit {"stelle": id}
POST              /projets/hilfe-angebote/{id}/ablehnen/        Büro
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.mixins import CreateModelMixin, ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ModelViewSet

from apps.membres.models import StatutMembre

from .hilfe import darf_genehmigen
from .models import (
    HilfeAngebot,
    HilfeKategorie,
    ProjetBewerbung,
    ProjetStelle,
    StatutAngebot,
    StatutBewerbung,
    StatutStelle,
)
from .notifications import notifier_angebot_entschieden, notifier_angebot_neu
from .serializers import HilfeAngebotSerializer, HilfeKategorieSerializer


class KategorieRechte(BasePermission):
    """Lesen für alle (Filter der öffentlichen Seite), Pflegen nur mit „Meldungen genehmigen“."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return darf_genehmigen(request.user)


class HilfeKategorieViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [KategorieRechte]
    serializer_class = HilfeKategorieSerializer
    pagination_class = None

    def get_queryset(self):
        queryset = HilfeKategorie.objects.all()
        alle = self.request.query_params.get("alle") in ("1", "true") or self.action != "list"
        if alle and darf_genehmigen(self.request.user):
            return queryset
        return queryset.filter(aktiv=True)


class AngebotViewSet(CreateModelMixin, ListModelMixin, RetrieveModelMixin, GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = HilfeAngebotSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["status", "kategorie"]

    def get_queryset(self):
        queryset = HilfeAngebot.objects.select_related(
            "membre", "kategorie", "stelle", "entschieden_von"
        )
        if darf_genehmigen(self.request.user):
            return queryset
        membre = getattr(self.request.user, "membre", None)
        return queryset.filter(membre=membre) if membre is not None else queryset.none()

    def perform_create(self, serializer):
        membre = getattr(self.request.user, "membre", None)
        if membre is None or membre.statut != StatutMembre.ACTIF:
            raise PermissionDenied("Nur aktive Mitglieder können Hilfe anbieten.")
        angebot = serializer.save(membre=membre)
        notifier_angebot_neu(angebot)

    @action(detail=True, methods=["post"])
    def zurueckziehen(self, request, pk=None):
        angebot = self.get_object()
        membre = getattr(request.user, "membre", None)
        if membre is None or angebot.membre_id != membre.id:
            raise PermissionDenied("Nur das eigene Angebot kann zurückgezogen werden.")
        if angebot.status != StatutAngebot.OFFEN:
            raise ValidationError({"detail": "Dieses Angebot wurde bereits bearbeitet."})
        angebot.status = StatutAngebot.ZURUECKGEZOGEN
        angebot.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(angebot).data)

    def _entscheiden(self, request, ziel):
        if not darf_genehmigen(request.user):
            raise PermissionDenied(
                "Nur Personen mit dem Recht „Meldungen genehmigen“ entscheiden über Angebote."
            )
        notiz = str(request.data.get("notiz", ""))[:300].strip()
        stelle_id = request.data.get("stelle") if ziel == StatutAngebot.ANGENOMMEN else None
        with transaction.atomic():
            angebot = HilfeAngebot.objects.select_for_update().get(pk=self.get_object().pk)
            if angebot.status != StatutAngebot.OFFEN:
                raise ValidationError({"detail": "Dieses Angebot wurde bereits bearbeitet."})
            if stelle_id:
                self._zuordnen(angebot, stelle_id)
            angebot.status = ziel
            angebot.notiz = notiz
            angebot.entschieden_von = getattr(request.user, "membre", None)
            angebot.save()
        notifier_angebot_entschieden(angebot)
        return Response(self.get_serializer(angebot).data)

    @staticmethod
    def _zuordnen(angebot, stelle_id) -> None:
        """Das Angebot wird als angenommene Meldung auf ein offenes freies Gesuch gebucht."""
        try:
            stelle = ProjetStelle.objects.select_for_update().get(pk=stelle_id, projet__isnull=True)
        except (ProjetStelle.DoesNotExist, ValueError, TypeError, DjangoValidationError) as exc:
            raise ValidationError({"stelle": "Dieses Gesuch gibt es nicht."}) from exc
        if stelle.status != StatutStelle.OFFEN:
            raise ValidationError({"stelle": "Dieses Gesuch ist nicht mehr offen."})
        if stelle.created_by_id == angebot.membre_id:
            raise ValidationError({"stelle": "Das eigene Gesuch kann nicht bedient werden."})
        bewerbung, _neu = ProjetBewerbung.objects.get_or_create(
            stelle=stelle, membre=angebot.membre, defaults={"nachricht": angebot.titel[:500]}
        )
        bewerbung.status = StatutBewerbung.ANGENOMMEN
        bewerbung.save()
        angenommen = stelle.bewerbungen.filter(status=StatutBewerbung.ANGENOMMEN).count()
        if angenommen >= stelle.anzahl:
            stelle.status = StatutStelle.BESETZT
            stelle.save(update_fields=["status", "updated_at"])
        angebot.stelle = stelle

    @action(detail=True, methods=["post"])
    def annehmen(self, request, pk=None):
        return self._entscheiden(request, StatutAngebot.ANGENOMMEN)

    @action(detail=True, methods=["post"])
    def ablehnen(self, request, pk=None):
        return self._entscheiden(request, StatutAngebot.ABGELEHNT)
