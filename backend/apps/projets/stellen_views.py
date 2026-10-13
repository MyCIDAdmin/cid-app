"""Projekt-Stellen (Release 10) — „Wir suchen Unterstützung“.

  GET/POST          /projets/stellen/                    Stellen (lesen: sichtbare Projekte, auch
                                                         anonym ; schreiben: Leitung/Verwaltung)
  GET/PATCH/DELETE  /projets/stellen/{id}/
  POST              /projets/stellen/{id}/bewerben/      aktives Mitglied meldet sich
  POST              /projets/stellen/{id}/zurueckziehen/ eigene offene Meldung zurückziehen
  GET               /projets/stellen/{id}/passende-mitglieder/   Vorschläge aus der Fähigkeiten-DB
  GET               /projets/bewerbungen/                Meldungen (Leitung: ihrer Projekte ;
                                                         sonst nur eigene)
  POST              /projets/bewerbungen/{id}/annehmen|ablehnen/   Leitung/Verwaltung
"""

from django.db import transaction
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ModelViewSet

from apps.membres.models import MembreFaehigkeit, StatutMembre

from .aktivitaet import logge
from .models import (
    AktionAktivitaet,
    ProjetBewerbung,
    ProjetMitglied,
    ProjetStelle,
    RolleProjet,
    StatutBewerbung,
    StatutStelle,
)
from .notifications import notifier_bewerbung, notifier_bewerbung_entschieden
from .permissions import ist_verwalter, kann_team_verwalten, sichtbare_projekte
from .serializers import BewerbungSerializer, StelleSerializer


class LesenOffenSchreibenAngemeldet(BasePermission):
    """Stellen sind öffentlich lesbar (Projektseite), alles andere braucht ein Konto."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated)


def _membre(request):
    return getattr(request.user, "membre", None)


def _leitungs_projekte(user) -> set:
    membre = getattr(user, "membre", None) if user and user.is_authenticated else None
    if membre is None:
        return set()
    return set(
        ProjetMitglied.objects.filter(membre=membre, rolle=RolleProjet.LEITUNG).values_list(
            "projet_id", flat=True
        )
    )


def _kann_verwalten_fn(user):
    """Gibt eine Funktion projekt_id -> bool zurück (Verwaltung: immer wahr ; sonst Leitung)."""
    if ist_verwalter(user):
        return lambda projet_id: True
    projekte = _leitungs_projekte(user)
    return lambda projet_id: projet_id in projekte


class StelleViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [LesenOffenSchreibenAngemeldet]
    serializer_class = StelleSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["projet", "status"]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["kann_verwalten"] = _kann_verwalten_fn(self.request.user)
        return context

    def get_queryset(self):
        user = self.request.user
        queryset = ProjetStelle.objects.select_related("faehigkeit", "projet").prefetch_related(
            "bewerbungen"
        )
        queryset = queryset.filter(projet__in=sichtbare_projekte(user))
        if ist_verwalter(user):
            return queryset
        sichtbar = Q(status=StatutStelle.OFFEN)
        leitung = _leitungs_projekte(user)
        if leitung:
            sichtbar |= Q(projet_id__in=leitung)
        return queryset.filter(sichtbar)

    def _pruefe_schreibrecht(self, projet):
        if not kann_team_verwalten(self.request.user, projet):
            raise PermissionDenied(
                "Nur die Projektleitung oder die Verwaltung darf Stellen ändern."
            )

    def perform_create(self, serializer):
        projet = serializer.validated_data["projet"]
        if not sichtbare_projekte(self.request.user).filter(pk=projet.pk).exists():
            raise PermissionDenied("Kein Zugriff auf dieses Projekt.")
        self._pruefe_schreibrecht(projet)
        stelle = serializer.save(created_by=_membre(self.request))
        logge(self.request.user, projet, AktionAktivitaet.STELLE_ERSTELLT, stelle.titel)

    def perform_update(self, serializer):
        self._pruefe_schreibrecht(serializer.instance.projet)
        stelle = serializer.save()
        # Wieder öffnen darf nur, solange Plätze frei sind ; sonst bleibt sie „besetzt“.
        if stelle.status == StatutStelle.OFFEN and self._angenommen(stelle) >= stelle.anzahl:
            stelle.status = StatutStelle.BESETZT
            stelle.save(update_fields=["status", "updated_at"])

    def perform_destroy(self, instance):
        self._pruefe_schreibrecht(instance.projet)
        instance.delete()

    @staticmethod
    def _angenommen(stelle) -> int:
        return stelle.bewerbungen.filter(status=StatutBewerbung.ANGENOMMEN).count()

    @action(detail=True, methods=["post"])
    def bewerben(self, request, pk=None):
        membre = _membre(request)
        if membre is None or membre.statut != StatutMembre.ACTIF:
            raise PermissionDenied("Nur aktive Mitglieder können sich auf eine Stelle melden.")
        nachricht = str(request.data.get("nachricht", ""))[:500].strip()
        with transaction.atomic():
            stelle = ProjetStelle.objects.select_for_update().get(pk=self.get_object().pk)
            if stelle.status != StatutStelle.OFFEN:
                raise ValidationError({"detail": "Diese Stelle ist nicht mehr offen."})
            if ProjetMitglied.objects.filter(projet=stelle.projet, membre=membre).exists():
                raise ValidationError({"detail": "Du gehörst bereits zum Team dieses Projekts."})
            bewerbung, neu = ProjetBewerbung.objects.get_or_create(
                stelle=stelle, membre=membre, defaults={"nachricht": nachricht}
            )
            if not neu:
                if bewerbung.status != StatutBewerbung.ZURUECKGEZOGEN:
                    raise ValidationError(
                        {"detail": "Du hast dich auf diese Stelle bereits gemeldet."}
                    )
                bewerbung.status = StatutBewerbung.OFFEN
                bewerbung.nachricht = nachricht
                bewerbung.entschieden_von = None
                bewerbung.save()
        notifier_bewerbung(bewerbung)
        return Response(self.get_serializer(self.get_object()).data, status=201 if neu else 200)

    @action(detail=True, methods=["post"])
    def zurueckziehen(self, request, pk=None):
        stelle = self.get_object()
        membre = _membre(request)
        bewerbung = ProjetBewerbung.objects.filter(
            stelle=stelle, membre=membre, status=StatutBewerbung.OFFEN
        ).first()
        if bewerbung is None:
            raise ValidationError({"detail": "Keine offene Meldung vorhanden."})
        bewerbung.status = StatutBewerbung.ZURUECKGEZOGEN
        bewerbung.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["get"], url_path="passende-mitglieder")
    def passende_mitglieder(self, request, pk=None):
        stelle = self.get_object()
        self._pruefe_schreibrecht(stelle.projet)
        if stelle.faehigkeit_id is None:
            return Response([])
        im_team = ProjetMitglied.objects.filter(projet=stelle.projet).values("membre_id")
        gemeldet = stelle.bewerbungen.values("membre_id")
        zeilen = (
            MembreFaehigkeit.objects.filter(
                faehigkeit_id=stelle.faehigkeit_id, membre__statut=StatutMembre.ACTIF
            )
            .exclude(membre_id__in=im_team)
            .exclude(membre_id__in=gemeldet)
            .select_related("membre")
            .order_by("membre__nom", "membre__prenom")
        )
        return Response(
            [
                {
                    "id": str(z.membre_id),
                    "nom_complet": f"{z.membre.prenom} {z.membre.nom}",
                    "kommentar": z.kommentar,
                }
                for z in zeilen
            ]
        )


class BewerbungViewSet(ListModelMixin, RetrieveModelMixin, GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = BewerbungSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["stelle", "status", "stelle__projet"]

    def get_queryset(self):
        user = self.request.user
        queryset = ProjetBewerbung.objects.select_related(
            "membre", "stelle", "stelle__projet"
        ).order_by("-created_at")
        if ist_verwalter(user):
            return queryset
        bedingung = Q(stelle__projet_id__in=_leitungs_projekte(user))
        membre = _membre(self.request)
        if membre is not None:
            bedingung |= Q(membre=membre)
        return queryset.filter(bedingung)

    def _entscheiden(self, request, ziel):
        with transaction.atomic():
            bewerbung = self.get_object()
            stelle = ProjetStelle.objects.select_for_update().get(pk=bewerbung.stelle_id)
            if not kann_team_verwalten(request.user, stelle.projet):
                raise PermissionDenied("Nur die Projektleitung oder die Verwaltung entscheidet.")
            if bewerbung.status != StatutBewerbung.OFFEN:
                raise ValidationError({"detail": "Diese Meldung wurde bereits bearbeitet."})
            bewerbung.status = ziel
            bewerbung.entschieden_von = _membre(request)
            bewerbung.save()
            if ziel == StatutBewerbung.ANGENOMMEN:
                ProjetMitglied.objects.get_or_create(
                    projet=stelle.projet,
                    membre=bewerbung.membre,
                    defaults={"rolle": RolleProjet.MITARBEIT},
                )
                angenommen = stelle.bewerbungen.filter(status=StatutBewerbung.ANGENOMMEN).count()
                if angenommen >= stelle.anzahl and stelle.status == StatutStelle.OFFEN:
                    stelle.status = StatutStelle.BESETZT
                    stelle.save(update_fields=["status", "updated_at"])
                logge(
                    request.user,
                    stelle.projet,
                    AktionAktivitaet.BEWERBUNG_ANGENOMMEN,
                    f"{bewerbung.membre.prenom} {bewerbung.membre.nom}".strip(),
                    stelle.titel,
                )
        notifier_bewerbung_entschieden(bewerbung)
        return Response(self.get_serializer(bewerbung).data)

    @action(detail=True, methods=["post"])
    def annehmen(self, request, pk=None):
        return self._entscheiden(request, StatutBewerbung.ANGENOMMEN)

    @action(detail=True, methods=["post"])
    def ablehnen(self, request, pk=None):
        return self._entscheiden(request, StatutBewerbung.ABGELEHNT)
