"""Welle 2 der Reise-API : Teilgruppen, gemeinsame Ankunft, Checkliste, Exporte, Saison und
Ländersteckbriefe. Als Mixin in `ReiseViewSet` eingebunden (nutzt dessen Hilfen `_ctx`, `_orga`,
`_voll`, `_fehler`)."""

from django.db import transaction
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status as http
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.regionen import formattext

from . import exporte, gruppen
from . import services as sv
from .models import ChecklisteErledigt, ChecklistePunkt, Laenderprofil, Teilgruppe
from .serializers import ChecklisteSerializer, LaenderprofilSerializer

UID = r"(?P<{}>[0-9a-fA-F-]{{36}})"


def laenderprofil_dict(p: Laenderprofil) -> dict:
    return {
        "id": str(p.id),
        "land": p.land,
        "einreise": p.einreise,
        "waehrung": p.waehrung,
        "zeitverschiebung": p.zeitverschiebung,
        "steckdose": p.steckdose,
        "amtliche_hinweise": p.amtliche_hinweise,
        "weitere_infos": p.weitere_infos,
        "stand": p.stand.isoformat(),
    }


def profil_zu_land(land: str):
    schluessel = (land or "").strip().lower()
    return Laenderprofil.objects.filter(land_schluessel=schluessel).first() if schluessel else None


class Welle2Mixin:
    # --- Teilgruppen -------------------------------------------------------------------------

    @action(detail=True, methods=["get", "post"])
    @transaction.atomic
    def teilgruppen(self, request, pk=None):
        if request.method == "GET":
            ctx = self._voll(pk)
            daten = {"gruppen": gruppen.gruppen_liste(ctx)}
            if ctx.darf_verwalten:
                daten["vorschlaege"] = gruppen.vorschlaege(ctx)
            return Response(daten)
        ctx = self._orga(pk)
        name = str(request.data.get("name", "")).strip()[:100]
        if not name:
            self._fehler("Bitte einen Namen angeben.")
        if ctx.reise.teilgruppen.filter(name__iexact=name).exists():
            self._fehler("Diese Teilgruppe gibt es schon.")
        g = Teilgruppe.objects.create(reise=ctx.reise, name=name)
        gruppen.mitglieder_setzen(g, request.data.get("teilnehmer", []))
        return Response({"id": str(g.id)}, status=http.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], url_path="teilgruppen/" + UID.format("gid"))
    @transaction.atomic
    def teilgruppe(self, request, pk=None, gid=None):
        ctx = self._orga(pk)
        g = get_object_or_404(Teilgruppe, pk=gid, reise=ctx.reise)
        if request.method == "DELETE":
            g.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        if "name" in request.data:
            name = str(request.data["name"]).strip()[:100]
            if not name:
                self._fehler("Bitte einen Namen angeben.")
            if ctx.reise.teilgruppen.filter(name__iexact=name).exclude(pk=g.pk).exists():
                self._fehler("Diese Teilgruppe gibt es schon.")
            g.name = name
            g.save(update_fields=["name"])
        if "teilnehmer" in request.data:
            gruppen.mitglieder_setzen(g, request.data["teilnehmer"])
        return Response(status=http.HTTP_204_NO_CONTENT)

    # --- Gemeinsame Ankunft ------------------------------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="gemeinsame-ankunft")
    @transaction.atomic
    def gemeinsame_ankunft(self, request, pk=None):
        ctx = self._voll(pk)
        if ctx.tn is None:
            raise PermissionDenied("Nur für Teilnehmende.")
        if request.method == "POST":
            tag = parse_date(str(request.data.get("tag", "")))
            if tag is None:
                self._fehler("Bitte einen Tag angeben.")
            try:
                gruppen.zustimmen(
                    ctx,
                    str(request.data.get("typ", "")),
                    str(request.data.get("ort", "")),
                    tag,
                    bool(request.data.get("zustimmen", True)),
                )
            except ValueError as exc:
                self._fehler(str(exc))
        return Response(gruppen.gemeinsame_ankunft(ctx))

    # --- Checkliste --------------------------------------------------------------------------

    @staticmethod
    def _punkt_dict(p, ctx, erledigt_ids, gesamt) -> dict:
        d = {
            "id": str(p.id),
            "titel": p.titel,
            "frist": p.frist.isoformat() if p.frist else None,
            "persoenlich": p.besitzer_id is not None,
            "teilgruppe": str(p.teilgruppe_id) if p.teilgruppe_id else None,
            "teilgruppe_name": p.teilgruppe.name if p.teilgruppe_id else None,
            "erledigt": p.id in erledigt_ids,
            "ueberfaellig": bool(
                p.frist and p.id not in erledigt_ids and p.frist < timezone.localdate()
            ),
            "kann_aendern": (p.besitzer_id == ctx.user.pk) if p.besitzer_id else ctx.darf_verwalten,
        }
        if ctx.darf_verwalten and p.besitzer_id is None:
            d["erledigt_zahl"] = sum(1 for e in p.erledigt.all() if e.user_id in gesamt[p.id])
            d["gesamt"] = len(gesamt[p.id])
        return d

    def _checkliste(self, ctx) -> list:
        punkte = [
            p
            for p in ctx.reise.checkliste.select_related("teilgruppe").prefetch_related("erledigt")
            if (p.besitzer_id == ctx.user.pk)
            or (p.besitzer_id is None and ctx.im_kreis(p.teilgruppe_id))
        ]
        mein_ok = {e.punkt_id for p in punkte for e in p.erledigt.all() if e.user_id == ctx.user.pk}
        gesamt = {}
        if ctx.darf_verwalten:
            for p in punkte:
                if p.besitzer_id is None:
                    gesamt[p.id] = {u.pk for u in sv.empfaenger(ctx.reise, p.teilgruppe_id)}
        return [self._punkt_dict(p, ctx, mein_ok, gesamt) for p in punkte]

    @action(detail=True, methods=["get", "post"])
    def checkliste(self, request, pk=None):
        ctx = self._voll(pk)
        if request.method == "POST":
            ser = ChecklisteSerializer(data=request.data, context={"reise": ctx.reise})
            ser.is_valid(raise_exception=True)
            if request.data.get("persoenlich"):
                if ctx.tn is None:
                    raise PermissionDenied("Nur für Teilnehmende.")
                ser.save(reise=ctx.reise, besitzer=request.user, teilgruppe=None)
            else:
                if not ctx.darf_verwalten:
                    raise PermissionDenied("Gemeinsame Punkte legt die Organisation an.")
                ser.save(reise=ctx.reise)
            return Response(self._checkliste(ctx), status=http.HTTP_201_CREATED)
        return Response(self._checkliste(ctx))

    def _punkt(self, ctx, pid) -> ChecklistePunkt:
        p = get_object_or_404(ChecklistePunkt, pk=pid, reise=ctx.reise)
        sichtbar = p.besitzer_id == ctx.user.pk or (
            p.besitzer_id is None and ctx.im_kreis(p.teilgruppe_id)
        )
        if not sichtbar:
            raise Http404
        return p

    @action(detail=True, methods=["patch", "delete"], url_path="checkliste/" + UID.format("pid"))
    def checkliste_punkt(self, request, pk=None, pid=None):
        ctx = self._voll(pk)
        p = self._punkt(ctx, pid)
        darf = (p.besitzer_id == request.user.pk) if p.besitzer_id else ctx.darf_verwalten
        if not darf:
            raise PermissionDenied("Diesen Punkt darfst du nicht ändern.")
        if request.method == "DELETE":
            p.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        daten = {k: v for k, v in request.data.items() if k in ("titel", "frist")}
        ser = ChecklisteSerializer(p, data=daten, partial=True, context={"reise": ctx.reise})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(self._checkliste(ctx))

    @action(detail=True, methods=["post"], url_path="checkliste/" + UID.format("pid") + "/erledigt")
    def checkliste_erledigt(self, request, pk=None, pid=None):
        ctx = self._voll(pk)
        p = self._punkt(ctx, pid)
        if request.data.get("erledigt", True):
            ChecklisteErledigt.objects.get_or_create(punkt=p, user=request.user)
        else:
            ChecklisteErledigt.objects.filter(punkt=p, user=request.user).delete()
        return Response(self._checkliste(ctx))

    # --- Exporte (Excel) ---------------------------------------------------------------------

    @staticmethod
    def _datei(inhalt: bytes, name: str) -> HttpResponse:
        antwort = HttpResponse(inhalt, content_type=exporte.XLSX)
        antwort["Content-Disposition"] = f'attachment; filename="{name}"'
        return antwort

    @action(detail=True, methods=["get"], url_path="export-excel")
    def export_excel(self, request, pk=None):
        ctx = self._orga(pk)
        return self._datei(exporte.reise_excel(ctx), f"reise-{ctx.reise.id}.xlsx")

    @action(detail=True, methods=["get"], url_path="export-namensliste")
    def export_namensliste(self, request, pk=None):
        ctx = self._orga(pk)
        unterkunft = request.query_params.get("unterkunft") or None
        teilgruppe = request.query_params.get("teilgruppe") or None
        if unterkunft and unterkunft != "eigene":
            if not ctx.reise.unterkuenfte.filter(pk=unterkunft).exists():
                raise Http404
        if teilgruppe and not ctx.reise.teilgruppen.filter(pk=teilgruppe).exists():
            raise Http404
        return self._datei(
            exporte.namensliste_excel(ctx, unterkunft, teilgruppe),
            f"namensliste-{ctx.reise.id}.xlsx",
        )

    # --- Saison ------------------------------------------------------------------------------

    @action(detail=False, methods=["get"])
    def saison(self, request):
        """Kommende Auswärtsspiele mit den Reisen dazu (nur Reisen, die man sehen darf)."""
        from apps.communaute.models import RencontreCalendrier, StatutRencontre

        spiele = list(
            RencontreCalendrier.objects.filter(
                statut=StatutRencontre.PROGRAMMEE,
                date_heure__gte=timezone.now(),
                equipe_exterieur__iexact="Club Africain",
            ).order_by("date_heure")[:60]
        )
        reisen = {}
        qs = (
            sv.reisen_sichtbar(request.user)
            .filter(rencontre__in=spiele, abgesagt=False)
            .prefetch_related("teilnehmer")
        )
        from . import ausgabe as out

        for r in qs:
            reisen.setdefault(r.rencontre_id, []).append(out.reise_liste(r, request.user))
        return Response(
            [
                {
                    "rencontre": str(s.id),
                    "gegner": s.equipe_domicile,
                    "competition": s.competition,
                    "datum": s.date_heure.isoformat(),
                    "reisen": reisen.get(s.id, []),
                }
                for s in spiele
            ]
        )

    # --- Ländersteckbriefe -------------------------------------------------------------------

    @action(detail=False, methods=["get", "post"])
    def laenderprofile(self, request):
        if request.method == "GET":
            return Response([laenderprofil_dict(p) for p in Laenderprofil.objects.all()])
        if not sv.ist_verwalter(request.user):
            raise PermissionDenied("Ländersteckbriefe pflegt das Bureau.")
        return self._profil_speichern(request, None)

    @action(
        detail=False,
        methods=["patch", "delete"],
        url_path="laenderprofile/" + UID.format("lid"),
    )
    def laenderprofil(self, request, lid=None):
        if not sv.ist_verwalter(request.user):
            raise PermissionDenied("Ländersteckbriefe pflegt das Bureau.")
        p = get_object_or_404(Laenderprofil, pk=lid)
        if request.method == "DELETE":
            p.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        return self._profil_speichern(request, p)

    def _profil_speichern(self, request, profil):
        ser = LaenderprofilSerializer(profil, data=request.data, partial=profil is not None)
        ser.is_valid(raise_exception=True)
        land = ser.validated_data.get("land", profil.land if profil else "").strip()
        zweites = Laenderprofil.objects.filter(land_schluessel=land.lower())
        if profil is not None:
            zweites = zweites.exclude(pk=profil.pk)
        if zweites.exists():
            self._fehler("Für dieses Land gibt es schon einen Steckbrief.")
        p = ser.save(aktualisiert_von=request.user)
        if "stand" not in request.data:
            p.stand = timezone.localdate()
        p.einreise = formattext.bereinige(p.einreise)
        p.weitere_infos = formattext.bereinige(p.weitere_infos)
        p.save()
        return Response(
            laenderprofil_dict(p),
            status=http.HTTP_200_OK if profil else http.HTTP_201_CREATED,
        )
