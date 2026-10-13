"""Kalender (Release 15).

  GET   /kalender/zugang/                       Was darf ich ? (verein/buero/schreiben/vorschlagen)
  GET   /kalender/eintraege/?von&bis&ansicht=   verein | buero | meine (Termine + Feed)
  CRUD  /kalender/termine/                      Pflege : Seite „page_kalender“ (Schreiben)
  POST  /kalender/termine/vorschlagen/          Vorschlag (Seite „page_kalender_vorschlag“)
  POST  /kalender/termine/{id}/freigeben|ablehnen|antworten|ankuendigen/
  GET   /kalender/termine/personen/?q=          Personensuche zum Einladen
  GET   /kalender-oeffentlich/?von&bis          Öffentliche Termine ohne Anmeldung
"""

from datetime import datetime, time, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.utils.html import escape
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.communaute.models import Publication
from apps.communaute.tasks import notifier_publication_importante
from apps.membres.models import Membre, StatutMembre

from .eintraege import baue_eintraege
from .models import Sichtbarkeit, Termin, TerminEinladung, TerminStatus
from .serializers import AntwortSerializer, TerminSerializer
from .services import darf_vorschlagen, ist_verwaltung, sichtbare_termine, zugang

MAX_TAGE = 100
SCHREIB_AKTIONEN = {
    "create",
    "update",
    "partial_update",
    "destroy",
    "freigeben",
    "ablehnen",
    "ankuendigen",
    "personen",
}


def _zeitraum(request):
    def lesen(name, standard):
        roh = request.query_params.get(name)
        if not roh:
            return standard
        wert = parse_datetime(roh)
        if wert is None:
            tag = parse_date(roh)
            if tag is None:
                raise ValidationError({name: "Ungültiges Datum."})
            wert = datetime.combine(tag, time.min)
        return timezone.make_aware(wert) if timezone.is_naive(wert) else wert

    heute = timezone.make_aware(datetime.combine(timezone.localdate(), time.min))
    von = lesen("von", heute)
    bis = lesen("bis", von + timedelta(days=31))
    if bis <= von or (bis - von).days > MAX_TAGE:
        raise ValidationError({"bis": f"Der Zeitraum darf höchstens {MAX_TAGE} Tage umfassen."})
    return von, bis


class ZugangView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(zugang(request.user))


class EintraegeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ansicht = request.query_params.get("ansicht", "verein")
        if ansicht not in ("verein", "buero", "meine"):
            raise ValidationError({"ansicht": "Unbekannte Ansicht."})
        z = zugang(request.user)
        if ansicht == "buero" and not z["buero"]:
            raise PermissionDenied("Kein Zugang zum Büro-Kalender.")
        von, bis = _zeitraum(request)
        return Response(baue_eintraege(request.user, ansicht, von, bis))


class OeffentlichView(APIView):
    """Ohne Anmeldung : nur öffentliche Termine und öffentliche Veranstaltungen."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        von, bis = _zeitraum(request)
        daten = baue_eintraege(None, "verein", von, bis)
        return Response(
            [
                {
                    k: e.get(k)
                    for k in (
                        "id",
                        "quelle",
                        "titel",
                        "beschreibung",
                        "ort",
                        "link",
                        "kategorie",
                        "beginn",
                        "ende",
                        "ganztaegig",
                        "wichtig",
                        "uebersetzungen",
                    )
                }
                for e in daten
            ]
        )


class TerminViewSet(ModelViewSet):
    serializer_class = TerminSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if ist_verwaltung(user, schreiben=True):
            return Termin.objects.select_related("projekt").all()
        sichtbar = Q()
        for ansicht in ("verein", "buero", "meine"):
            sichtbar |= Q(pk__in=sichtbare_termine(user, ansicht).values("pk"))
        return Termin.objects.select_related("projekt").filter(sichtbar)

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in SCHREIB_AKTIONEN and not ist_verwaltung(request.user, schreiben=True):
            raise PermissionDenied("Dafür fehlt die Berechtigung (Seite „Kalender“).")

    def perform_create(self, serializer):
        serializer.save(erstellt_von=self.request.user, status=TerminStatus.FREIGEGEBEN)

    @action(detail=False, methods=["post"])
    def vorschlagen(self, request):
        if not darf_vorschlagen(request.user):
            raise PermissionDenied("Du darfst keine Termine vorschlagen.")
        eingabe = self.get_serializer(data={**request.data, "einladen": []})
        eingabe.is_valid(raise_exception=True)
        termin = eingabe.save(erstellt_von=request.user, status=TerminStatus.VORGESCHLAGEN)
        self._melde_vorschlag(termin)
        return Response(self.get_serializer(termin).data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _melde_vorschlag(termin):
        from apps.accounts.models import ROLE_LEVELS, Role, User
        from apps.notifications.models import TypeNotification
        from apps.notifications.services import notifier

        stufe = ROLE_LEVELS[Role.BUREAU_ADMIN]
        rollen = [r for r, n in ROLE_LEVELS.items() if n >= stufe]
        for user in User.objects.filter(role__in=rollen, is_active=True).exclude(
            pk=termin.erstellt_von_id
        ):
            notifier(
                user,
                TypeNotification.EVENEMENT_INVITATION,
                titre="Terminvorschlag",
                message=f"Neuer Vorschlag zur Freigabe: {termin.titel}",
                lien="/kalender",
            )

    def _entscheiden(self, request, neuer_status):
        from apps.notifications.models import TypeNotification
        from apps.notifications.services import notifier

        termin = self.get_object()
        if termin.status != TerminStatus.VORGESCHLAGEN:
            raise ValidationError("Nur Vorschläge können entschieden werden.")
        termin.status = neuer_status
        termin.freigegeben_von = request.user
        termin.save(update_fields=["status", "freigegeben_von", "updated_at"])
        freigegeben = neuer_status == TerminStatus.FREIGEGEBEN
        notifier(
            termin.erstellt_von,
            TypeNotification.EVENEMENT_INVITATION,
            titre="Terminvorschlag " + ("freigegeben" if freigegeben else "abgelehnt"),
            message=f"„{termin.titel}“ wurde {'freigegeben' if freigegeben else 'abgelehnt'}.",
            lien="/kalender",
        )
        return Response(self.get_serializer(termin).data)

    @action(detail=True, methods=["post"])
    def freigeben(self, request, pk=None):
        return self._entscheiden(request, TerminStatus.FREIGEGEBEN)

    @action(detail=True, methods=["post"])
    def ablehnen(self, request, pk=None):
        return self._entscheiden(request, TerminStatus.ABGELEHNT)

    @action(detail=True, methods=["post"])
    def antworten(self, request, pk=None):
        termin = self.get_object()
        eingabe = AntwortSerializer(data=request.data)
        eingabe.is_valid(raise_exception=True)
        einladung = TerminEinladung.objects.filter(termin=termin, user=request.user).first()
        if einladung is None:
            raise ValidationError("Du bist zu diesem Termin nicht eingeladen.")
        einladung.antwort = eingabe.validated_data["antwort"]
        einladung.save(update_fields=["antwort"])
        return Response(self.get_serializer(termin).data)

    @action(detail=True, methods=["post"])
    def ankuendigen(self, request, pk=None):
        termin = self.get_object()
        if termin.status != TerminStatus.FREIGEGEBEN:
            raise ValidationError("Nur freigegebene Termine können angekündigt werden.")
        if termin.sichtbarkeit not in (Sichtbarkeit.MITGLIEDER, Sichtbarkeit.OEFFENTLICH):
            raise ValidationError("Nur für Mitglieder sichtbare Termine können angekündigt werden.")
        if termin.publikation_id:
            raise ValidationError("Dieser Termin wurde bereits angekündigt.")
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError("Dein Konto hat keine Mitgliedsakte – Ankündigung nicht möglich.")
        beginn = timezone.localtime(termin.beginn)
        wann = beginn.strftime("%d.%m.%Y") + (
            "" if termin.ganztaegig else beginn.strftime(" %H:%M")
        )
        link = f"{settings.FRONTEND_URL.rstrip('/')}/kalender"
        html = (
            f"<p><strong>Termin: {escape(termin.titel)}</strong></p>"
            f"<p>{escape(wann)}{' · ' + escape(termin.ort) if termin.ort else ''}</p>"
            + (f"<p>{escape(termin.beschreibung[:300])}</p>" if termin.beschreibung else "")
            + f'<p><a href="{escape(link)}">Zum Kalender</a></p>'
        )
        publikation = Publication.objects.create(auteur=membre, contenu=html, important=True)
        termin.publikation = publikation
        termin.save(update_fields=["publikation", "updated_at"])
        notifier_publication_importante.delay(str(publikation.id))
        return Response(self.get_serializer(termin).data)

    @action(detail=False, methods=["get"])
    def personen(self, request):
        suche = (request.query_params.get("q") or "").strip()
        if len(suche) < 2:
            return Response([])
        treffer = (
            Membre.objects.filter(statut=StatutMembre.ACTIF, user__isnull=False)
            .filter(Q(nom__icontains=suche) | Q(prenom__icontains=suche))
            .select_related("user")[:20]
        )
        return Response(
            [{"user": str(m.user_id), "name": f"{m.prenom} {m.nom}".strip()} for m in treffer]
        )
