"""Projekt-Stellen (Release 10) — „Wir suchen Unterstützung“.

GET/POST          /projets/stellen/                    Stellen (lesen: sichtbare Projekte, auch
                                                       anonym ; schreiben: Leitung/Verwaltung)
                                                       + freie Gesuche „Hilfe gesucht“ (?frei=1)
GET/PATCH/DELETE  /projets/stellen/{id}/
POST              /projets/stellen/{id}/bewerben/      aktives Mitglied meldet sich
POST              /projets/stellen/{id}/zurueckziehen/ eigene offene Meldung zurückziehen
GET               /projets/stellen/{id}/passende-mitglieder/   Vorschläge aus der Fähigkeiten-DB
GET               /projets/bewerbungen/                Meldungen (Leitung: ihrer Projekte ;
                                                       sonst nur eigene)
POST              /projets/bewerbungen/{id}/annehmen|ablehnen/   Leitung/Verwaltung (freie Gesuche:
                                                       nur Seite „Meldungen genehmigen“)
POST              /projets/bewerbungen/{id}/empfehlen/ freie Gesuche: Ersteller·in empfiehlt
"""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet, ModelViewSet

from apps.membres.models import MembreFaehigkeit, StatutMembre

from .aktivitaet import logge
from .hilfe import darf_frei_pflegen, darf_genehmigen, darf_veroeffentlichen, ist_ersteller
from .models import (
    AktionAktivitaet,
    ProjetBewerbung,
    ProjetMitglied,
    ProjetStelle,
    RolleProjet,
    SichtbarkeitStelle,
    StatutBewerbung,
    StatutStelle,
)
from .notifications import notifier_bewerbung, notifier_bewerbung_entschieden, notifier_empfehlung
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
    filterset_fields = ["projet", "status", "art", "region", "kategorie"]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["kann_verwalten"] = _kann_verwalten_fn(self.request.user)
        context["kann_pflegen"] = self._kann_pflegen_fn()
        return context

    def _kann_pflegen_fn(self):
        """Gibt eine Funktion stelle -> bool zurück (Projekt: Leitung/Verwaltung ; freies Gesuch:
        Ersteller·in oder Seite „Meldungen genehmigen“)."""
        user = self.request.user
        projekt_recht = _kann_verwalten_fn(user)
        genehmigt = darf_genehmigen(user)
        membre = _membre(self.request)

        def pruefe(stelle) -> bool:
            if stelle.projet_id is not None:
                return projekt_recht(stelle.projet_id)
            return genehmigt or (membre is not None and stelle.created_by_id == membre.id)

        return pruefe

    def get_queryset(self):
        user = self.request.user
        queryset = ProjetStelle.objects.select_related(
            "faehigkeit", "projet", "region", "kategorie"
        ).prefetch_related("bewerbungen")
        # Stellen eines Projekts folgen der Sichtbarkeit des Projekts ; freie Gesuche der eigenen
        # Einstellung (nur Mitglieder = angemeldete Konten, sonst öffentlich ohne Anmeldung).
        frei = Q(projet__isnull=True)
        if not (user and user.is_authenticated):
            frei &= Q(sichtbarkeit=SichtbarkeitStelle.OEFFENTLICH)
        queryset = queryset.filter(Q(projet__in=sichtbare_projekte(user)) | frei)
        wunsch = self.request.query_params.get("frei")
        if wunsch in ("1", "true"):
            queryset = queryset.filter(projet__isnull=True)
        elif wunsch in ("0", "false"):
            queryset = queryset.filter(projet__isnull=False)
        alle_projekte = ist_verwalter(user)
        alle_freie = darf_genehmigen(user)
        if alle_projekte and alle_freie:
            return queryset
        sichtbar = Q(status=StatutStelle.OFFEN)
        leitung = _leitungs_projekte(user)
        if leitung:
            sichtbar |= Q(projet_id__in=leitung)
        membre = _membre(self.request)
        if membre is not None:
            sichtbar |= Q(projet__isnull=True, created_by=membre)
        if alle_projekte:
            sichtbar |= Q(projet__isnull=False)
        if alle_freie:
            sichtbar |= Q(projet__isnull=True)
        return queryset.filter(sichtbar)

    def _pruefe_schreibrecht(self, stelle):
        if not self._kann_pflegen_fn()(stelle):
            raise PermissionDenied(
                "Nur die Projektleitung, die Verwaltung oder die Ersteller·in darf Stellen ändern."
            )

    def perform_create(self, serializer):
        projet = serializer.validated_data.get("projet")
        if projet is None:
            if not darf_veroeffentlichen(self.request.user):
                raise PermissionDenied("Du darfst keine Hilfegesuche veröffentlichen.")
            serializer.save(created_by=_membre(self.request))
            return
        if not sichtbare_projekte(self.request.user).filter(pk=projet.pk).exists():
            raise PermissionDenied("Kein Zugriff auf dieses Projekt.")
        if not kann_team_verwalten(self.request.user, projet):
            raise PermissionDenied(
                "Nur die Projektleitung oder die Verwaltung darf Stellen ändern."
            )
        stelle = serializer.save(created_by=_membre(self.request))
        logge(self.request.user, projet, AktionAktivitaet.STELLE_ERSTELLT, stelle.titel)

    def perform_update(self, serializer):
        self._pruefe_schreibrecht(serializer.instance)
        stelle = serializer.save()
        # Wieder öffnen darf nur, solange Plätze frei sind ; sonst bleibt sie „besetzt“.
        if stelle.status == StatutStelle.OFFEN and self._angenommen(stelle) >= stelle.anzahl:
            stelle.status = StatutStelle.BESETZT
            stelle.save(update_fields=["status", "updated_at"])

    def perform_destroy(self, instance):
        self._pruefe_schreibrecht(instance)
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
            if stelle.frist is not None and stelle.frist < timezone.localdate():
                raise ValidationError({"detail": "Die Frist für diese Stelle ist abgelaufen."})
            if stelle.projet_id is None:
                if ist_ersteller(request.user, stelle):
                    raise ValidationError(
                        {"detail": "Das eigene Gesuch kann nicht bedient werden."}
                    )
            elif ProjetMitglied.objects.filter(projet=stelle.projet, membre=membre).exists():
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
            stelle=stelle,
            membre=membre,
            status__in=[StatutBewerbung.OFFEN, StatutBewerbung.EMPFOHLEN],
        ).first()
        if bewerbung is None:
            raise ValidationError({"detail": "Keine offene Meldung vorhanden."})
        bewerbung.status = StatutBewerbung.ZURUECKGEZOGEN
        bewerbung.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["get"], url_path="passende-mitglieder")
    def passende_mitglieder(self, request, pk=None):
        stelle = self.get_object()
        self._pruefe_schreibrecht(stelle)
        if stelle.faehigkeit_id is None:
            return Response([])
        gemeldet = stelle.bewerbungen.values("membre_id")
        zeilen = MembreFaehigkeit.objects.filter(
            faehigkeit_id=stelle.faehigkeit_id, membre__statut=StatutMembre.ACTIF
        )
        if stelle.projet_id is not None:
            zeilen = zeilen.exclude(
                membre_id__in=ProjetMitglied.objects.filter(projet=stelle.projet).values(
                    "membre_id"
                )
            )
        elif stelle.created_by_id:
            zeilen = zeilen.exclude(membre_id=stelle.created_by_id)
        zeilen = (
            zeilen.exclude(membre_id__in=gemeldet)
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
            "membre", "stelle", "stelle__projet", "empfohlen_von"
        ).order_by("-created_at")
        wunsch = self.request.query_params.get("frei")
        if wunsch in ("1", "true"):
            queryset = queryset.filter(stelle__projet__isnull=True)
        alle_projekte = ist_verwalter(user)
        alle_freie = darf_genehmigen(user)
        if alle_projekte and alle_freie:
            return queryset
        bedingung = Q(stelle__projet_id__in=_leitungs_projekte(user))
        membre = _membre(self.request)
        if membre is not None:
            bedingung |= Q(membre=membre)
            bedingung |= Q(stelle__projet__isnull=True, stelle__created_by=membre)
        if alle_projekte:
            bedingung |= Q(stelle__projet__isnull=False)
        if alle_freie:
            bedingung |= Q(stelle__projet__isnull=True)
        return queryset.filter(bedingung)

    def _entscheiden(self, request, ziel):
        with transaction.atomic():
            bewerbung = self.get_object()
            stelle = ProjetStelle.objects.select_for_update().get(pk=bewerbung.stelle_id)
            frei = stelle.projet_id is None
            if frei:
                if not darf_genehmigen(request.user):
                    raise PermissionDenied(
                        "Nur Personen mit dem Recht „Meldungen genehmigen“ entscheiden verbindlich."
                    )
            elif not kann_team_verwalten(request.user, stelle.projet):
                raise PermissionDenied("Nur die Projektleitung oder die Verwaltung entscheidet.")
            if bewerbung.status not in (StatutBewerbung.OFFEN, StatutBewerbung.EMPFOHLEN):
                raise ValidationError({"detail": "Diese Meldung wurde bereits bearbeitet."})
            bewerbung.status = ziel
            bewerbung.entschieden_von = _membre(request)
            bewerbung.save()
            if ziel == StatutBewerbung.ANGENOMMEN:
                if not frei:
                    ProjetMitglied.objects.get_or_create(
                        projet=stelle.projet,
                        membre=bewerbung.membre,
                        defaults={"rolle": RolleProjet.MITARBEIT},
                    )
                angenommen = stelle.bewerbungen.filter(status=StatutBewerbung.ANGENOMMEN).count()
                if angenommen >= stelle.anzahl and stelle.status == StatutStelle.OFFEN:
                    stelle.status = StatutStelle.BESETZT
                    stelle.save(update_fields=["status", "updated_at"])
                if not frei:
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

    @action(detail=True, methods=["post"])
    def empfehlen(self, request, pk=None):
        """Freies Gesuch: die Ersteller·in empfiehlt eine Meldung. Verbindlich wird sie erst durch
        die Genehmigung. Wer genehmigen darf, kann die Empfehlung überspringen und direkt annehmen.
        """
        with transaction.atomic():
            bewerbung = self.get_object()
            stelle = bewerbung.stelle
            if stelle.projet_id is not None:
                raise ValidationError({"detail": "Empfehlungen gibt es nur bei freien Gesuchen."})
            if not darf_frei_pflegen(request.user, stelle):
                raise PermissionDenied("Nur die Ersteller·in empfiehlt Meldungen.")
            if bewerbung.status != StatutBewerbung.OFFEN:
                raise ValidationError({"detail": "Diese Meldung wurde bereits bearbeitet."})
            bewerbung.status = StatutBewerbung.EMPFOHLEN
            bewerbung.empfohlen_von = _membre(request)
            bewerbung.save()
        notifier_empfehlung(bewerbung, durch=request.user)
        return Response(self.get_serializer(bewerbung).data)
