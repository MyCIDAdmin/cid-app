"""Kalender (Release 15).

  GET   /kalender/zugang/                       Was darf ich ? (verein/buero/schreiben/vorschlagen)
  GET   /kalender/eintraege/?von&bis&ansicht=   verein | buero | meine (Termine + Feed),
                                                auch kombiniert : ansicht=verein,meine
  CRUD  /kalender/termine/                      Pflege : Seite „page_kalender“ (Schreiben)
  POST  /kalender/termine/vorschlagen/          Vorschlag (Seite „page_kalender_vorschlag“)
  POST  /kalender/termine/{id}/freigeben|ablehnen|antworten|ankuendigen/
  GET   /kalender/termine/personen/?q=          Personensuche zum Einladen
  POST  /kalender/ausblenden/                   Feed-Eintrag (z. B. Spiel) aus-/einblenden
  GET   /kalender-oeffentlich/?von&bis          Öffentliche Termine ohne Anmeldung
"""

from datetime import datetime, time, timedelta

from django.conf import settings
from django.db import transaction
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

from .eintraege import AUSBLENDBAR, baue_eintraege, baue_mehrere
from .models import (
    Ausblendung,
    Dienst,
    DienstEintragung,
    Sichtbarkeit,
    TerminEinladung,
    TerminStatus,
)
from .serializers import AntwortSerializer, DienstSerializer, TerminSerializer
from .services import (
    darf_vorschlagen,
    ist_aktives_mitglied,
    ist_verwaltung,
    sichtbare_dienste,
    termine_fuer,
    zugang,
)

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


class AusblendenView(APIView):
    """POST {quelle, objekt_id, ausgeblendet} — Feed-Eintrag (z. B. ein Spiel) im Kalender aus- oder
    einblenden. Nur mit Schreibrecht auf die Seite „Kalender“."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not ist_verwaltung(request.user, schreiben=True):
            raise PermissionDenied("Keine Berechtigung.")
        quelle = request.data.get("quelle")
        objekt_id = str(request.data.get("objekt_id") or "")[:64]
        if quelle not in AUSBLENDBAR or not objekt_id:
            raise ValidationError({"quelle": "Dieser Eintrag kann nicht ausgeblendet werden."})
        if request.data.get("ausgeblendet", True):
            Ausblendung.objects.get_or_create(
                quelle=quelle, objekt_id=objekt_id, defaults={"ausgeblendet_von": request.user}
            )
        else:
            Ausblendung.objects.filter(quelle=quelle, objekt_id=objekt_id).delete()
        return Response({"quelle": quelle, "objekt_id": objekt_id})


class ZugangView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(zugang(request.user))


class EintraegeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        ansichten = list(
            dict.fromkeys(a for a in request.query_params.get("ansicht", "verein").split(",") if a)
        )
        if not ansichten or any(a not in ("verein", "buero", "meine") for a in ansichten):
            raise ValidationError({"ansicht": "Unbekannte Ansicht."})
        z = zugang(request.user)
        if "buero" in ansichten and not z["buero"]:
            raise PermissionDenied("Kein Zugang zum Büro-Kalender.")
        von, bis = _zeitraum(request)
        return Response(baue_mehrere(request.user, ansichten, von, bis))


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
        return termine_fuer(self.request.user)

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


def _bureau_nutzer(ausser=None):
    from apps.accounts.models import ROLE_LEVELS, Role, User

    stufe = ROLE_LEVELS[Role.BUREAU_ADMIN]
    rollen = [r for r, n in ROLE_LEVELS.items() if n >= stufe]
    return User.objects.filter(role__in=rollen, is_active=True).exclude(pk=ausser)


def _notify(user, titel, nachricht):
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    notifier(
        user,
        TypeNotification.EVENEMENT_INVITATION,
        titre=titel,
        message=nachricht,
        lien="/kalender",
    )


def _wann(dt) -> str:
    return timezone.localtime(dt).strftime("%d.%m.%Y %H:%M")


class DienstViewSet(ModelViewSet):
    """Helfer-Slots (Release 16) : sehen = wer Termin/Veranstaltung sieht ; eintragen = aktive
    Mitglieder ; anlegen, zuweisen, entfernen, Vorschläge = Seite „Kalender“ mit Schreibrecht."""

    serializer_class = DienstSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    schreib_aktionen = {
        "create",
        "update",
        "partial_update",
        "destroy",
        "zuweisen",
        "entfernen",
        "vorschlaege",
        "anschreiben",
    }

    def get_queryset(self):
        qs = (
            sichtbare_dienste(self.request.user)
            .prefetch_related("eintraege__user__membre")
            .distinct()
        )
        for feld in ("termin", "evenement"):
            wert = self.request.query_params.get(feld)
            if wert:
                qs = qs.filter(**{f"{feld}_id": wert})
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if self.action in self.schreib_aktionen and not ist_verwaltung(
            request.user, schreiben=True
        ):
            raise PermissionDenied("Dafür fehlt die Berechtigung (Seite „Kalender“).")

    def perform_create(self, serializer):
        serializer.save(erstellt_von=self.request.user)

    @action(detail=False, methods=["get"])
    def offen(self, request):
        """Kommende Dienste (60 Tage) mit freien Plätzen — „Hier wird noch geholfen“."""
        jetzt = timezone.now()
        liste = [
            d
            for d in self.get_queryset().filter(
                beginn__gte=jetzt, beginn__lt=jetzt + timedelta(days=60)
            )
            if d.eintraege.count() < d.benoetigt
        ]
        return Response(self.get_serializer(liste[:50], many=True).data)

    def _sperre(self, pk):
        """Dienst mit Zeilensperre (gegen Überbuchung durch gleichzeitige Einträge)."""
        dienst = self.get_object()
        return Dienst.objects.select_for_update().get(pk=dienst.pk)

    def _antwort(self, dienst):
        frisch = self.get_queryset().get(pk=dienst.pk)
        return Response(self.get_serializer(frisch).data)

    @action(detail=True, methods=["post"])
    def eintragen(self, request, pk=None):
        if not ist_aktives_mitglied(request.user):
            raise PermissionDenied("Nur aktive Mitglieder können sich eintragen.")
        with transaction.atomic():
            dienst = self._sperre(pk)
            if (dienst.ende or dienst.beginn) < timezone.now():
                raise ValidationError("Dieser Dienst liegt in der Vergangenheit.")
            if dienst.eintraege.filter(user=request.user).exists():
                raise ValidationError("Du bist bereits eingetragen.")
            if dienst.eintraege.count() >= dienst.benoetigt:
                raise ValidationError("Dieser Dienst ist bereits voll besetzt.")
            DienstEintragung.objects.create(dienst=dienst, user=request.user)
        return self._antwort(dienst)

    @action(detail=True, methods=["post"])
    def austragen(self, request, pk=None):
        with transaction.atomic():
            dienst = self._sperre(pk)
            eintrag = dienst.eintraege.filter(user=request.user).first()
            if eintrag is None:
                raise ValidationError("Du bist nicht eingetragen.")
            frist = dienst.austragen_bis or dienst.beginn
            if timezone.now() > frist:
                raise ValidationError(
                    "Die Frist zum Austragen ist abgelaufen — bitte beim Bureau melden."
                )
            eintrag.delete()
        self._melde_frei(dienst)
        return self._antwort(dienst)

    @action(detail=True, methods=["post"])
    def zuweisen(self, request, pk=None):
        user = self._person(request)
        with transaction.atomic():
            dienst = self._sperre(pk)
            if dienst.eintraege.filter(user=user).exists():
                raise ValidationError("Die Person ist bereits eingetragen.")
            if dienst.eintraege.count() >= dienst.benoetigt:
                raise ValidationError("Dieser Dienst ist bereits voll besetzt.")
            DienstEintragung.objects.create(dienst=dienst, user=user, zugewiesen_von=request.user)
        _notify(
            user,
            f"Dienst: {dienst.titel}",
            f"Du wurdest für „{dienst.titel}“ am {_wann(dienst.beginn)} eingeteilt.",
        )
        return self._antwort(dienst)

    @action(detail=True, methods=["post"])
    def entfernen(self, request, pk=None):
        user = self._person(request)
        with transaction.atomic():
            dienst = self._sperre(pk)
            geloescht, _ = dienst.eintraege.filter(user=user).delete()
        if not geloescht:
            raise ValidationError("Die Person ist nicht eingetragen.")
        _notify(
            user,
            f"Dienst: {dienst.titel}",
            f"Du wurdest aus dem Dienst „{dienst.titel}“ ausgetragen.",
        )
        self._melde_frei(dienst)
        return self._antwort(dienst)

    @staticmethod
    def _person(request):
        from apps.accounts.models import User

        wert = request.data.get("user")
        user = User.objects.filter(pk=wert, is_active=True).first() if wert else None
        if user is None or not ist_aktives_mitglied(user):
            raise ValidationError({"user": "Bitte ein aktives Mitglied wählen."})
        return user

    @staticmethod
    def _melde_frei(dienst):
        """Wird ein Platz kurzfristig (≤ 72 h vor Beginn) frei, erfährt es das Bureau."""
        if dienst.beginn - timezone.now() > timedelta(hours=72) or dienst.beginn < timezone.now():
            return
        if dienst.eintraege.count() >= dienst.benoetigt:
            return
        for user in _bureau_nutzer():
            _notify(
                user,
                "Dienst nicht mehr besetzt",
                f"„{dienst.titel}“ am {_wann(dienst.beginn)} hat wieder freie Plätze.",
            )

    @action(detail=True, methods=["get"])
    def vorschlaege(self, request, pk=None):
        """Aktive Mitglieder mit der benötigten Fähigkeit (Fähigkeiten-Datenbank), noch nicht
        eingetragen."""
        from apps.membres.models import MembreFaehigkeit

        dienst = self.get_object()
        if dienst.faehigkeit_id is None:
            return Response([])
        eingetragen = dienst.eintraege.values("user_id")
        zeilen = (
            MembreFaehigkeit.objects.filter(
                faehigkeit_id=dienst.faehigkeit_id,
                membre__statut=StatutMembre.ACTIF,
                membre__user__isnull=False,
            )
            .exclude(membre__user_id__in=eingetragen)
            .select_related("membre")
            .order_by("membre__nom", "membre__prenom")
        )
        return Response(
            [
                {
                    "user": str(z.membre.user_id),
                    "name": f"{z.membre.prenom} {z.membre.nom}".strip(),
                    "kommentar": z.kommentar,
                }
                for z in zeilen
            ]
        )

    @action(detail=True, methods=["post"])
    def anschreiben(self, request, pk=None):
        """Benachrichtigt eine vorgeschlagene Person : „Wir suchen Helfer …“."""
        dienst = self.get_object()
        user = self._person(request)
        _notify(
            user,
            f"Helfer gesucht: {dienst.titel}",
            f"Das Bureau sucht Unterstützung für „{dienst.titel}“ am "
            f"{_wann(dienst.beginn)}. Du kannst dich im Kalender eintragen.",
        )
        return Response({"ok": True})
