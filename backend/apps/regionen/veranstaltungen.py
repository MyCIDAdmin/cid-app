"""Regionale Veranstaltungen (Release 28) — API unter /api/v1/regionen/.

  GET|POST /regionen/<slug>/veranstaltungen/                  Liste / neuer Entwurf
  GET|PATCH|DELETE /regionen/<slug>/veranstaltungen/<id>/
  POST|DELETE /regionen/<slug>/veranstaltungen/<id>/bild/
  POST /regionen/<slug>/veranstaltungen/<id>/aktion/          {aktion, grund?}: einreichen,
                                          freigeben, zurueckweisen, absagen, abschliessen
  PUT  /regionen/<slug>/veranstaltungen/<id>/anmeldung/       {aktiv} — jedes Konto
  GET  /regionen/<slug>/veranstaltungen/<id>/teilnehmer/      Verantwortliche, Büro
  PUT  /regionen/<slug>/veranstaltungen/<id>/teilnehmer/<user>/  {anwesend}
  GET  /regionen/veranstaltungen/zur-freigabe/                Büro
  GET  /regionen/public/veranstaltungen/<id>/                 öffentliche HTML-Seite ohne Anmeldung

Ablauf: Entwurf → eingereicht → veröffentlicht (oder zurückgewiesen) → abgeschlossen / abgesagt.
"""

import datetime

from django.db import transaction
from django.db.models import Count
from django.http import Http404
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.kalender.benachrichtigung import melden
from apps.notifications.models import TypeNotification

from . import services
from .models import Teilnahme, Veranstaltung, VeranstaltungStatus
from .permissions import IsAuthenticated
from .views import _bearbeitbar, _bild, _region, _standort, _text, _url

S = VeranstaltungStatus
# Diese Zustände darf die Region selbst ändern ; veröffentlichte Treffen nur das Büro.
BEARBEITBAR_VERANTWORTLICHE = {S.ENTWURF, S.ZURUECKGEWIESEN}
BEARBEITBAR_BUERO = {S.ENTWURF, S.ZURUECKGEWIESEN, S.EINGEREICHT, S.VEROEFFENTLICHT}
FRIST_TEILEN = {S.VEROEFFENTLICHT, S.ABGESCHLOSSEN}


def heute() -> datetime.date:
    return timezone.localdate()


def _datum(wert) -> datetime.date:
    try:
        return datetime.date.fromisoformat(str(wert))
    except ValueError:
        raise ValidationError({"datum": "Datum im Format JJJJ-MM-TT erwartet."})


def _uhrzeit(wert):
    if wert in (None, ""):
        return None
    try:
        return datetime.time.fromisoformat(str(wert))
    except ValueError:
        raise ValidationError({"uhrzeit": "Uhrzeit im Format HH:MM erwartet."})


def _max(wert):
    if wert in (None, ""):
        return None
    if isinstance(wert, bool) or not isinstance(wert, int) or wert < 1 or wert > 100000:
        raise ValidationError({"max_teilnehmer": "Ganze Zahl ab 1 erwartet."})
    return wert


def oeffentliche_url(request, v: Veranstaltung) -> str:
    return request.build_absolute_uri(reverse("regionen:oeffentlich", args=[v.id]))


def teilen_texte(v: Veranstaltung, url: str) -> dict:
    """Vorbereitete Texte für WhatsApp, Instagram u. a. — kein automatisches Posten."""
    tag = v.datum.strftime("%d.%m.%Y")
    zeit_de = f", {v.uhrzeit.strftime('%H:%M')} Uhr" if v.uhrzeit else ""
    zeit_fr = f" à {v.uhrzeit.strftime('%H:%M')}" if v.uhrzeit else ""
    return {
        "de": f"{v.titel} – CID {v.region.name}: {tag}{zeit_de}, {v.ort}. Komm vorbei! {url}",
        "fr": (
            f"{v.titel} – CID {v.region.name} : le {tag}{zeit_fr}, {v.ort}. "
            f"Venez nombreux ! {url}"
        ),
    }


def veranstaltung_dict(request, v: Veranstaltung, *, bearbeiter: bool, verwalter: bool) -> dict:
    user = request.user
    zahl = getattr(v, "zahl", None)
    if zahl is None:
        zahl = v.teilnahmen.count()
    angemeldet = v.teilnahmen.filter(user=user).exists()
    daten = {
        "id": str(v.id),
        "region": {"slug": v.region.slug, "name": v.region.name},
        "titel": v.titel,
        "beschreibung": v.beschreibung,
        "datum": v.datum.isoformat(),
        "uhrzeit": v.uhrzeit.strftime("%H:%M") if v.uhrzeit else None,
        "ort": v.ort,
        "standort": {"id": str(v.standort_id), "name": v.standort.name} if v.standort_id else None,
        "bild_url": _url(v.bild),
        "max_teilnehmer": v.max_teilnehmer,
        "status": v.status,
        "ablehngrund": v.ablehngrund if bearbeiter else "",
        "ersteller_name": v.ersteller_name,
        "teilnehmer_zahl": zahl,
        "angemeldet": angemeldet,
        "kann_anmelden": v.status == S.VEROEFFENTLICHT
        and v.datum >= heute()
        and (v.max_teilnehmer is None or zahl < v.max_teilnehmer or angemeldet),
        "darf_bearbeiten": bearbeiter
        and (
            v.status in BEARBEITBAR_BUERO if verwalter else v.status in BEARBEITBAR_VERANTWORTLICHE
        ),
        "darf_einreichen": bearbeiter and v.status in BEARBEITBAR_VERANTWORTLICHE,
        "darf_freigeben": verwalter and v.status == S.EINGEREICHT,
        "darf_absagen": bearbeiter and v.status == S.VEROEFFENTLICHT,
        "darf_anwesenheit": bearbeiter and v.status == S.VEROEFFENTLICHT and v.datum <= heute(),
        "darf_abschliessen": verwalter and v.status == S.VEROEFFENTLICHT and v.datum <= heute(),
        "darf_teilnehmer_sehen": bearbeiter,
    }
    if v.status in FRIST_TEILEN:
        url = oeffentliche_url(request, v)
        daten["oeffentliche_url"] = url
        daten["teilen"] = teilen_texte(v, url)
    if v.status == S.ABGESCHLOSSEN and bearbeiter:
        daten["anwesende_zahl"] = v.teilnahmen.filter(anwesend=True).count()
    return daten


def _rechte(request, region):
    verwalter = services.ist_personenverwalter(request.user)
    return verwalter or services.darf_bearbeiten(request.user, region), verwalter


def _veranstaltung(slug, pk):
    region = _region(slug)
    return region, get_object_or_404(
        Veranstaltung.objects.select_related("region", "standort"), pk=pk, region=region
    )


def _sichtbar(request, v, bearbeiter):
    if not bearbeiter and v.status not in {S.VEROEFFENTLICHT, S.ABGESCHLOSSEN, S.ABGESAGT}:
        raise Http404()


def _felder(daten, region, v=None) -> dict:
    erg = {}
    if v is None or "titel" in daten:
        erg["titel"] = _text(daten, "titel", 150, pflicht=True)
    if v is None or "datum" in daten:
        erg["datum"] = _datum(daten.get("datum"))
    if v is None or "ort" in daten:
        erg["ort"] = _text(daten, "ort", 200, pflicht=True)
    if "beschreibung" in daten:
        erg["beschreibung"] = _text(daten, "beschreibung", 4000)
    if "uhrzeit" in daten:
        erg["uhrzeit"] = _uhrzeit(daten.get("uhrzeit"))
    if "max_teilnehmer" in daten:
        erg["max_teilnehmer"] = _max(daten.get("max_teilnehmer"))
    if "standort" in daten:
        erg["standort"] = _standort(region, daten.get("standort"))
    return erg


class VeranstaltungenView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        region = _region(slug)
        bearbeiter, verwalter = _rechte(request, region)
        liste = region.veranstaltungen.select_related("region", "standort").annotate(
            zahl=Count("teilnahmen")
        )
        if not bearbeiter:
            liste = liste.filter(status__in=[S.VEROEFFENTLICHT, S.ABGESCHLOSSEN, S.ABGESAGT])
        if request.query_params.get("zeit") == "kommend":
            liste = liste.filter(datum__gte=heute())
        elif request.query_params.get("zeit") == "vergangen":
            liste = liste.filter(datum__lt=heute()).order_by("-datum")
        return Response(
            {
                "ergebnisse": [
                    veranstaltung_dict(request, v, bearbeiter=bearbeiter, verwalter=verwalter)
                    for v in liste[:100]
                ]
            }
        )

    def post(self, request, slug):
        region = _bearbeitbar(request, slug)
        felder = _felder(request.data, region)
        karte = region.verantwortliche.filter(user=request.user).first()
        v = Veranstaltung.objects.create(
            region=region,
            erstellt_von=request.user,
            ersteller_name=karte.anzeige_name if karte else services.anzeigename_von(request.user),
            **felder,
        )
        return Response(
            veranstaltung_dict(
                request, v, bearbeiter=True, verwalter=services.ist_personenverwalter(request.user)
            ),
            status=201,
        )


class VeranstaltungDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug, pk):
        region, v = _veranstaltung(slug, pk)
        bearbeiter, verwalter = _rechte(request, region)
        _sichtbar(request, v, bearbeiter)
        return Response(veranstaltung_dict(request, v, bearbeiter=bearbeiter, verwalter=verwalter))

    def patch(self, request, slug, pk):
        region, v = _veranstaltung(slug, pk)
        bearbeiter, verwalter = _rechte(request, region)
        erlaubt = BEARBEITBAR_BUERO if verwalter else BEARBEITBAR_VERANTWORTLICHE
        if not bearbeiter:
            raise PermissionDenied()
        if v.status not in erlaubt:
            raise ValidationError({"status": "In diesem Zustand nicht mehr änderbar."})
        for feld, wert in _felder(request.data, region, v).items():
            setattr(v, feld, wert)
        v.save()
        return Response(veranstaltung_dict(request, v, bearbeiter=True, verwalter=verwalter))

    def delete(self, request, slug, pk):
        region, v = _veranstaltung(slug, pk)
        bearbeiter, verwalter = _rechte(request, region)
        if not bearbeiter:
            raise PermissionDenied()
        if v.status not in {S.ENTWURF, S.ZURUECKGEWIESEN}:
            raise ValidationError({"status": "Nur Entwürfe können gelöscht werden."})
        if v.bild:
            v.bild.delete(save=False)
        v.delete()
        return Response(status=204)


class VeranstaltungBildView(APIView):
    permission_classes = [IsAuthenticated]

    def _holen(self, request, slug, pk):
        region, v = _veranstaltung(slug, pk)
        bearbeiter, verwalter = _rechte(request, region)
        erlaubt = BEARBEITBAR_BUERO if verwalter else BEARBEITBAR_VERANTWORTLICHE
        if not bearbeiter:
            raise PermissionDenied()
        if v.status not in erlaubt:
            raise ValidationError({"status": "In diesem Zustand nicht mehr änderbar."})
        return v, verwalter

    def post(self, request, slug, pk):
        v, verwalter = self._holen(request, slug, pk)
        bild = _bild(request, "bild")
        if v.bild:
            v.bild.delete(save=False)
        v.bild = bild
        v.save()
        return Response(veranstaltung_dict(request, v, bearbeiter=True, verwalter=verwalter))

    def delete(self, request, slug, pk):
        v, verwalter = self._holen(request, slug, pk)
        if v.bild:
            v.bild.delete(save=False)
            v.bild = None
            v.save()
        return Response(veranstaltung_dict(request, v, bearbeiter=True, verwalter=verwalter))


def _melde(user, de, fr, v):
    melden(
        user,
        TypeNotification.REGION_VERANSTALTUNG,
        de=de,
        fr=fr,
        lien=f"/regionen/{v.region.slug}",
    )


class VeranstaltungAktionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, pk):
        region, v = _veranstaltung(slug, pk)
        bearbeiter, verwalter = _rechte(request, region)
        aktion = request.data.get("aktion")
        if not bearbeiter:
            raise PermissionDenied()
        handler = {
            "einreichen": self._einreichen,
            "freigeben": self._freigeben,
            "zurueckweisen": self._zurueckweisen,
            "absagen": self._absagen,
            "abschliessen": self._abschliessen,
        }.get(aktion)
        if handler is None:
            raise ValidationError({"aktion": "Unbekannte Aktion."})
        if aktion in {"freigeben", "zurueckweisen", "abschliessen"} and not verwalter:
            raise PermissionDenied()
        with transaction.atomic():
            v = (
                Veranstaltung.objects.select_for_update(of=("self",))
                .select_related("region")
                .get(pk=v.pk)
            )
            handler(request, v)
        v.refresh_from_db()
        return Response(veranstaltung_dict(request, v, bearbeiter=True, verwalter=verwalter))

    @staticmethod
    def _pruefen(v, erlaubt, text):
        if v.status not in erlaubt:
            raise ValidationError({"status": text})

    def _einreichen(self, request, v):
        self._pruefen(v, BEARBEITBAR_VERANTWORTLICHE, "Nur Entwürfe können eingereicht werden.")
        if v.datum < heute():
            raise ValidationError({"datum": "Das Datum liegt in der Vergangenheit."})
        v.status = S.EINGEREICHT
        v.ablehngrund = ""
        v.eingereicht_am = timezone.now()
        v.save()
        for user in services.buero_nutzer(ausser=request.user.id):
            _melde(
                user,
                ("Veranstaltung zur Freigabe", f"{v.region.name}: {v.titel} wartet auf Freigabe."),
                ("Réunion à valider", f"{v.region.name} : {v.titel} attend sa validation."),
                v,
            )

    def _freigeben(self, request, v):
        self._pruefen(
            v, {S.EINGEREICHT}, "Nur eingereichte Veranstaltungen können freigegeben werden."
        )
        v.status = S.VEROEFFENTLICHT
        v.entschieden_von = request.user
        v.veroeffentlicht_am = timezone.now()
        v.save()
        _melde(
            v.erstellt_von,
            ("Veranstaltung freigegeben", f"„{v.titel}“ ist jetzt veröffentlicht."),
            ("Réunion validée", f"« {v.titel} » est maintenant publiée."),
            v,
        )

    def _zurueckweisen(self, request, v):
        self._pruefen(
            v, {S.EINGEREICHT}, "Nur eingereichte Veranstaltungen können zurückgewiesen werden."
        )
        v.ablehngrund = _text(request.data, "grund", 200, pflicht=True)
        v.status = S.ZURUECKGEWIESEN
        v.entschieden_von = request.user
        v.save()
        _melde(
            v.erstellt_von,
            ("Veranstaltung zurückgewiesen", f"„{v.titel}“: {v.ablehngrund}"),
            ("Réunion refusée", f"« {v.titel} » : {v.ablehngrund}"),
            v,
        )

    def _absagen(self, request, v):
        self._pruefen(
            v, {S.VEROEFFENTLICHT}, "Nur veröffentlichte Veranstaltungen können abgesagt werden."
        )
        v.status = S.ABGESAGT
        v.save()
        for t in v.teilnahmen.select_related("user"):
            _melde(
                t.user,
                ("Veranstaltung abgesagt", f"„{v.titel}“ am {v.datum:%d.%m.%Y} fällt aus."),
                ("Réunion annulée", f"« {v.titel} » du {v.datum:%d.%m.%Y} est annulée."),
                v,
            )

    def _abschliessen(self, request, v):
        self._pruefen(
            v,
            {S.VEROEFFENTLICHT},
            "Nur veröffentlichte Veranstaltungen können abgeschlossen werden.",
        )
        if v.datum > heute():
            raise ValidationError({"datum": "Das Treffen hat noch nicht stattgefunden."})
        v.status = S.ABGESCHLOSSEN
        v.abgeschlossen_am = timezone.now()
        v.save()


class AnmeldungView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, slug, pk):
        region, v0 = _veranstaltung(slug, pk)
        aktiv = request.data.get("aktiv", True)
        if not isinstance(aktiv, bool):
            raise ValidationError({"aktiv": "Ja/Nein erwartet."})
        bearbeiter, verwalter = _rechte(request, region)
        with transaction.atomic():
            v = (
                Veranstaltung.objects.select_for_update(of=("self",))
                .select_related("region", "standort")
                .get(pk=v0.pk)
            )
            if v.status != S.VEROEFFENTLICHT:
                _sichtbar(request, v, bearbeiter)
                raise ValidationError({"status": "Anmeldung ist nicht möglich."})
            if v.datum < heute():
                raise ValidationError({"datum": "Das Treffen hat bereits stattgefunden."})
            if aktiv:
                bestehend = v.teilnahmen.filter(user=request.user).exists()
                if (
                    not bestehend
                    and v.max_teilnehmer is not None
                    and v.teilnahmen.count() >= v.max_teilnehmer
                ):
                    raise ValidationError({"max_teilnehmer": "Das Treffen ist ausgebucht."})
                Teilnahme.objects.get_or_create(veranstaltung=v, user=request.user)
            else:
                v.teilnahmen.filter(user=request.user).delete()
        return Response(veranstaltung_dict(request, v, bearbeiter=bearbeiter, verwalter=verwalter))


def _teilnehmer_dict(t: Teilnahme, verwalter: bool) -> dict:
    name = services.anzeigename_von(t.user)
    return {
        "user": str(t.user_id),
        "name": name or (t.user.email if verwalter else ""),
        "anwesend": t.anwesend,
    }


class TeilnehmerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug, pk):
        region, v = _veranstaltung(slug, pk)
        bearbeiter, verwalter = _rechte(request, region)
        if not bearbeiter:
            raise PermissionDenied()
        liste = v.teilnahmen.select_related("user", "user__membre")
        return Response({"ergebnisse": [_teilnehmer_dict(t, verwalter) for t in liste]})


class AnwesenheitView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, slug, pk, user_id):
        region, v = _veranstaltung(slug, pk)
        bearbeiter, verwalter = _rechte(request, region)
        if not bearbeiter:
            raise PermissionDenied()
        anwesend = request.data.get("anwesend")
        if not isinstance(anwesend, bool):
            raise ValidationError({"anwesend": "Ja/Nein erwartet."})
        if v.status != S.VEROEFFENTLICHT:
            raise ValidationError(
                {"status": "Anwesenheit nur bei veröffentlichten, nicht abgeschlossenen Treffen."}
            )
        if v.datum > heute():
            raise ValidationError({"datum": "Das Treffen hat noch nicht stattgefunden."})
        t = get_object_or_404(
            Teilnahme.objects.select_related("user"), veranstaltung=v, user_id=user_id
        )
        t.anwesend = anwesend
        t.save(update_fields=["anwesend"])
        return Response(_teilnehmer_dict(t, verwalter))


class ZurFreigabeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not services.ist_personenverwalter(request.user):
            raise PermissionDenied()
        liste = (
            Veranstaltung.objects.filter(status=S.EINGEREICHT, region__aktiv=True)
            .select_related("region", "standort")
            .annotate(zahl=Count("teilnahmen"))
            .order_by("datum")
        )
        return Response(
            {
                "ergebnisse": [
                    veranstaltung_dict(request, v, bearbeiter=True, verwalter=True) for v in liste
                ]
            }
        )


class OeffentlichView(APIView):
    """Öffentliche Seite ohne Anmeldung : nur Veranstaltungsdaten, keine Teilnehmer.
    Enthält Open-Graph-Angaben für die Linkvorschau (WhatsApp, Facebook, X …)."""

    authentication_classes: list = []
    permission_classes: list = []

    def get(self, request, pk):
        v = get_object_or_404(
            Veranstaltung.objects.select_related("region", "standort"),
            pk=pk,
            status__in=list(FRIST_TEILEN) + [S.ABGESAGT],
        )
        url = oeffentliche_url(request, v)
        from django.conf import settings

        kontext = {
            "v": v,
            "url": url,
            "app_url": f"{settings.FRONTEND_URL.rstrip('/')}/regionen/{v.region.slug}",
            "bild_url": _url(v.bild),
            "abgesagt": v.status == S.ABGESAGT,
            "beendet": v.status == S.ABGESCHLOSSEN,
            "teilen": teilen_texte(v, url),
        }
        antwort = render(request, "regionen/veranstaltung_oeffentlich.html", kontext)
        antwort["X-Robots-Tag"] = "noindex"
        return antwort
