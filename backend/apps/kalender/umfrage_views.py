"""Terminfindung „Wann passt es euch?“ (Release 18).

  GET|POST   /kalender/terminumfragen/          Liste (eigene bzw. alle mit Schreibrecht) / anlegen
  GET|DELETE /kalender/terminumfragen/{id}/         Detail / abbrechen (Schreibrecht)
  POST      /kalender/terminumfragen/{id}/abstimmen/    {stimmen: {option_id: ja|vielleicht|nein}}
  POST      /kalender/terminumfragen/{id}/entscheiden/  {option} → Termin mit Einladungen entsteht
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.projets.models import Projet

from .models import Kategorie, Sichtbarkeit, Termin, TerminEinladung, TerminStatus
from .models_sitzung import Terminoption, Terminstimme, Terminumfrage, UmfrageStatus
from .serializers import _name
from .services import ist_verwaltung

ANTWORTEN = {a for a, _ in Terminstimme.ANTWORTEN}


def _schreiben(user) -> bool:
    return ist_verwaltung(user, schreiben=True)


def sichtbare_umfragen(user):
    if _schreiben(user):
        return Terminumfrage.objects.all()
    return Terminumfrage.objects.filter(Q(teilnehmer=user) | Q(erstellt_von=user)).distinct()


def umfrage_dict(user, u: Terminumfrage) -> dict:
    schreiben = _schreiben(user) or u.erstellt_von_id == user.pk
    stimmen = list(Terminstimme.objects.filter(option__umfrage=u).select_related("user"))
    geantwortet = {s.user_id for s in stimmen}
    optionen = []
    for o in u.optionen.all():
        zu_option = [s for s in stimmen if s.option_id == o.pk]
        optionen.append(
            {
                "id": str(o.pk),
                "beginn": o.beginn,
                "ja": sum(s.antwort == "ja" for s in zu_option),
                "vielleicht": sum(s.antwort == "vielleicht" for s in zu_option),
                "nein": sum(s.antwort == "nein" for s in zu_option),
                "meine_antwort": next((s.antwort for s in zu_option if s.user_id == user.pk), None),
                "stimmen": (
                    [
                        {"user": str(s.user_id), "name": _name(s.user), "antwort": s.antwort}
                        for s in zu_option
                    ]
                    if schreiben
                    else []
                ),
            }
        )
    return {
        "id": str(u.pk),
        "titel": u.titel,
        "beschreibung": u.beschreibung,
        "ort": u.ort,
        "dauer_minuten": u.dauer_minuten,
        "kategorie": u.kategorie,
        "sichtbarkeit": u.sichtbarkeit,
        "kreis": u.kreis,
        "projekt": str(u.projekt_id) if u.projekt_id else None,
        "antwort_bis": u.antwort_bis,
        "status": u.status,
        "erstellt_von_name": _name(u.erstellt_von),
        "teilnehmer": [
            {"user": str(t.pk), "name": _name(t), "geantwortet": t.pk in geantwortet}
            for t in u.teilnehmer.all()
        ],
        "optionen": optionen,
        "gewaehlt": str(u.gewaehlt_id) if u.gewaehlt_id else None,
        "termin": str(u.termin_id) if u.termin_id else None,
        "bin_teilnehmer": u.teilnehmer.filter(pk=user.pk).exists(),
        "darf_entscheiden": schreiben and u.status == UmfrageStatus.OFFEN,
    }


def _umfrage(request, pk):
    return get_object_or_404(sichtbare_umfragen(request.user), pk=pk)


class UmfrageListeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        umfragen = (
            sichtbare_umfragen(request.user)
            .select_related("erstellt_von")
            .prefetch_related("optionen", "teilnehmer")
        )
        if request.query_params.get("offen"):
            umfragen = umfragen.filter(status=UmfrageStatus.OFFEN)
        return Response([umfrage_dict(request.user, u) for u in umfragen[:50]])

    @transaction.atomic
    def post(self, request):
        if not _schreiben(request.user):
            raise PermissionDenied("Dafür fehlt die Berechtigung (Seite „Kalender“).")
        d = request.data
        titel = str(d.get("titel") or "").strip()
        if not titel:
            raise ValidationError({"titel": "Bitte einen Titel eingeben."})
        zeiten = []
        for o in d.get("optionen") or []:
            beginn = parse_datetime(str(o.get("beginn") or ""))
            if beginn is None:
                raise ValidationError({"optionen": "Ungültiger Terminvorschlag."})
            zeiten.append(beginn)
        if len(set(zeiten)) < 2:
            raise ValidationError({"optionen": "Bitte mindestens zwei Terminvorschläge angeben."})
        personen = User.objects.filter(pk__in=d.get("teilnehmer") or [], is_active=True)
        if not personen:
            raise ValidationError({"teilnehmer": "Bitte Teilnehmer auswählen."})
        sichtbarkeit = d.get("sichtbarkeit") or Sichtbarkeit.KREIS
        if sichtbarkeit not in Sichtbarkeit.values:
            raise ValidationError({"sichtbarkeit": "Ungültige Sichtbarkeit."})
        kategorie = d.get("kategorie") or Kategorie.SITZUNG
        if kategorie not in Kategorie.values:
            raise ValidationError({"kategorie": "Ungültige Kategorie."})
        kreis = d.get("kreis") or "bureau" if sichtbarkeit == Sichtbarkeit.KREIS else ""
        if kreis not in ("", "bureau", "projekt"):
            raise ValidationError({"kreis": "Ungültiger Kreis."})
        projekt = None
        if kreis == "projekt":
            projekt = Projet.objects.filter(pk=d.get("projekt")).first()
            if projekt is None:
                raise ValidationError({"projekt": "Bitte ein Projekt wählen."})
        bis = parse_date(str(d.get("antwort_bis") or "")) if d.get("antwort_bis") else None
        umfrage = Terminumfrage.objects.create(
            titel=titel[:200],
            beschreibung=d.get("beschreibung") or "",
            ort=d.get("ort") or "",
            dauer_minuten=int(d.get("dauer_minuten") or 60),
            kategorie=kategorie,
            sichtbarkeit=sichtbarkeit,
            kreis=kreis,
            projekt=projekt,
            antwort_bis=bis,
            erstellt_von=request.user,
        )
        umfrage.teilnehmer.set(personen)
        for beginn in sorted(set(zeiten)):
            Terminoption.objects.create(umfrage=umfrage, beginn=beginn)
        _einladen(umfrage, request.user)
        umfrage = sichtbare_umfragen(request.user).get(pk=umfrage.pk)
        return Response(umfrage_dict(request.user, umfrage), status=status.HTTP_201_CREATED)


def _einladen(umfrage, absender):
    from apps.notifications.email_cid import Texte, envoyer_email_cid
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    bis = f" Bitte antworte bis {umfrage.antwort_bis:%d.%m.%Y}." if umfrage.antwort_bis else ""
    for user in umfrage.teilnehmer.exclude(pk=absender.pk):
        notifier(
            user,
            TypeNotification.EVENEMENT_INVITATION,
            titre=f"Wann passt es euch? {umfrage.titel}",
            message=f"Bitte gib an, wann du kannst.{bis}",
            lien="/kalender",
        )
        if user.email:
            envoyer_email_cid(
                sujet=f"Wann passt es euch? {umfrage.titel}",
                destinataire=user.email,
                textes={
                    "de": Texte(
                        titre=umfrage.titel,
                        paragraphes=[
                            f"Bitte gib im Kalender an, welche Termine für dich passen.{bis}"
                        ],
                        cta="Zum Kalender",
                    ),
                    "fr": Texte(
                        titre=umfrage.titel,
                        paragraphes=["Indiquez dans le calendrier quelles dates vous conviennent."],
                        cta="Ouvrir le calendrier",
                    ),
                },
                lien=f"{settings.FRONTEND_URL}/kalender",
                fail_silently=True,
            )


class UmfrageDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(umfrage_dict(request.user, _umfrage(request, pk)))

    def delete(self, request, pk):
        umfrage = _umfrage(request, pk)
        if not (_schreiben(request.user) or umfrage.erstellt_von_id == request.user.pk):
            raise PermissionDenied("Dafür fehlt die Berechtigung.")
        if umfrage.status == UmfrageStatus.OFFEN:
            umfrage.status = UmfrageStatus.ABGEBROCHEN
            umfrage.save(update_fields=["status"])
        return Response(umfrage_dict(request.user, umfrage))


class AbstimmenView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        umfrage = _umfrage(request, pk)
        if umfrage.status != UmfrageStatus.OFFEN:
            raise ValidationError({"status": "Diese Terminfindung ist abgeschlossen."})
        if not umfrage.teilnehmer.filter(pk=request.user.pk).exists():
            raise PermissionDenied("Du bist nicht eingeladen.")
        stimmen = request.data.get("stimmen") or {}
        optionen = {str(o.pk): o for o in umfrage.optionen.all()}
        for option_id, antwort in stimmen.items():
            if option_id not in optionen or antwort not in ANTWORTEN:
                raise ValidationError({"stimmen": "Ungültige Antwort."})
        for option_id, antwort in stimmen.items():
            Terminstimme.objects.update_or_create(
                option=optionen[option_id], user=request.user, defaults={"antwort": antwort}
            )
        return Response(umfrage_dict(request.user, _umfrage(request, pk)))


class EntscheidenView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        from apps.notifications.models import TypeNotification
        from apps.notifications.services import notifier

        umfrage = _umfrage(request, pk)
        if not (_schreiben(request.user) or umfrage.erstellt_von_id == request.user.pk):
            raise PermissionDenied("Dafür fehlt die Berechtigung.")
        if umfrage.status != UmfrageStatus.OFFEN:
            raise ValidationError({"status": "Diese Terminfindung ist schon abgeschlossen."})
        option = get_object_or_404(umfrage.optionen, pk=request.data.get("option"))
        termin = Termin.objects.create(
            titel=umfrage.titel,
            beschreibung=umfrage.beschreibung,
            ort=umfrage.ort,
            kategorie=umfrage.kategorie,
            beginn=option.beginn,
            ende=option.beginn + timedelta(minutes=umfrage.dauer_minuten),
            sichtbarkeit=umfrage.sichtbarkeit,
            kreis=umfrage.kreis,
            projekt=umfrage.projekt,
            status=TerminStatus.FREIGEGEBEN,
            erstellt_von=request.user,
        )
        wann = option.beginn.astimezone().strftime("%d.%m.%Y %H:%M")
        for user in umfrage.teilnehmer.all():
            TerminEinladung.objects.create(termin=termin, user=user)
            if user.pk != request.user.pk:
                notifier(
                    user,
                    TypeNotification.EVENEMENT_INVITATION,
                    titre=f"Termin steht fest: {umfrage.titel}",
                    message=f"Der Termin ist am {wann}.",
                    lien="/kalender",
                )
        umfrage.status = UmfrageStatus.ENTSCHIEDEN
        umfrage.gewaehlt = option
        umfrage.termin = termin
        umfrage.save()
        return Response(umfrage_dict(request.user, _umfrage(request, pk)))
