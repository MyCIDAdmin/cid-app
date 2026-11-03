"""API der App wahlen (Präfix /api/v1/wahlen/)."""

import csv

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from apps.membres.models import Membre

from . import mitteilungen, pdf, services, wahlgaenge, wahltermine
from .models import (
    AmtPerson,
    Aufbewahrung,
    AusschussMitglied,
    Bekanntmachung,
    Einspruch,
    EinspruchArt,
    Entscheidung,
    KandidatPerson,
    Kandidatur,
    KandidaturStatus,
    Mitteilung,
    Nachweis,
    Pruefpunkt,
    Reglement,
    Wahl,
    WahlStatus,
    WahlTermin,
)
from .serializers import (
    EinspruchEingabe,
    EinspruchEntscheidungEingabe,
    EntscheidungEingabe,
    FotoSerializer,
    KandidaturSchreibenSerializer,
    NachweisSerializer,
    PruefpunktEingabe,
    WahlSchreibenSerializer,
    bekanntmachung_dict,
    einspruch_dict,
    kandidatur_dossier,
    kandidatur_oeffentlich,
    protokoll_dict,
    reglement_dict,
)


def _csv_sicher(text: str) -> str:
    """Schutz vor Formel-Einschleusung beim Öffnen in Tabellenprogrammen."""
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def wahl_dict(wahl: Wahl, user) -> dict:
    membre = services.membre_von(user)
    ausschuss = services.ist_ausschuss(user, wahl)
    verwaltung = services.verwaltet(user)
    session = wahl.vote_session
    eigene = (
        wahl.kandidaturen.filter(einreicher=membre)
        .exclude(status=KandidaturStatus.ZURUECKGEZOGEN)
        .first()
        if membre
        else None
    )
    freigaben = {}
    if ausschuss or verwaltung:
        for art in ("oeffnen", "schliessen", "ergebnis"):
            freigaben[art] = [f.user_id for f in wahl.freigaben.filter(art=art)]
    folge = wahl.folgewahlen.order_by("created_at").first()
    folgewahl = (
        {"id": str(folge.id), "titel": folge.titel, "status": folge.status}
        if folge and (ausschuss or verwaltung or folge.status != WahlStatus.ENTWURF)
        else None
    )
    return {
        "id": str(wahl.id),
        "titel": wahl.titel,
        "beschreibung": wahl.beschreibung,
        "form": wahl.form,
        "mehrheit": wahl.mehrheit,
        "status": wahl.status,
        "phase": wahl.phase,
        "phase_name": wahl.phase_name,
        "listen_groesse": wahl.listen_groesse,
        "posten": wahl.posten,
        "unterstuetzungen_noetig": wahl.unterstuetzungen_noetig,
        "zustimmungen_noetig": wahl.zustimmungen_noetig,
        "termine": {
            "ankuendigung_am": wahl.ankuendigung_am,
            "kandidatur_von": wahl.kandidatur_von,
            "kandidatur_bis": wahl.kandidatur_bis,
            "pruefung_bis": wahl.pruefung_bis,
            "kampagne_bis": wahl.kampagne_bis,
            "wahl_von": wahl.wahl_von,
            "wahl_bis": wahl.wahl_bis,
            "einspruch_bis": wahl.einspruch_bis,
            "uebergabe_bis": wahl.uebergabe_bis,
        },
        "aufbewahrung": wahl.aufbewahrung,
        "vote_session": str(session.id) if session else None,
        "vote_status": session.statut if session else None,
        "ergebnis_freigegeben": wahl.ergebnis_freigegeben_am is not None,
        "einspruch_ergebnis_bis": services.einspruch_fenster_ende(
            wahl, EinspruchArt.ERGEBNIS, None
        ),
        "ist_ausschuss": ausschuss,
        "kann_verwalten": verwaltung,
        "meine_kandidatur": str(eigene.id) if eigene else None,
        "ausschuss": [
            {
                "membre": str(a.membre_id),
                "name": f"{a.membre.prenom} {a.membre.nom}",
                "user": a.membre.user_id,
            }
            for a in wahl.ausschuss.select_related("membre")
        ],
        "freigaben": freigaben,
        "runde": wahl.runde,
        "vorgaenger": (
            {"id": str(wahl.vorgaenger_id), "titel": wahl.vorgaenger.titel}
            if wahl.vorgaenger_id
            else None
        ),
        "folgewahl": folgewahl,
        "ids_zugelassen": (
            [str(k.id) for k in wahl.kandidaturen.filter(status=KandidaturStatus.ZUGELASSEN)]
            if (wahl.phase >= 3 or ausschuss or verwaltung)
            else []
        ),
    }


class WahlViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
    mixins.UpdateModelMixin, GenericViewSet,
):  # fmt: skip
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    serializer_class = WahlSchreibenSerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_queryset(self):
        qs = Wahl.objects.select_related("vote_session")
        user = self.request.user
        if services.verwaltet(user):
            return qs
        sichtbar = qs.exclude(status=WahlStatus.ENTWURF)
        membre = services.membre_von(user)
        if membre:
            sichtbar = sichtbar | qs.filter(ausschuss__membre=membre)
        return sichtbar.distinct()

    def list(self, request, *args, **kwargs):
        return Response([wahl_dict(w, request.user) for w in self.get_queryset()])

    def retrieve(self, request, *args, **kwargs):
        wahl = self.get_object()
        daten = wahl_dict(wahl, request.user)
        daten["teilnahme"] = services.meine_teilnahme(wahl, services.membre_von(request.user))
        return Response(daten)

    def _nur_verwaltung(self):
        if not services.verwaltet(self.request.user):
            raise PermissionDenied("Nur Büro und App-Admin dürfen Wahlen anlegen und ändern.")

    def create(self, request, *args, **kwargs):
        self._nur_verwaltung()
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        wahl = Wahl.objects.create(created_by=request.user, **ser.validated_data)
        services.bekanntmachungen_anlegen(wahl)
        mitteilungen.planen(wahl)
        return Response(wahl_dict(wahl, request.user), status=201)

    def partial_update(self, request, *args, **kwargs):
        self._nur_verwaltung()
        wahl = self.get_object()
        ser = self.get_serializer(wahl, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        mitteilungen.planen(wahl)
        return Response(wahl_dict(wahl, request.user))

    @action(detail=True, methods=["post"])
    def folgewahl(self, request, pk=None):
        """Legt den weiteren Wahlgang als Entwurf an (geschieht beim Veröffentlichen des
        Ergebnisses von selbst; hier für ältere Ergebnisse oder nach Löschen des Entwurfs)."""
        wahl = self.get_object()
        if not services.ausschuss_oder_verwaltung(request.user, wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        neu, angelegt = wahlgaenge.folgewahl_anlegen(wahl, request.user)
        return Response(wahl_dict(neu, request.user), status=201 if angelegt else 200)

    @action(detail=True, methods=["post"])
    def probewahl(self, request, pk=None):
        """Trockenlauf mit erfundenen Stimmen; nichts wird gespeichert oder versendet."""
        wahl = self.get_object()
        if not services.ausschuss_oder_verwaltung(request.user, wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        try:
            stimmen = int(request.data.get("stimmen", 40))
            seed = request.data.get("seed")
            seed = int(seed) if seed not in (None, "") else None
        except (TypeError, ValueError):
            raise ValidationError({"stimmen": "Bitte Zahlen angeben."})
        return Response(
            wahlgaenge.probewahl(
                wahl, request.user, stimmen, request.data.get("szenario", "zufall"), seed
            )
        )

    @action(detail=True, methods=["get"], url_path="mitteilungsplan")
    def mitteilungsplan(self, request, pk=None):
        """Alle Auslöser der Wahl mit Zeitpunkt, Zielgruppe, Kanälen und Stand (nur Ausschuss)."""
        wahl = self.get_object()
        if not services.ausschuss_oder_verwaltung(request.user, wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        return Response(mitteilungen.plan(wahl))

    @action(detail=True, methods=["post"])
    def veroeffentlichen(self, request, pk=None):
        self._nur_verwaltung()
        wahl = self.get_object()
        if wahl.ausschuss.count() < 3:
            raise ValidationError(
                {"ausschuss": "Der Ausschuss braucht mindestens drei Mitglieder."}
            )
        wahl.status = WahlStatus.AKTIV
        wahl.save(update_fields=["status"])
        wahltermine.wahl_veroeffentlicht(wahl)
        return Response(wahl_dict(wahl, request.user))

    @action(detail=True, methods=["post"], url_path="ausschuss")
    def ausschuss_hinzu(self, request, pk=None):
        self._nur_verwaltung()
        wahl = self.get_object()
        membre = get_object_or_404(Membre, pk=request.data.get("membre"))
        if wahl.ausschuss.count() >= 5:
            raise ValidationError({"membre": "Höchstens fünf Mitglieder."})
        if KandidatPerson.objects.filter(kandidatur__wahl=wahl, membre=membre).exists():
            raise ValidationError({"membre": "Wer kandidiert, kann nicht im Ausschuss sein."})
        if membre.user_id is None:
            raise ValidationError({"membre": "Das Mitglied hat noch kein Konto."})
        AusschussMitglied.objects.get_or_create(wahl=wahl, membre=membre)
        return Response(wahl_dict(wahl, request.user))

    @action(detail=True, methods=["delete"], url_path=r"ausschuss/(?P<membre_id>[^/.]+)")
    def ausschuss_weg(self, request, pk=None, membre_id=None):
        self._nur_verwaltung()
        wahl = self.get_object()
        wahl.ausschuss.filter(membre_id=membre_id).delete()
        return Response(wahl_dict(wahl, request.user))

    @action(detail=True, methods=["post"])
    def aufbewahrung(self, request, pk=None):
        wahl = self.get_object()
        if not services.ausschuss_oder_verwaltung(request.user, wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        wert = request.data.get("aufbewahrung")
        if wert not in Aufbewahrung.values:
            raise ValidationError({"aufbewahrung": "Unbekannter Wert."})
        wahl.aufbewahrung = wert
        wahl.save(update_fields=["aufbewahrung"])
        return Response(wahl_dict(wahl, request.user))

    @action(detail=True, methods=["post"])
    def freigabe(self, request, pk=None):
        wahl = self.get_object()
        ergebnis = services.freigabe_geben(wahl, request.user, request.data.get("art", ""))
        wahl.refresh_from_db()
        return Response({**ergebnis, "wahl": wahl_dict(wahl, request.user)})

    @action(detail=True, methods=["get"])
    def ergebnis(self, request, pk=None):
        wahl = self.get_object()
        ausschuss = services.ausschuss_oder_verwaltung(request.user, wahl)
        session = wahl.vote_session
        if wahl.ergebnis_freigegeben_am and session:
            daten = services.ergebnis_auswerten(wahl)
            return Response(
                {
                    "freigegeben": True,
                    "freigegeben_am": wahl.ergebnis_freigegeben_am,
                    "weiterer_wahlgang": wahlgaenge.folgewahl_moeglich(wahl, daten),
                    **daten,
                }
            )
        antwort = {"freigegeben": False, "beendet": bool(session and session.statut == "cloturee")}
        if ausschuss:
            antwort["beteiligung"] = services.beteiligung_laufend(wahl)
        return Response(antwort)

    @action(detail=True, methods=["get"])
    def protokoll(self, request, pk=None):
        wahl = self.get_object()
        daten = protokoll_dict(wahl) if wahl.ergebnis_freigegeben_am else None
        if daten is None:
            raise NotFound("Es gibt noch kein Protokoll.")
        return Response(daten)

    @action(detail=True, methods=["post"], url_path="protokoll/unterschreiben")
    def protokoll_unterschreiben(self, request, pk=None):
        wahl = self.get_object()
        services.protokoll_unterschreiben(wahl, request.user)
        wahl.refresh_from_db()
        return Response(protokoll_dict(wahl))

    @action(detail=True, methods=["get"], url_path="protokoll/pdf")
    def protokoll_pdf(self, request, pk=None):
        wahl = self.get_object()
        if not wahl.ergebnis_freigegeben_am or protokoll_dict(wahl) is None:
            raise NotFound("Es gibt noch kein Protokoll.")
        antwort = HttpResponse(pdf.protokoll_pdf(wahl), content_type="application/pdf")
        antwort["Content-Disposition"] = 'inline; filename="wahlprotokoll.pdf"'
        return antwort

    # ---- Wahlbüro (Ausschuss und Büro)
    def _intern(self, wahl):
        if not services.ausschuss_oder_verwaltung(self.request.user, wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")

    @action(detail=True, methods=["get"])
    def beteiligung(self, request, pk=None):
        wahl = self.get_object()
        self._intern(wahl)
        return Response(services.beteiligung_liste(wahl))

    @action(detail=True, methods=["get"], url_path="beteiligung/export")
    def beteiligung_export(self, request, pk=None):
        wahl = self.get_object()
        self._intern(wahl)
        daten = services.beteiligung_liste(wahl)
        antwort = HttpResponse(content_type="text/csv; charset=utf-8")
        antwort["Content-Disposition"] = 'attachment; filename="beteiligung.csv"'
        antwort.write("\ufeff")
        schreiber = csv.writer(antwort, delimiter=";")
        schreiber.writerow(["Name", "Hat abgestimmt"])
        for e in daten["eintraege"]:
            schreiber.writerow([_csv_sicher(e["name"]), "ja" if e["hat_gewaehlt"] else "nein"])
        return antwort

    @action(detail=True, methods=["get"])
    def wahlzettel(self, request, pk=None):
        wahl = self.get_object()
        if not services.ausschuss_oder_verwaltung(request.user, wahl) and not (
            wahl.vote_session_id or wahl.phase >= 3
        ):
            raise PermissionDenied("Der Stimmzettel ist noch nicht veröffentlicht.")
        return Response(services.wahlzettel(wahl))

    @action(detail=True, methods=["get"])
    def uebergabe(self, request, pk=None):
        wahl = self.get_object()
        self._intern(wahl)
        return Response(services.uebergabe_stand(wahl))

    @action(detail=True, methods=["post"], url_path=r"uebergabe/(?P<schluessel>[a-z_]+)")
    def uebergabe_punkt(self, request, pk=None, schluessel=None):
        wahl = self.get_object()
        services.uebergabe_setzen(
            request.user,
            wahl,
            schluessel,
            bool(request.data.get("erledigt", True)),
            str(request.data.get("notiz", "")),
        )
        return Response(services.uebergabe_stand(wahl))

    @action(detail=True, methods=["get"])
    def waehlbarkeit(self, request, pk=None):
        wahl = self.get_object()
        membre = get_object_or_404(Membre, pk=request.query_params.get("membre"))
        amt = request.query_params.get("amt", AmtPerson.KANDIDAT)
        ergebnis = services.waehlbarkeit(wahl, membre, amt)
        return Response({**ergebnis, "name": f"{membre.prenom} {membre.nom}"})


class KandidaturViewSet(GenericViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Kandidatur.objects.select_related("wahl", "einreicher__user").prefetch_related(
        "personen__membre", "personen__nachweise", "nachweise", "pruefpunkte", "unterstuetzungen"
    )
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    # ---- Sichtbarkeit
    def _kann_sehen(self, k: Kandidatur, user) -> str | None:
        """ "voll" (Einreicher, Ausschuss, Büro) oder "oeffentlich" (zugelassen, veröffentlicht)."""
        if services.ausschuss_oder_verwaltung(user, k.wahl):
            return (
                "voll" if k.status != KandidaturStatus.ENTWURF or services.verwaltet(user) else None
            )
        membre = services.membre_von(user)
        if membre and (k.einreicher_id == membre.id or k.personen.filter(membre=membre).exists()):
            return "voll"
        if k.status == KandidaturStatus.ZUGELASSEN and k.wahl.phase >= 3:
            return "oeffentlich"
        return None

    def _objekt(self, pk, user, *, voll=False) -> Kandidatur:
        k = get_object_or_404(self.queryset, pk=pk)
        sicht = self._kann_sehen(k, user)
        if sicht is None or (voll and sicht != "voll"):
            raise PermissionDenied("Kein Zugriff auf diese Kandidatur.")
        return k

    def _bearbeitbar(self, k: Kandidatur, user) -> Membre:
        membre = services.pflicht_membre(user)
        if k.einreicher_id != membre.id:
            raise PermissionDenied("Nur die einreichende Person darf das ändern.")
        if k.status not in (KandidaturStatus.ENTWURF, KandidaturStatus.RUECKFRAGE):
            raise ValidationError({"status": "Die Kandidatur ist schon eingereicht."})
        return membre

    def _antwort(self, k: Kandidatur, user, code=200):
        k = get_object_or_404(self.queryset, pk=k.pk)
        return Response(kandidatur_dossier(k, user), status=code)

    def list(self, request):
        wahl = get_object_or_404(Wahl, pk=request.query_params.get("wahl"))
        daten = []
        for k in self.queryset.filter(wahl=wahl):
            sicht = self._kann_sehen(k, request.user)
            if sicht == "voll":
                daten.append(kandidatur_dossier(k, request.user))
            elif sicht == "oeffentlich":
                daten.append(kandidatur_oeffentlich(k))
        return Response(daten)

    def retrieve(self, request, pk=None):
        k = self._objekt(pk, request.user)
        if self._kann_sehen(k, request.user) == "voll":
            return Response(kandidatur_dossier(k, request.user))
        return Response(kandidatur_oeffentlich(k))

    # ---- Anlegen und Bearbeiten
    @transaction.atomic
    def create(self, request):
        wahl = get_object_or_404(Wahl, pk=request.data.get("wahl"))
        membre = services.pflicht_membre(request.user)
        heute = timezone.localdate()
        if wahl.status != WahlStatus.AKTIV or not (
            wahl.kandidatur_von <= heute <= wahl.kandidatur_bis
        ):
            raise ValidationError({"wahl": "Zurzeit kann nicht kandidiert werden."})
        if wahl.ausschuss.filter(membre=membre).exists():
            raise ValidationError({"wahl": "Ausschussmitglieder können nicht kandidieren."})
        if (
            wahl.kandidaturen.filter(einreicher=membre)
            .exclude(status__in=[KandidaturStatus.ZURUECKGEZOGEN, KandidaturStatus.ABGELEHNT])
            .exists()
        ):
            raise ValidationError({"wahl": "Du hast hier schon eine Kandidatur."})
        k = Kandidatur.objects.create(wahl=wahl, einreicher=membre, programm=["", "", ""])
        if wahl.art == "person":
            KandidatPerson.objects.create(kandidatur=k, membre=membre, amt=AmtPerson.KANDIDAT)
        elif wahl.art == "liste":
            KandidatPerson.objects.create(kandidatur=k, membre=membre, amt=AmtPerson.PRAESIDENT)
        services.pruefpunkte_sicherstellen(k)
        return self._antwort(k, request.user, 201)

    @transaction.atomic
    def partial_update(self, request, pk=None):
        k = self._objekt(pk, request.user, voll=True)
        self._bearbeitbar(k, request.user)
        ser = KandidaturSchreibenSerializer(data=request.data, context={"wahl": k.wahl})
        ser.is_valid(raise_exception=True)
        daten = dict(ser.validated_data)
        personen = daten.pop("personen", None)
        for feld, wert in daten.items():
            setattr(k, feld, wert)
        k.save()
        if personen is not None and k.wahl.art == "liste":
            vorhanden = {str(p.membre_id): p for p in k.personen.all()}
            neu_ids = {str(p["membre"]) for p in personen}
            for mid, p in vorhanden.items():
                if mid not in neu_ids:
                    p.delete()
            for i, p in enumerate(personen):
                mid = str(p["membre"])
                if mid in vorhanden:
                    vorhanden[mid].amt, vorhanden[mid].reihenfolge = p["amt"], i
                    vorhanden[mid].save(update_fields=["amt", "reihenfolge"])
                else:
                    if k.wahl.ausschuss.filter(membre_id=mid).exists():
                        raise ValidationError(
                            {"personen": "Ausschussmitglieder können nicht antreten."}
                        )
                    KandidatPerson.objects.create(
                        kandidatur=k, membre_id=mid, amt=p["amt"], reihenfolge=i
                    )
        return self._antwort(k, request.user)

    @action(detail=True, methods=["post"])
    def foto(self, request, pk=None):
        k = self._objekt(pk, request.user, voll=True)
        self._bearbeitbar(k, request.user)
        person = get_object_or_404(k.personen, pk=request.data.get("person"))
        ser = FotoSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if person.foto:
            person.foto.delete(save=False)
        person.foto = ser.validated_data["foto"]
        person.save()
        return self._antwort(k, request.user)

    @action(detail=True, methods=["post"])
    def nachweis(self, request, pk=None):
        k = self._objekt(pk, request.user, voll=True)
        self._bearbeitbar(k, request.user)
        ser = NachweisSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        person = None
        if ser.validated_data.get("person"):
            person = get_object_or_404(k.personen, pk=ser.validated_data["person"])
        art = ser.validated_data["art"]
        Nachweis.objects.filter(kandidatur=k, person=person, art=art).delete()
        Nachweis.objects.create(
            kandidatur=k, person=person, art=art, datei=ser.validated_data["datei"]
        )
        return self._antwort(k, request.user)

    @action(detail=True, methods=["get"], url_path=r"nachweis/(?P<nachweis_id>[^/.]+)")
    def nachweis_ansehen(self, request, pk=None, nachweis_id=None):
        k = self._objekt(pk, request.user, voll=True)
        if not services.ausschuss_oder_verwaltung(request.user, k.wahl):
            raise PermissionDenied("Nachweise sieht nur der Wahlausschuss.")
        nachweis = get_object_or_404(k.nachweise, pk=nachweis_id)
        return Response({"url": nachweis.datei.url, "art": nachweis.art})

    @action(detail=True, methods=["post"])
    def unterstuetzen(self, request, pk=None):
        k = get_object_or_404(self.queryset, pk=pk)
        services.unterstuetzen(k, services.pflicht_membre(request.user))
        return (
            self._antwort(k, request.user)
            if self._kann_sehen(k, request.user) == "voll"
            else Response({"unterstuetzungen": k.unterstuetzungen.count()})
        )

    @action(detail=True, methods=["post"])
    def einreichen(self, request, pk=None):
        k = self._objekt(pk, request.user, voll=True)
        self._bearbeitbar(k, request.user)
        services.einreichen(k)
        return self._antwort(k, request.user)

    @action(detail=True, methods=["post"])
    def zurueckziehen(self, request, pk=None):
        k = self._objekt(pk, request.user, voll=True)
        membre = services.pflicht_membre(request.user)
        if k.einreicher_id != membre.id:
            raise PermissionDenied("Nur die einreichende Person.")
        if k.wahl.phase >= 3:
            raise ValidationError(
                {"status": "Ein Rückzug ist nur bis zum Ende der Prüfung möglich."}
            )
        k.status = KandidaturStatus.ZURUECKGEZOGEN
        k.save(update_fields=["status"])
        return self._antwort(k, request.user)

    # ---- Prüfverfahren (Ausschuss)
    def _ausschuss(self, k: Kandidatur, user):
        if not services.ist_ausschuss(user, k.wahl):
            raise PermissionDenied("Nur Mitglieder des Wahlausschusses.")

    @action(detail=True, methods=["post"])
    def pruefpunkt(self, request, pk=None):
        k = self._objekt(pk, request.user, voll=True)
        self._ausschuss(k, request.user)
        if k.status != KandidaturStatus.EINGEREICHT:
            raise ValidationError({"status": "Die Kandidatur wartet nicht auf Prüfung."})
        ser = PruefpunktEingabe(data=request.data)
        ser.is_valid(raise_exception=True)
        services.pruefpunkte_sicherstellen(k)
        punkt = get_object_or_404(
            Pruefpunkt, kandidatur=k, schluessel=ser.validated_data["schluessel"]
        )
        if punkt.automatisch:
            raise ValidationError({"schluessel": "Dieser Punkt wird automatisch geprüft."})
        punkt.ergebnis = ser.validated_data["ergebnis"]
        punkt.notiz = ser.validated_data.get("notiz", "")
        punkt.geprueft_von = request.user
        punkt.geprueft_am = timezone.now()
        punkt.save()
        return self._antwort(k, request.user)

    @action(detail=True, methods=["post"])
    def entscheidung(self, request, pk=None):
        k = self._objekt(pk, request.user, voll=True)
        ser = EntscheidungEingabe(data=request.data)
        ser.is_valid(raise_exception=True)
        services.entscheidung_vorschlagen(
            k,
            request.user,
            ser.validated_data["art"],
            ser.validated_data.get("begruendung", ""),
            ser.validated_data.get("artikel", ""),
        )
        return self._antwort(k, request.user)

    @action(detail=True, methods=["post"], url_path=r"entscheidung/(?P<eid>[^/.]+)/zustimmen")
    def zustimmen(self, request, pk=None, eid=None):
        k = self._objekt(pk, request.user, voll=True)
        e = get_object_or_404(Entscheidung, pk=eid, kandidatur=k)
        services.entscheidung_zustimmen(e, request.user)
        return self._antwort(k, request.user)

    @action(detail=True, methods=["post"], url_path=r"entscheidung/(?P<eid>[^/.]+)/verwerfen")
    def verwerfen(self, request, pk=None, eid=None):
        k = self._objekt(pk, request.user, voll=True)
        e = get_object_or_404(Entscheidung, pk=eid, kandidatur=k)
        services.entscheidung_verwerfen(e, request.user)
        return self._antwort(k, request.user)


class BekanntmachungViewSet(GenericViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Bekanntmachung.objects.select_related("wahl").prefetch_related("freigaben")
    parser_classes = [JSONParser]

    def _objekt(self, pk, user, *, schreiben=True) -> Bekanntmachung:
        bk = get_object_or_404(self.queryset, pk=pk)
        if schreiben and not services.ausschuss_oder_verwaltung(user, bk.wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        return bk

    def list(self, request):
        wahl = get_object_or_404(Wahl, pk=request.query_params.get("wahl"))
        if not services.ausschuss_oder_verwaltung(request.user, wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        return Response([bekanntmachung_dict(b, request.user) for b in wahl.bekanntmachungen.all()])

    def retrieve(self, request, pk=None):
        return Response(bekanntmachung_dict(self._objekt(pk, request.user), request.user))

    def partial_update(self, request, pk=None):
        bk = self._objekt(pk, request.user)
        sprache = request.data.get("sprache", "de")
        if "versand_am" in request.data or "kanaele" in request.data:
            services.bekanntmachung_bearbeitbar(bk)
            kanaele = request.data.get("kanaele", bk.kanaele)
            if not isinstance(kanaele, list) or not set(kanaele) <= {"mail", "app", "print"}:
                raise ValidationError({"kanaele": "Unbekannter Kanal."})
            bk.kanaele = kanaele
            if request.data.get("versand_am"):
                bk.versand_am = serializers.DateTimeField().run_validation(
                    request.data["versand_am"]
                )
            bk.save(update_fields=["kanaele", "versand_am"])
        if "html" in request.data or "betreff" in request.data:
            aktuell = bk.texte.get(sprache, {})
            services.text_setzen(
                bk,
                sprache,
                request.data.get("betreff", aktuell.get("betreff", "")),
                request.data.get("html", aktuell.get("html", "")),
            )
        return Response(bekanntmachung_dict(bk, request.user))

    @action(detail=True, methods=["post"])
    def uebersetzen(self, request, pk=None):
        bk = self._objekt(pk, request.user)
        services.uebersetzen(bk, request.data.get("sprache", ""))
        return Response(bekanntmachung_dict(bk, request.user))

    @action(detail=True, methods=["post"])
    def geprueft(self, request, pk=None):
        bk = self._objekt(pk, request.user)
        services.geprueft_setzen(
            bk, request.data.get("sprache", ""), request.data.get("wert", True)
        )
        return Response(bekanntmachung_dict(bk, request.user))

    @action(detail=True, methods=["post"])
    def mustertext(self, request, pk=None):
        from .texte import MUSTER

        bk = self._objekt(pk, request.user)
        betreff, html = MUSTER[bk.schluessel]["de"]
        services.text_setzen(bk, "de", betreff, html)
        return Response(bekanntmachung_dict(bk, request.user))

    @action(detail=True, methods=["post"])
    def vorlegen(self, request, pk=None):
        bk = self._objekt(pk, request.user)
        services.zur_freigabe(bk)
        return Response(bekanntmachung_dict(bk, request.user))

    @action(detail=True, methods=["post"])
    def freigeben(self, request, pk=None):
        bk = self._objekt(pk, request.user)
        services.bk_freigeben(bk, request.user)
        return Response(bekanntmachung_dict(bk, request.user))

    @action(detail=True, methods=["post"])
    def zurueck(self, request, pk=None):
        bk = self._objekt(pk, request.user)
        services.bk_zurueck(bk)
        return Response(bekanntmachung_dict(bk, request.user))

    @action(detail=True, methods=["get"])
    def aushang(self, request, pk=None):
        bk = self._objekt(pk, request.user)
        sprache = request.query_params.get("sprache", "de")
        if sprache not in ("de", "fr", "ar"):
            raise ValidationError({"sprache": "Unbekannte Sprache."})
        inhalt = pdf.aushang_pdf(bk, sprache)
        if inhalt is None:
            raise ValidationError({"sprache": "Diese Fassung gibt es noch nicht."})
        antwort = HttpResponse(inhalt, content_type="application/pdf")
        antwort["Content-Disposition"] = f'inline; filename="aushang-{bk.schluessel}-{sprache}.pdf"'
        return antwort


class EinspruchViewSet(GenericViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Einspruch.objects.select_related(
        "wahl", "kandidatur", "einreicher__user"
    ).prefetch_related("zustimmungen")

    def _objekt(self, pk, user) -> Einspruch:
        e = get_object_or_404(self.queryset, pk=pk)
        membre = services.membre_von(user)
        if services.ausschuss_oder_verwaltung(user, e.wahl) or (
            membre and e.einreicher_id == membre.id
        ):
            return e
        raise PermissionDenied("Kein Zugriff auf diesen Einspruch.")

    def _antwort(self, e: Einspruch, user, code=200):
        e = get_object_or_404(self.queryset, pk=e.pk)
        return Response(einspruch_dict(e, user), status=code)

    def list(self, request):
        wahl = get_object_or_404(Wahl, pk=request.query_params.get("wahl"))
        if services.ausschuss_oder_verwaltung(request.user, wahl):
            liste = self.queryset.filter(wahl=wahl)
        else:
            membre = services.membre_von(request.user)
            liste = self.queryset.filter(wahl=wahl, einreicher=membre) if membre else []
        return Response([einspruch_dict(e, request.user) for e in liste])

    def retrieve(self, request, pk=None):
        return Response(einspruch_dict(self._objekt(pk, request.user), request.user))

    def create(self, request):
        ser = EinspruchEingabe(data=request.data)
        ser.is_valid(raise_exception=True)
        daten = ser.validated_data
        wahl = get_object_or_404(Wahl, pk=daten["wahl"])
        if wahl.status == WahlStatus.ENTWURF:
            raise PermissionDenied("Kein Zugriff auf diese Wahl.")
        kandidatur = (
            get_object_or_404(Kandidatur, pk=daten["kandidatur"], wahl=wahl)
            if daten.get("kandidatur")
            else None
        )
        e = services.einspruch_einlegen(request.user, wahl, daten["art"], daten["text"], kandidatur)
        return self._antwort(e, request.user, 201)

    @action(detail=True, methods=["post"])
    def zurueckziehen(self, request, pk=None):
        e = self._objekt(pk, request.user)
        services.einspruch_zurueckziehen(e, request.user)
        return self._antwort(e, request.user)

    @action(detail=True, methods=["post"])
    def entscheidung(self, request, pk=None):
        e = self._objekt(pk, request.user)
        ser = EinspruchEntscheidungEingabe(data=request.data)
        ser.is_valid(raise_exception=True)
        services.einspruch_vorschlagen(
            e, request.user, ser.validated_data["art"], ser.validated_data["begruendung"]
        )
        return self._antwort(e, request.user)

    @action(detail=True, methods=["post"])
    def zustimmen(self, request, pk=None):
        e = self._objekt(pk, request.user)
        services.einspruch_zustimmen(e, request.user)
        return self._antwort(e, request.user)

    @action(detail=True, methods=["post"])
    def verwerfen(self, request, pk=None):
        e = self._objekt(pk, request.user)
        services.einspruch_vorschlag_verwerfen(e, request.user)
        return self._antwort(e, request.user)


class ReglementViewSet(GenericViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Reglement.objects.select_related("wahl").prefetch_related("gelesen")
    parser_classes = [JSONParser]

    def _wahl_sichtbar(self, wahl: Wahl, user) -> bool:
        intern = services.ausschuss_oder_verwaltung(user, wahl)
        if not intern and wahl.status == WahlStatus.ENTWURF:
            raise PermissionDenied("Kein Zugriff auf diese Wahl.")
        return intern

    def _objekt(self, pk, user, *, schreiben=False) -> Reglement:
        r = get_object_or_404(self.queryset, pk=pk)
        intern = self._wahl_sichtbar(r.wahl, user)
        if schreiben and not intern:
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        return r

    def _antwort(self, r: Reglement, user, code=200):
        r = get_object_or_404(self.queryset, pk=r.pk)
        intern = services.ausschuss_oder_verwaltung(user, r.wahl)
        return Response(reglement_dict(r, services.membre_von(user), intern), status=code)

    def list(self, request):
        wahl = get_object_or_404(Wahl, pk=request.query_params.get("wahl"))
        intern = self._wahl_sichtbar(wahl, request.user)
        membre = services.membre_von(request.user)
        liste = self.queryset.filter(wahl=wahl)
        if not intern:
            liste = [r for r in liste if (r.texte.get("de") or {}).get("html")]
        return Response([reglement_dict(r, membre, intern) for r in liste])

    def create(self, request):
        wahl = get_object_or_404(Wahl, pk=request.data.get("wahl"))
        r = services.reglement_anlegen(
            request.user, wahl, request.data.get("schluessel", ""), request.data.get("version", "1")
        )
        return self._antwort(r, request.user, 201)

    def partial_update(self, request, pk=None):
        r = self._objekt(pk, request.user, schreiben=True)
        sprache = request.data.get("sprache", "de")
        gueltig = request.data.get("gueltig_ab", None)
        if gueltig:
            gueltig = serializers.DateField().run_validation(gueltig)
        if "html" in request.data:
            services.reglement_text_setzen(
                r,
                sprache,
                request.data["html"],
                version=request.data.get("version"),
                gueltig_ab=gueltig,
            )
        elif "version" in request.data or "gueltig_ab" in request.data:
            if request.data.get("version"):
                r.version = str(request.data["version"]).strip()[:20]
            if "gueltig_ab" in request.data:
                r.gueltig_ab = gueltig or None
            r.save(update_fields=["version", "gueltig_ab"])
        return self._antwort(r, request.user)

    @action(detail=True, methods=["post"])
    def uebersetzen(self, request, pk=None):
        r = self._objekt(pk, request.user, schreiben=True)
        services.reglement_uebersetzen(r, request.data.get("sprache", ""))
        return self._antwort(r, request.user)

    @action(detail=True, methods=["post"])
    def geprueft(self, request, pk=None):
        r = self._objekt(pk, request.user, schreiben=True)
        services.reglement_geprueft(
            r, request.data.get("sprache", ""), request.data.get("wert", True)
        )
        return self._antwort(r, request.user)

    @action(detail=True, methods=["post"])
    def gelesen(self, request, pk=None):
        r = self._objekt(pk, request.user)
        services.reglement_gelesen(r, services.pflicht_membre(request.user))
        return self._antwort(r, request.user)


class MitteilungViewSet(GenericViewSet):
    """Kanäle einer automatischen Erinnerung ein- oder ausschalten (vor dem Versand)."""

    permission_classes = [IsAuthenticated]
    queryset = Mitteilung.objects.select_related("wahl")
    parser_classes = [JSONParser]

    def partial_update(self, request, pk=None):
        m = get_object_or_404(self.queryset, pk=pk)
        if not services.ausschuss_oder_verwaltung(request.user, m.wahl):
            raise PermissionDenied("Nur Wahlausschuss und Büro.")
        m = mitteilungen.kanaele_setzen(m, request.data.get("kanaele"))
        return Response({"id": str(m.id), "kanaele": m.kanaele, "status": m.status})


class WahlTerminViewSet(GenericViewSet):
    """Live-Termine zur Wahl: Ausschuss und Büro pflegen sie, Mitglieder lassen sich erinnern."""

    permission_classes = [IsAuthenticated]
    queryset = WahlTermin.objects.select_related("wahl", "termin")
    parser_classes = [JSONParser]

    def _wahl_lesen(self, wahl: Wahl, user) -> None:
        if wahl.status == WahlStatus.ENTWURF and not services.ausschuss_oder_verwaltung(user, wahl):
            raise PermissionDenied("Kein Zugriff auf diese Wahl.")

    def _objekt(self, pk, user) -> WahlTermin:
        wt = get_object_or_404(self.queryset, pk=pk)
        self._wahl_lesen(wt.wahl, user)
        return wt

    def list(self, request):
        wahl = get_object_or_404(Wahl, pk=request.query_params.get("wahl"))
        self._wahl_lesen(wahl, request.user)
        return Response(
            [wahltermine.termin_dict(wt, request.user) for wt in wahl.live_termine.all()]
        )

    def create(self, request):
        wahl = get_object_or_404(Wahl, pk=request.data.get("wahl"))
        wt = wahltermine.anlegen(request.user, wahl, request.data)
        return Response(wahltermine.termin_dict(wt, request.user), status=201)

    def partial_update(self, request, pk=None):
        wt = self._objekt(pk, request.user)
        wt = wahltermine.aendern(request.user, wt, request.data)
        return Response(wahltermine.termin_dict(wt, request.user))

    def destroy(self, request, pk=None):
        wt = self._objekt(pk, request.user)
        wahltermine.loeschen(request.user, wt)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def erinnern(self, request, pk=None):
        wt = self._objekt(pk, request.user)
        wahltermine.erinnern(request.user, wt, bool(request.data.get("an", True)))
        return Response(wahltermine.termin_dict(wt, request.user))
