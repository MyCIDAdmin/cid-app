"""Familienpaket — API.

Hauptperson (angemeldet, nur die eigene Souscription ; Fremde bekommen 404) :
  DELETE /adhesions/souscriptions/<id>/kinder/<kind_id>/           Kind entfernen
  PATCH  /adhesions/souscriptions/<id>/erwachsene/<erw_id>/        Name / E-Mail korrigieren
  POST   /adhesions/souscriptions/<id>/erwachsene/<erw_id>/einladung/   Einladung erneut senden

Büro :
  GET   /adhesions/familienpakete/?campagne=<id>                   Übersicht (RH+)
  PATCH /adhesions/familienpakete/personen/<kind|erwachsener>/<id>/   Angebot zuweisen

  GET   /adhesions/familienpakete/bericht/?campagne=<id>[&export=csv]   Bericht ohne Personenbezug

Hauptperson, weiter :
  GET   /adhesions/familienpakete/vorjahr/?campagne=<id>           Personen aus dem letzten Paket

Eingeladene Person :
  GET   /adhesions/einladungen/<token>/                            Einladung ansehen (öffentlich)
  POST  /adhesions/einladungen/<token>/annehmen/                   Annehmen (angemeldet)
  POST  /adhesions/einladungen/<token>/ablehnen/                   Ablehnen (öffentlich)
  GET   /adhesions/meine-einladungen/                              Offene Einladungen des Kontos
"""

import csv
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import ROLE_LEVELS
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access, is_elevated_for_module

from . import familie
from .models import (
    CampagneAdhesion,
    EinladungStatus,
    FamilienErwachsener,
    FamilienKind,
    OffreAdhesion,
    Souscription,
    StatutSouscription,
    neues_einladungs_token,
)
from .permissions import READ_ALL_SOUSCRIPTIONS_MIN_LEVEL

_NICHT_AKTIV = (StatutSouscription.ANNULEE, StatutSouscription.EXPIREE)
_OFFEN = (EinladungStatus.EINGELADEN, EinladungStatus.ZUSTIMMUNG_OFFEN)
_ERNEUT_NACH = timedelta(hours=1)


def _eigene_souscription(request, pk) -> Souscription:
    """Nur die Hauptperson erreicht ihre Souscription (sonst 404, kein Hinweis auf fremde Daten)."""
    return get_object_or_404(
        Souscription.objects.select_related("offre", "membre", "campagne"),
        pk=pk,
        membre__user=request.user,
    )


def _name(m) -> str:
    return f"{m.prenom} {m.nom}".strip()


# --- Hauptperson ------------------------------------------------------------------------------


class KindDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, kind_pk):
        souscription = _eigene_souscription(request, pk)
        get_object_or_404(
            FamilienKind, pk=kind_pk, souscription=souscription, anonymisiert_am__isnull=True
        ).delete()
        return Response(status=204)


class ErwachsenerView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk, erw_pk):
        souscription = _eigene_souscription(request, pk)
        e = get_object_or_404(
            FamilienErwachsener,
            pk=erw_pk,
            souscription=souscription,
            anonymisiert_am__isnull=True,
        )
        if e.status in (EinladungStatus.ANGENOMMEN, EinladungStatus.KONFLIKT):
            raise ValidationError({"detail": "einladung_nicht_aenderbar"})
        daten = request.data
        for feld in ("vorname", "nachname"):
            if feld in daten:
                setattr(e, feld, familie._text(daten, feld, "erwachsene"))
        email_neu = None
        if "email" in daten:
            email = familie._text(daten, "email", "erwachsene").lower()
            try:
                validate_email(email)
            except DjangoValidationError:
                raise ValidationError({"erwachsene": "Ungültige E-Mail-Adresse."})
            if email != e.email:
                eigene = {
                    (souscription.membre.email or "").lower(),
                    (request.user.email or "").lower(),
                } | {x.email.lower() for x in souscription.erwachsene.exclude(pk=e.pk)}
                if email in eigene:
                    raise ValidationError(
                        {"erwachsene": "Jede E-Mail-Adresse darf nur einmal vorkommen."}
                    )
                email_neu = email
        if "beziehung" in daten:
            from .models import Beziehung

            if daten["beziehung"] not in Beziehung.values:
                raise ValidationError({"erwachsene": "Beziehung ungültig."})
            e.beziehung = daten["beziehung"]
        if email_neu:
            # Neue Adresse = neue Einladung ; der alte Link verliert seine Gültigkeit.
            e.email = email_neu
            e.token = neues_einladungs_token()
            e.status = EinladungStatus.OFFEN
            e.erinnerungen = 0
            e.letzte_erinnerung_am = None
            e.eingeladen_am = None
        e.save()
        if email_neu and souscription.statut == StatutSouscription.PAYEE:
            familie.sende_einladung(e)
        return Response(_erwachsener_json(e))


class ErwachsenerEinladungView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, erw_pk):
        souscription = _eigene_souscription(request, pk)
        e = get_object_or_404(
            FamilienErwachsener,
            pk=erw_pk,
            souscription=souscription,
            anonymisiert_am__isnull=True,
        )
        if souscription.statut != StatutSouscription.PAYEE:
            raise ValidationError({"detail": "paket_nicht_bezahlt"})
        if e.status not in (EinladungStatus.OFFEN, *_OFFEN):
            raise ValidationError({"detail": "einladung_nicht_offen"})
        if e.eingeladen_am and timezone.now() - e.eingeladen_am < _ERNEUT_NACH:
            return Response({"detail": "einladung_zu_frueh"}, status=429)
        familie.sende_einladung(e)
        return Response(_erwachsener_json(e))


def _erwachsener_json(e: FamilienErwachsener) -> dict:
    return {
        "id": str(e.id),
        "vorname": e.vorname,
        "nachname": e.nachname,
        "email": e.email,
        "beziehung": e.beziehung,
        "status": e.status,
    }


# --- Büro -------------------------------------------------------------------------------------


def _darf_buero_lesen(user) -> bool:
    return ROLE_LEVELS.get(user.role, 0) >= READ_ALL_SOUSCRIPTIONS_MIN_LEVEL or (
        is_elevated_for_module(user, "adhesions")
    )


class FamilienpaketeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _darf_buero_lesen(request.user):
            raise PermissionDenied()
        pakete = (
            Souscription.objects.filter(offre__ist_familienpaket=True)
            .exclude(statut__in=_NICHT_AKTIV)
            .select_related("membre", "offre", "campagne", "hauptperson_angebot")
            .prefetch_related("kinder__angebot", "erwachsene__angebot")
            .order_by("-date_souscription")
        )
        campagne = request.query_params.get("campagne")
        if campagne:
            pakete = pakete.filter(campagne_id=campagne)
        daten = []
        z = {
            "pakete_bezahlt": 0,
            "erwachsene_angenommen": 0,
            "erwachsene_offen": 0,
            "erwachsene_konflikt": 0,
            "kinder_eingetragen": 0,
            "listenpreis_gesamt": Decimal("0.00"),
            "gezahlt_gesamt": Decimal("0.00"),
        }
        for s in pakete:
            kinder = list(s.kinder.all())
            erwachsene = list(s.erwachsene.all())
            liste = (s.haupt_preis_liste or Decimal("0.00")) + sum(
                (p.preis_liste for p in (*kinder, *erwachsene)), Decimal("0.00")
            )
            gesamt = s.familien_gesamtpreis or Decimal("0.00")
            if s.statut == StatutSouscription.PAYEE:
                z["pakete_bezahlt"] += 1
                z["kinder_eingetragen"] += len(kinder)
                z["listenpreis_gesamt"] += liste
                z["gezahlt_gesamt"] += gesamt
                for e in erwachsene:
                    if e.status == EinladungStatus.ANGENOMMEN:
                        z["erwachsene_angenommen"] += 1
                    elif e.status == EinladungStatus.KONFLIKT:
                        z["erwachsene_konflikt"] += 1
                    elif e.status != EinladungStatus.ABGELEHNT:
                        z["erwachsene_offen"] += 1
            daten.append(
                {
                    "id": str(s.id),
                    "hauptperson": _name(s.membre),
                    "numero_membre": s.membre.numero_membre,
                    "angebot": s.offre.nom,
                    "hauptperson_angebot": (
                        s.hauptperson_angebot.nom if s.hauptperson_angebot else None
                    ),
                    "campagne": s.campagne.nom,
                    "statut": s.statut,
                    "gesamtpreis": str(gesamt),
                    "listenpreis": str(liste),
                    "rabatt_pct": str(s.familienrabatt_pct),
                    "haupt_preis_liste": str(s.haupt_preis_liste or "0.00"),
                    "haupt_preis_anteil": str(s.haupt_preis_anteil or "0.00"),
                    "erwachsene": [
                        {
                            "id": str(e.id),
                            "name": f"{e.vorname} {e.nachname}",
                            "email": e.email,
                            "beziehung": e.beziehung,
                            "status": e.status,
                            "anonymisiert": e.anonymisiert,
                            "angebot": e.angebot.nom if e.angebot else None,
                            "angebot_id": str(e.angebot_id) if e.angebot_id else None,
                            "preis_liste": str(e.preis_liste),
                            "preis_anteil": str(e.preis_anteil),
                        }
                        for e in erwachsene
                    ],
                    "kinder": [
                        {
                            "id": str(k.id),
                            "name": f"{k.vorname} {k.nachname}",
                            "alter": k.alter,
                            "anonymisiert": k.anonymisiert,
                            "ueber_hoechstalter": k.ueber_hoechstalter,
                            "beziehung": k.beziehung,
                            "angebot": k.angebot.nom if k.angebot else None,
                            "angebot_id": str(k.angebot_id) if k.angebot_id else None,
                            "preis_liste": str(k.preis_liste),
                            "preis_anteil": str(k.preis_anteil),
                        }
                        for k in kinder
                    ],
                }
            )
        z["familienrabatt_gesamt"] = z["listenpreis_gesamt"] - z["gezahlt_gesamt"]
        return Response(
            {
                "zusammenfassung": {
                    k: str(v) if isinstance(v, Decimal) else v for k, v in z.items()
                },
                "pakete": daten,
            }
        )


class FamilienberichtView(APIView):
    """Büro : Zahlen zu den Familienpaketen je Kampagne, ohne Personenbezug (bleibt auch nach
    der Anonymisierung vollständig). `?export=csv` liefert eine CSV-Datei für Excel."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not _darf_buero_lesen(request.user):
            raise PermissionDenied()
        zeilen = familie.bericht(request.query_params.get("campagne") or None)
        if request.query_params.get("export") != "csv":
            return Response({"kampagnen": zeilen})
        antwort = HttpResponse(content_type="text/csv; charset=utf-8")
        antwort["Content-Disposition"] = 'attachment; filename="familienpakete-bericht.csv"'
        antwort.write("\ufeff")
        w = csv.writer(antwort, delimiter=";")
        gruppen = ["0-5", "6-11", "12-17", "18+"]
        w.writerow(
            [
                "Kampagne",
                "Jahr",
                "Pakete",
                "Erwachsene angenommen",
                "Erwachsene offen",
                "Erwachsene abgelehnt",
                "Erwachsene Konflikt",
                "Kinder",
                *[f"Kinder {g}" for g in gruppen],
                "Kinder anonymisiert",
                "Listenpreis",
                "Gezahlt",
                "Rabatt",
                "Rabatt %",
            ]
        )
        for z in zeilen:
            w.writerow(
                [
                    _csv_text(z["campagne"]),
                    z["jahr"],
                    z["pakete"],
                    z["erwachsene_angenommen"],
                    z["erwachsene_offen"],
                    z["erwachsene_abgelehnt"],
                    z["erwachsene_konflikt"],
                    z["kinder"],
                    *[z["altersgruppen"][g] for g in gruppen],
                    z["kinder_anonymisiert"],
                    z["listenpreis"].replace(".", ","),
                    z["gezahlt"].replace(".", ","),
                    z["rabatt"].replace(".", ","),
                    z["rabatt_pct"].replace(".", ","),
                ]
            )
        return antwort


def _csv_text(wert: str) -> str:
    """Schützt vor Formel-Einschleusung in Excel (Zellen, die mit = + - @ beginnen)."""
    return "'" + wert if wert[:1] in ("=", "+", "-", "@") else wert


class VorjahrFamilieView(APIView):
    """Hauptperson : Personen aus dem letzten bezahlten Familienpaket in einer früheren Kampagne
    zum Übernehmen. Es wird nur vorgeschlagen ; gebucht wird erst mit der normalen Buchung (mit
    neuer Einwilligung für Kinder)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise PermissionDenied()
        campagne = get_object_or_404(CampagneAdhesion, pk=_uuid_oder_400(request, "campagne"))
        return Response(familie.vorjahr_familie(membre, campagne))


def _uuid_oder_400(request, name: str):
    import uuid

    try:
        return uuid.UUID(str(request.query_params.get(name, "")))
    except ValueError:
        raise ValidationError({name: "Ungültige Kampagne."})


class PersonAngebotView(APIView):
    """Büro : einer Person ein anderes (normales) Angebot der Kampagne zuweisen. Preise und
    Rabatt bleiben, wie sie gebucht bzw. bezahlt wurden — geändert werden Karte und Vorteile."""

    permission_classes = [IsAuthenticated]

    def patch(self, request, typ, pk):
        if not has_admin_page_access(
            request.user, "page_campagnes_adhesion", required=NiveauAcces.LECTURE_ECRITURE
        ):
            raise PermissionDenied()
        if typ == "kind":
            person = get_object_or_404(FamilienKind.objects.select_related("souscription"), pk=pk)
        elif typ == "erwachsener":
            person = get_object_or_404(
                FamilienErwachsener.objects.select_related("souscription"), pk=pk
            )
        else:
            return Response(status=404)
        haupt = person.souscription
        try:
            angebot = get_object_or_404(
                OffreAdhesion, pk=request.data.get("angebot"), campagne_id=haupt.campagne_id
            )
        except (DjangoValidationError, ValueError, TypeError):
            raise ValidationError({"angebot": "Ungültiges Angebot."})
        if angebot.ist_familienpaket:
            raise ValidationError({"angebot": "Es muss ein normales Angebot sein."})
        person.angebot = angebot
        person.save(update_fields=["angebot"])
        if typ == "erwachsener" and person.membre_id:
            sub = Souscription.objects.filter(
                membre_id=person.membre_id,
                campagne_id=haupt.campagne_id,
                bezahlt_ueber=haupt,
            ).first()
            if sub is not None:
                sub.offre = angebot
                sub.snapshot_avantages = angebot.avantages
                sub.save(update_fields=["offre", "snapshot_avantages", "updated_at"])
        return Response(
            {"id": str(person.id), "angebot": angebot.nom, "angebot_id": str(angebot.id)}
        )


# --- Eingeladene Person -----------------------------------------------------------------------


def _einladung_json(e: FamilienErwachsener) -> dict:
    return {
        "token": e.token,
        "hauptperson": _name(e.souscription.membre),
        "kampagne": e.souscription.campagne.nom,
        "angebot": e.angebot.nom if e.angebot else None,
        "vorname": e.vorname,
        "nachname": e.nachname,
        "email": e.email,
        "beziehung": e.beziehung,
        "status": e.status,
        "bezahlt": e.souscription.statut == StatutSouscription.PAYEE,
        "konto_vorhanden": familie._konto_zu(e.email) is not None,
    }


def _einladung(token: str) -> FamilienErwachsener:
    return get_object_or_404(
        FamilienErwachsener.objects.select_related(
            "souscription__membre", "souscription__campagne", "angebot"
        ),
        token=token,
    )


class EinladungView(APIView):
    """Öffentlich : der Token ist das Geheimnis. Zeigt nur, was die eingeladene Person braucht."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def get(self, request, token):
        return Response(_einladung_json(_einladung(token)))


class EinladungAnnehmenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        e = _einladung(token)
        if (request.user.email or "").lower() != e.email.lower():
            raise PermissionDenied("einladung_andere_email")
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError({"detail": "membre_fehlt"})
        e = familie.einladung_annehmen(e, membre)
        return Response(_einladung_json(_einladung(e.token)))


class EinladungAblehnenView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request, token):
        e = familie.einladung_ablehnen(_einladung(token))
        return Response(_einladung_json(e))


class MeineEinladungenView(APIView):
    """Offene Einladungen an die E-Mail-Adresse des angemeldeten Kontos (Hinweis in der App)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        email = (request.user.email or "").strip()
        if not email:
            return Response([])
        liste = (
            FamilienErwachsener.objects.filter(
                Q(email__iexact=email),
                status__in=_OFFEN,
                souscription__statut=StatutSouscription.PAYEE,
            )
            .select_related("souscription__membre", "souscription__campagne", "angebot")
            .order_by("-eingeladen_am")
        )
        return Response([_einladung_json(e) for e in liste])
