"""API des Moduls Reisen & Fahrgemeinschaften. Alles hängt an der Reise (`/reisen/<id>/...`).
Wer eine Reise nicht sehen darf, bekommt 404 (verrät nicht, ob es sie gibt)."""

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.notifications.models import TypeNotification as T
from apps.regionen import formattext

from . import ausgabe as out
from . import services as sv
from .models import (
    Aufgabe,
    Beitritt,
    ChecklistePunkt,
    Entscheidung,
    EntscheidungTyp,
    EntStatus,
    Etappe,
    KostenAnteil,
    Kostenposten,
    Option,
    Reise,
    ReiseInfo,
    ReiseInfoGelesen,
    ReiseTeilnehmer,
    Rolle,
    StadionVorschlag,
    TStatus,
    Unterkunft,
)
from .serializers import (
    AufgabeSerializer,
    EntscheidungSerializer,
    EtappeSerializer,
    InfoSerializer,
    MeineAngabenSerializer,
    OptionSerializer,
    ReiseSerializer,
    UnterkunftSerializer,
)
from .views_welle2 import Welle2Mixin, laenderprofil_dict, profil_zu_land

UID = r"(?P<{}>[0-9a-fA-F-]{{36}})"

VORLAGEN = {
    "auswaerts_ausland": [
        "Stadionkarten besorgen",
        "Transfer vom Flughafen klären",
        "Fan-ID oder Registrierung klären",
        "Kontakt vor Ort finden",
    ],
    "wochenende": ["Treffpunkt festlegen"],
}

CHECKLISTEN = {
    "auswaerts_ausland": [
        "Reisepass oder Personalausweis gültig (Einreisebestimmungen prüfen)",
        "Hin- und Rückreise gebucht",
        "Unterkunft gebucht",
        "Stadionkarte oder Fan-ID besorgt",
        "Auslandskrankenversicherung geprüft",
    ],
    "wochenende": ["Anreise geklärt", "Unterkunft geklärt"],
}


def _gegner(rencontre) -> str:
    for name in (rencontre.equipe_exterieur, rencontre.equipe_domicile):
        if "africain" not in name.lower():
            return name
    return rencontre.equipe_exterieur


def _merke_stadion(reise):
    if reise.rencontre_id and (reise.stadion or reise.ziel_ort):
        StadionVorschlag.objects.update_or_create(
            gegner=_gegner(reise.rencontre),
            defaults={
                "stadion": reise.stadion,
                "stadt": reise.ziel_ort,
                "land": reise.land,
            },
        )


class ReiseViewSet(Welle2Mixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ReiseSerializer
    pagination_class = None
    queryset = Reise.objects.none()

    # --- Hilfen ---------------------------------------------------------------------------

    def _ctx(self, pk) -> sv.Kontext:
        try:
            reise = sv.reisen_sichtbar(self.request.user).get(pk=pk)
        except (Reise.DoesNotExist, ValueError, TypeError) as exc:
            raise Http404 from exc
        return sv.Kontext(reise, self.request.user)

    def _orga(self, pk) -> sv.Kontext:
        ctx = self._ctx(pk)
        if not ctx.darf_verwalten:
            raise PermissionDenied("Nur Organisation und Vertretung dürfen das.")
        return ctx

    def _voll(self, pk) -> sv.Kontext:
        ctx = self._ctx(pk)
        if not ctx.voll:
            raise PermissionDenied("Nur für Teilnehmende.")
        return ctx

    @staticmethod
    def _fehler(text: str):
        raise ValidationError({"detail": text})

    # --- Reise : Liste, Anlegen, Detail ----------------------------------------------------

    def list(self, request):
        qs = sv.reisen_sichtbar(request.user).prefetch_related("teilnehmer")
        if request.query_params.get("meine"):
            qs = qs.filter(teilnehmer__user=request.user).distinct()
        if rencontre := request.query_params.get("rencontre"):
            qs = qs.filter(rencontre_id=rencontre)
        if q := request.query_params.get("q"):
            qs = qs.filter(titel__icontains=q)
        return Response([out.reise_liste(r, request.user) for r in qs])

    @transaction.atomic
    def create(self, request):
        if not (sv.ist_aktives_mitglied(request.user) or sv.ist_verwalter(request.user)):
            raise PermissionDenied("Nur aktive Mitglieder dürfen Reisen anlegen.")
        daten = dict(request.data)
        rencontre = None
        if request.data.get("rencontre"):
            from apps.communaute.models import RencontreCalendrier

            rencontre = get_object_or_404(RencontreCalendrier, pk=request.data["rencontre"])
            gegner = _gegner(rencontre)
            vorschlag = StadionVorschlag.objects.filter(gegner=gegner).first()
            tag = timezone.localtime(rencontre.date_heure).date().isoformat()
            daten.setdefault(
                "titel",
                f"Auswärtsspiel: {rencontre.equipe_domicile} – {rencontre.equipe_exterieur}",
            )
            daten.setdefault("start", tag)
            daten.setdefault("ende", tag)
            if vorschlag:
                daten.setdefault("ziel_ort", vorschlag.stadt)
                daten.setdefault("stadion", vorschlag.stadion)
                daten.setdefault("land", vorschlag.land)
        daten = sv.bereinige_felder(
            {k: (v[0] if isinstance(v, list) else v) for k, v in daten.items()}
        )
        ser = ReiseSerializer(data=daten)
        ser.is_valid(raise_exception=True)
        reise = ser.save(erstellt_von=request.user, rencontre=rencontre)
        ReiseTeilnehmer.objects.create(
            reise=reise,
            user=request.user,
            rolle=Rolle.ORGANISATOR,
            status=TStatus.DABEI,
        )
        for titel in VORLAGEN.get(request.data.get("vorlage"), []):
            Aufgabe.objects.create(reise=reise, titel=titel)
        for titel in CHECKLISTEN.get(request.data.get("vorlage"), []):
            ChecklistePunkt.objects.create(reise=reise, titel=titel)
        sv.chat_anlegen(reise, request.user)
        _merke_stadion(reise)
        return Response({"id": str(reise.id)}, status=http.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        ctx = self._ctx(pk)
        reise, user = ctx.reise, request.user
        daten = out.reise_liste(reise, user)
        daten.update(
            beschreibung=reise.beschreibung,
            stadion=reise.stadion,
            interessen_frist=out._zeit(reise.interessen_frist),
            anmelde_frist=out._zeit(reise.anmelde_frist),
            vorschau_oeffentlich=reise.vorschau_oeffentlich,
            vorschlaege_erlaubt=reise.vorschlaege_erlaubt,
            budget_grenzen=reise.budget_grenzen,
            kann_verwalten=ctx.darf_verwalten,
            ist_organisator=bool(ctx.tn and ctx.tn.rolle == Rolle.ORGANISATOR) or ctx.verwalter,
            voll=ctx.voll,
            chat_gruppe=str(reise.chat_gruppe_id) if reise.chat_gruppe_id else None,
        )
        entscheidungen = [
            e
            for e in reise.entscheidungen.select_related("teilgruppe").prefetch_related(
                "optionen__stimmen__user__membre"
            )
            if ctx.im_kreis(e.teilgruppe_id)
        ]
        daten["beschlossen"] = [
            out.entscheidung_dict(e, ctx)
            for e in entscheidungen
            if e.status == EntStatus.BESCHLOSSEN
        ]
        if ctx.voll:
            heute = timezone.localdate()
            infos = [
                i
                for i in reise.infos.select_related("teilgruppe").prefetch_related("gelesen")
                if (i.gueltig_bis is None or i.gueltig_bis >= heute)
                and ctx.im_kreis(i.teilgruppe_id)
            ]
            gelesen = set(
                ReiseInfoGelesen.objects.filter(user=user, info__reise=reise).values_list(
                    "info_id", flat=True
                )
            )
            aufgaben = [
                a
                for a in reise.aufgaben.select_related("verantwortlich", "teilgruppe")
                if ctx.im_kreis(a.teilgruppe_id)
            ]
            seit = ctx.tn.zuletzt_gesehen if ctx.tn else None
            daten.update(
                stadion_infos=reise.stadion_infos,
                laenderinfo=reise.laenderinfo,
                regeln=reise.regeln,
                offene_entscheidungen=[
                    out.entscheidung_dict(e, ctx)
                    for e in entscheidungen
                    if e.status != EntStatus.BESCHLOSSEN
                ],
                infos=[out.info_dict(i, ctx, gelesen) for i in infos if i.wichtig][:3],
                jetzt_dran=out.jetzt_dran(ctx, entscheidungen, aufgaben, infos, gelesen),
                neu=(
                    {
                        "entscheidungen": sum(
                            1 for e in entscheidungen if seit and e.created_at > seit
                        ),
                        "infos": sum(1 for i in infos if seit and i.created_at > seit),
                        "aufgaben": sum(1 for a in aufgaben if seit and a.created_at > seit),
                    }
                    if seit
                    else None
                ),
                regeln_bestaetigt=bool(ctx.tn and ctx.tn.regeln_bestaetigt_am),
                laenderprofil=(
                    laenderprofil_dict(profil) if (profil := profil_zu_land(reise.land)) else None
                ),
            )
            if ctx.tn:
                ReiseTeilnehmer.objects.filter(pk=ctx.tn.pk).update(zuletzt_gesehen=timezone.now())
        if ctx.darf_verwalten:
            daten["einladungs_token"] = reise.einladungs_token
        if ctx.tn:
            daten["meine"] = out.meine_angaben(ctx.tn)
        return Response(daten)

    def partial_update(self, request, pk=None):
        ctx = self._orga(pk)
        war_abgesagt = ctx.reise.abgesagt
        daten = sv.bereinige_felder(dict(request.data))
        ser = ReiseSerializer(ctx.reise, data=daten, partial=True)
        ser.is_valid(raise_exception=True)
        reise = ser.save()
        _merke_stadion(reise)
        if reise.abgesagt and not war_abgesagt:
            sv.benachrichtige(
                [
                    t.user
                    for t in reise.teilnehmer.exclude(
                        status__in=[TStatus.ABGELEHNT, TStatus.ABGESAGT]
                    ).select_related("user")
                ],
                T.REISE_ENTSCHEIDUNG,
                f"Reise abgesagt: {reise.titel}",
                "Die Organisation hat die Reise abgesagt.",
                sv.lien(reise),
                ausser=request.user,
            )
        return Response(status=http.HTTP_204_NO_CONTENT)

    def destroy(self, request, pk=None):
        ctx = self._ctx(pk)
        if not (ctx.verwalter or (ctx.tn and ctx.tn.rolle == Rolle.ORGANISATOR)):
            raise PermissionDenied("Nur der Organisator darf die Reise löschen.")
        if ctx.reise.chat_gruppe_id:
            ctx.reise.chat_gruppe.delete()
        ctx.reise.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="mitglieder-suche")
    def mitglieder_suche(self, request):
        """Namenssuche für Einladungen : nur Name und Id aktiver Mitglieder mit Konto."""
        from django.db.models import Q

        from apps.membres.models import Membre, StatutMembre

        q = (request.query_params.get("q") or "").strip()
        if len(q) < 2:
            return Response([])
        qs = Membre.objects.filter(statut=StatutMembre.ACTIF, user__isnull=False).exclude(
            user=request.user
        )
        for wort in q.split()[:3]:
            qs = qs.filter(Q(prenom__icontains=wort) | Q(nom__icontains=wort))
        return Response(
            [
                {"id": str(m.id), "name": f"{m.prenom} {m.nom}".strip()}
                for m in qs.order_by("nom", "prenom")[:15]
            ]
        )

    @action(detail=False, methods=["get"], url_path="stadion-vorschlag")
    def stadion_vorschlag(self, request):
        gegner = request.query_params.get("gegner", "")
        if rid := request.query_params.get("rencontre"):
            from apps.communaute.models import RencontreCalendrier

            r = get_object_or_404(RencontreCalendrier, pk=rid)
            gegner = _gegner(r)
        v = StadionVorschlag.objects.filter(gegner=gegner).first()
        return Response(
            {"gegner": gegner, "stadion": v.stadion, "stadt": v.stadt, "land": v.land}
            if v
            else {"gegner": gegner}
        )

    # --- Beitritt, Einladung, Rollen -------------------------------------------------------

    @action(detail=False, methods=["post"], url_path="per-link")
    def per_link(self, request):
        reise = Reise.objects.filter(einladungs_token=request.data.get("token") or "-").first()
        if reise is None or reise.abgesagt:
            raise Http404
        tn, neu = ReiseTeilnehmer.objects.get_or_create(
            reise=reise, user=request.user, defaults={"status": TStatus.EINGELADEN}
        )
        return Response({"id": str(reise.id), "neu": neu})

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def beitreten(self, request, pk=None):
        ctx = self._ctx(pk)
        reise, user = ctx.reise, request.user
        if reise.abgesagt:
            self._fehler("Die Reise wurde abgesagt.")
        ziel = request.data.get("status", "interessiert")
        if ziel not in ("interessiert", "dabei"):
            self._fehler("Ungültiger Status.")
        tn = ctx.tn
        if tn and tn.status in (TStatus.DABEI, TStatus.WARTELISTE):
            return Response(out.reise_liste(reise, user))
        if tn and tn.status == TStatus.ABGELEHNT:
            raise PermissionDenied("Die Anfrage wurde abgelehnt.")
        eingeladen = bool(tn and tn.status == TStatus.EINGELADEN) or (
            request.data.get("token") and request.data["token"] == reise.einladungs_token
        )
        if reise.beitritt == Beitritt.EINLADUNG and not eingeladen:
            raise PermissionDenied("Nur mit Einladung.")
        if ziel == "dabei" and reise.anmelde_frist and reise.anmelde_frist < timezone.localdate():
            self._fehler("Die Anmeldefrist ist abgelaufen.")
        tn = tn or ReiseTeilnehmer(reise=reise, user=user)
        tn.nachricht = str(request.data.get("nachricht", ""))[:500]
        anfrage = False
        if ziel == "interessiert":
            tn.status = TStatus.INTERESSIERT
        elif reise.beitritt == Beitritt.GENEHMIGUNG and not eingeladen:
            tn.status, anfrage = TStatus.ANGEFRAGT, True
        else:
            tn.status = TStatus.WARTELISTE if sv.ist_voll(reise) else TStatus.DABEI
        tn.save()
        sv.chat_abgleich(tn)
        if anfrage:
            sv.benachrichtige(
                sv.organisatoren(reise),
                T.REISE_ANFRAGE,
                f"Anfrage: {reise.titel}",
                f"{sv.name_von(user)} möchte mitfahren.",
                sv.lien(reise),
            )
        return Response(out.reise_liste(reise, user))

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def absagen(self, request, pk=None):
        ctx = self._ctx(pk)
        if ctx.tn is None:
            raise Http404
        if ctx.tn.rolle == Rolle.ORGANISATOR:
            self._fehler("Gib zuerst die Organisation an eine andere Person ab.")
        sv.setze_status(ctx.tn, TStatus.ABGESAGT)
        sv.nachruecken(ctx.reise)
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def einladen(self, request, pk=None):
        ctx = self._orga(pk)
        from apps.membres.models import Membre

        users = [
            m.user
            for m in Membre.objects.filter(
                pk__in=request.data.get("membre_ids", [])
            ).select_related("user")
            if m.user_id
        ]
        neu = []
        for user in users:
            _tn, angelegt = ReiseTeilnehmer.objects.get_or_create(
                reise=ctx.reise, user=user, defaults={"status": TStatus.EINGELADEN}
            )
            if angelegt:
                neu.append(user)
        sv.benachrichtige(
            neu,
            T.REISE_EINLADUNG,
            f"Einladung: {ctx.reise.titel}",
            f"{sv.name_von(request.user)} lädt dich zu dieser Reise ein.",
            sv.lien(ctx.reise),
        )
        return Response({"eingeladen": len(neu)})

    @action(detail=True, methods=["get"])
    def teilnehmer(self, request, pk=None):
        ctx = self._ctx(pk)
        if not ctx.voll:
            return Response([])
        qs = ctx.reise.teilnehmer.select_related(
            "user", "user__membre", "unterkunft"
        ).prefetch_related("etappen")
        if not ctx.darf_verwalten:
            qs = qs.exclude(status__in=[TStatus.ABGELEHNT, TStatus.ABGESAGT, TStatus.EINGELADEN])
        return Response([out.teilnehmer_dict(t, ctx) for t in qs.order_by("created_at")])

    @action(
        detail=True,
        methods=["post"],
        url_path="teilnehmer/" + UID.format("tid") + "/entscheiden",
    )
    @transaction.atomic
    def entscheiden(self, request, pk=None, tid=None):
        ctx = self._orga(pk)
        tn = get_object_or_404(ReiseTeilnehmer, pk=tid, reise=ctx.reise)
        if tn.status != TStatus.ANGEFRAGT:
            self._fehler("Es liegt keine Anfrage vor.")
        if request.data.get("zusage"):
            neu = TStatus.WARTELISTE if sv.ist_voll(ctx.reise) else TStatus.DABEI
        else:
            neu = TStatus.ABGELEHNT
        sv.setze_status(tn, neu, request.user)
        text = (
            "Du bist dabei."
            if neu == TStatus.DABEI
            else (
                "Du stehst auf der Warteliste."
                if neu == TStatus.WARTELISTE
                else "Deine Anfrage wurde abgelehnt."
            )
        )
        sv.benachrichtige(
            [tn.user], T.REISE_EINLADUNG, f"{ctx.reise.titel}", text, sv.lien(ctx.reise)
        )
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="teilnehmer/" + UID.format("tid") + "/entfernen",
    )
    @transaction.atomic
    def entfernen(self, request, pk=None, tid=None):
        ctx = self._orga(pk)
        tn = get_object_or_404(ReiseTeilnehmer, pk=tid, reise=ctx.reise)
        if tn.rolle == Rolle.ORGANISATOR:
            self._fehler("Der Organisator kann nicht entfernt werden.")
        sv.setze_status(tn, TStatus.ABGESAGT, request.user)
        sv.nachruecken(ctx.reise)
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="teilnehmer/" + UID.format("tid") + "/rolle",
    )
    @transaction.atomic
    def rolle(self, request, pk=None, tid=None):
        ctx = self._ctx(pk)
        if not (ctx.verwalter or (ctx.tn and ctx.tn.rolle == Rolle.ORGANISATOR)):
            raise PermissionDenied("Nur der Organisator darf Rollen vergeben.")
        tn = get_object_or_404(ReiseTeilnehmer, pk=tid, reise=ctx.reise)
        neu = request.data.get("rolle")
        if neu not in Rolle.values or tn.status != TStatus.DABEI:
            self._fehler("Ungültige Rolle oder Person ist nicht dabei.")
        if neu == Rolle.ORGANISATOR:
            ctx.reise.teilnehmer.filter(rolle=Rolle.ORGANISATOR).update(rolle=Rolle.VERTRETER)
        elif tn.rolle == Rolle.ORGANISATOR:
            self._fehler("Bestimme zuerst einen neuen Organisator.")
        tn.rolle = neu
        tn.save(update_fields=["rolle"])
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def uebernehmen(self, request, pk=None):
        """Vertretung bei Ausfall : Vertreter oder Verwalter übernimmt die Organisation."""
        ctx = self._ctx(pk)
        if not (
            ctx.verwalter
            or (ctx.tn and ctx.tn.rolle == Rolle.VERTRETER and ctx.tn.status == TStatus.DABEI)
        ):
            raise PermissionDenied("Nur Vertretung oder Verwaltung darf übernehmen.")
        bisher = list(sv.organisatoren(ctx.reise))
        ctx.reise.teilnehmer.filter(rolle=Rolle.ORGANISATOR).update(rolle=Rolle.VERTRETER)
        tn, _ = ReiseTeilnehmer.objects.get_or_create(reise=ctx.reise, user=request.user)
        tn.status, tn.rolle = TStatus.DABEI, Rolle.ORGANISATOR
        tn.save()
        sv.chat_abgleich(tn)
        sv.benachrichtige(
            bisher,
            T.REISE_ENTSCHEIDUNG,
            f"Organisation übernommen: {ctx.reise.titel}",
            f"{sv.name_von(request.user)} hat die Organisation übernommen.",
            sv.lien(ctx.reise),
            ausser=request.user,
        )
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="regeln-bestaetigen")
    def regeln_bestaetigen(self, request, pk=None):
        ctx = self._voll(pk)
        if ctx.tn is None:
            raise PermissionDenied("Nur für Teilnehmende.")
        ctx.tn.regeln_bestaetigt_am = timezone.now()
        ctx.tn.save(update_fields=["regeln_bestaetigt_am"])
        return Response(status=http.HTTP_204_NO_CONTENT)

    # --- Meine Reise : Angaben, Etappen ----------------------------------------------------

    @action(detail=True, methods=["patch"])
    def meine(self, request, pk=None):
        ctx = self._ctx(pk)
        if ctx.tn is None:
            raise Http404
        ser = MeineAngabenSerializer(ctx.tn, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        if request.data.get("offen_gemeinsame_anreise") is False:
            ctx.tn.ankunft_zustimmungen.all().delete()
        return Response(out.meine_angaben(ReiseTeilnehmer.objects.get(pk=ctx.tn.pk)))

    @action(detail=True, methods=["post"])
    def etappen(self, request, pk=None):
        ctx = self._voll(pk)
        if ctx.tn is None:
            raise PermissionDenied("Nur für Teilnehmende.")
        ser = EtappeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        e = ser.save(teilnehmer=ctx.tn)
        return Response(sv.etappe_dict(e, voll=True), status=http.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path="etappen/" + UID.format("eid"),
    )
    def etappe(self, request, pk=None, eid=None):
        ctx = self._voll(pk)
        e = get_object_or_404(Etappe, pk=eid, teilnehmer=ctx.tn)
        if request.method == "DELETE":
            e.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        ser = EtappeSerializer(e, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        return Response(sv.etappe_dict(ser.save(), voll=True))

    @action(detail=True, methods=["get", "post"])
    def unterkuenfte(self, request, pk=None):
        if request.method == "GET":
            ctx = self._voll(pk)
            return Response(
                [
                    {
                        "id": str(u.id),
                        **{f: getattr(u, f) for f in ("name", "adresse", "entfernung", "link")},
                        "belegt": u.belegung.filter(status=TStatus.DABEI).count(),
                    }
                    for u in ctx.reise.unterkuenfte.all()
                ]
            )
        ctx = self._orga(pk)
        ser = UnterkunftSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        u = ser.save(reise=ctx.reise)
        return Response({"id": str(u.id)}, status=http.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path="unterkuenfte/" + UID.format("uid"),
    )
    def unterkunft(self, request, pk=None, uid=None):
        ctx = self._orga(pk)
        u = get_object_or_404(Unterkunft, pk=uid, reise=ctx.reise)
        if request.method == "DELETE":
            u.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        ser = UnterkunftSerializer(u, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def uebersicht(self, request, pk=None):
        return Response(sv.uebersicht(self._voll(pk)))

    # --- Entscheidungen --------------------------------------------------------------------

    def _entscheidungen_qs(self, reise):
        return reise.entscheidungen.select_related("teilgruppe").prefetch_related(
            "optionen__stimmen__user__membre"
        )

    @action(detail=True, methods=["get", "post"])
    @transaction.atomic
    def entscheidungen(self, request, pk=None):
        if request.method == "GET":
            ctx = self._ctx(pk)
            ents = self._entscheidungen_qs(ctx.reise)
            if not ctx.voll:
                ents = ents.filter(status=EntStatus.BESCHLOSSEN)
            return Response(
                [out.entscheidung_dict(e, ctx) for e in ents if ctx.im_kreis(e.teilgruppe_id)]
            )
        ctx = self._orga(pk)
        ser = EntscheidungSerializer(data=request.data, context={"reise": ctx.reise})
        ser.is_valid(raise_exception=True)
        daten = ser.validated_data
        optionen = daten.pop("optionen", [])
        daten["beschreibung"] = formattext.bereinige(daten.get("beschreibung", ""))
        ent = Entscheidung.objects.create(reise=ctx.reise, erstellt_von=request.user, **daten)
        for o in optionen:
            Option.objects.create(entscheidung=ent, vorgeschlagen_von=request.user, **o)
        if ent.typ == EntscheidungTyp.EMPFEHLUNG:
            Option.objects.create(entscheidung=ent, titel="Ich organisiere selbst", ist_selbst=True)
        if ent.typ == EntscheidungTyp.STIMMUNG:
            Option.objects.create(entscheidung=ent, titel="Hast du Lust?")
        sv.benachrichtige(
            sv.empfaenger(ctx.reise, ent.teilgruppe_id),
            T.REISE_ENTSCHEIDUNG,
            f"Neue Abstimmung: {ent.titel}",
            f"{ctx.reise.titel}: bitte abstimmen"
            + (f" bis {timezone.localtime(ent.frist):%d.%m. %H:%M}" if ent.frist else "."),
            sv.lien(ctx.reise),
            ausser=request.user,
        )
        return Response({"id": str(ent.id)}, status=http.HTTP_201_CREATED)

    def _ent(self, ctx, eid):
        ent = get_object_or_404(self._entscheidungen_qs(ctx.reise), pk=eid)
        if not ctx.im_kreis(ent.teilgruppe_id):
            raise Http404
        return ent

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path="entscheidungen/" + UID.format("eid"),
    )
    def entscheidung(self, request, pk=None, eid=None):
        ctx = self._orga(pk)
        ent = self._ent(ctx, eid)
        if request.method == "DELETE":
            ent.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        if ent.status == EntStatus.BESCHLOSSEN:
            self._fehler("Eine beschlossene Entscheidung ist nicht mehr änderbar.")
        for feld in ("titel", "beschreibung", "frist", "baustein", "mehrfach"):
            if feld in request.data:
                setattr(
                    ent,
                    feld,
                    request.data[feld] or None if feld == "frist" else request.data[feld],
                )
        ent.beschreibung = formattext.bereinige(ent.beschreibung)
        ent.save()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="entscheidungen/" + UID.format("eid") + "/optionen",
    )
    def optionen(self, request, pk=None, eid=None):
        ctx = self._voll(pk)
        ent = self._ent(ctx, eid)
        if not (ctx.darf_verwalten or ctx.reise.vorschlaege_erlaubt):
            raise PermissionDenied("Vorschläge sind hier nicht erlaubt.")
        if ent.geschlossen or ent.typ == EntscheidungTyp.STIMMUNG:
            self._fehler("Hier sind keine Vorschläge mehr möglich.")
        ser = OptionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if ent.typ == EntscheidungTyp.TERMIN and not ser.validated_data.get("von_datum"):
            self._fehler("Ein Zeitraum braucht ein Anfangsdatum.")
        o = ser.save(entscheidung=ent, vorgeschlagen_von=request.user)
        return Response({"id": str(o.id)}, status=http.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path="optionen/" + UID.format("oid"))
    def option_loeschen(self, request, pk=None, oid=None):
        ctx = self._voll(pk)
        o = get_object_or_404(Option, pk=oid, entscheidung__reise=ctx.reise)
        if not ctx.im_kreis(o.entscheidung.teilgruppe_id):
            raise Http404
        if not (ctx.darf_verwalten or o.vorgeschlagen_von_id == request.user.pk):
            raise PermissionDenied("Nur eigene Vorschläge.")
        if o.entscheidung.status == EntStatus.BESCHLOSSEN or o.ist_selbst:
            self._fehler("Diese Option lässt sich nicht löschen.")
        o.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="entscheidungen/" + UID.format("eid") + "/stimmen",
    )
    @transaction.atomic
    def stimmen(self, request, pk=None, eid=None):
        ctx = self._voll(pk)
        ent = self._ent(ctx, eid)
        if ent.geschlossen:
            self._fehler("Die Frist ist abgelaufen.")
        try:
            sv.stimmen_setzen(ent, request.user, request.data.get("stimmen", []))
        except ValueError as exc:
            self._fehler(str(exc))
        return Response(out.entscheidung_dict(self._ent(ctx, eid), ctx))

    @action(
        detail=True,
        methods=["post"],
        url_path="entscheidungen/" + UID.format("eid") + "/beschliessen",
    )
    @transaction.atomic
    def beschliessen(self, request, pk=None, eid=None):
        ctx = self._orga(pk)
        ent = self._ent(ctx, eid)
        if ent.status == EntStatus.BESCHLOSSEN:
            self._fehler("Schon beschlossen.")
        option = None
        if request.data.get("option"):
            option = get_object_or_404(Option, pk=request.data["option"], entscheidung=ent)
        elif ent.typ != EntscheidungTyp.STIMMUNG:
            self._fehler("Wähle die Option, die gelten soll.")
        vorschlag = sv.vorschlag_option(ent)
        begruendung = str(request.data.get("begruendung", ""))
        if vorschlag and option and vorschlag.id != option.id and not begruendung:
            self._fehler("Bitte begründe, warum nicht der Vorschlag mit den meisten Stimmen gilt.")
        sv.beschliessen(ent, request.user, option, begruendung)
        sv.benachrichtige(
            sv.empfaenger(ctx.reise, ent.teilgruppe_id),
            T.REISE_ENTSCHEIDUNG,
            f"Beschlossen: {ent.titel}",
            f"{ctx.reise.titel}: {option.titel if option else 'Abstimmung beendet'}",
            sv.lien(ctx.reise),
            ausser=request.user,
        )
        return Response(out.entscheidung_dict(self._ent(ctx, eid), ctx))

    @action(
        detail=True,
        methods=["post"],
        url_path="entscheidungen/" + UID.format("eid") + "/verlaengern",
    )
    def verlaengern(self, request, pk=None, eid=None):
        ctx = self._orga(pk)
        ent = self._ent(ctx, eid)
        if ent.status == EntStatus.BESCHLOSSEN:
            self._fehler("Schon beschlossen.")
        from django.utils.dateparse import parse_datetime

        frist = parse_datetime(str(request.data.get("frist", "")))
        if frist is None or frist <= timezone.now():
            self._fehler("Die neue Frist muss in der Zukunft liegen.")
        ent.frist = frist
        ent.save(update_fields=["frist"])
        return Response(out.entscheidung_dict(self._ent(ctx, eid), ctx))

    # --- Infos -----------------------------------------------------------------------------

    @action(detail=True, methods=["get", "post"])
    def infos(self, request, pk=None):
        if request.method == "GET":
            ctx = self._voll(pk)
            heute = timezone.localdate()
            gelesen = set(
                ReiseInfoGelesen.objects.filter(
                    user=request.user, info__reise=ctx.reise
                ).values_list("info_id", flat=True)
            )
            return Response(
                [
                    out.info_dict(i, ctx, gelesen)
                    for i in ctx.reise.infos.select_related("teilgruppe").prefetch_related(
                        "gelesen"
                    )
                    if ctx.im_kreis(i.teilgruppe_id)
                    and (ctx.darf_verwalten or i.gueltig_bis is None or i.gueltig_bis >= heute)
                ]
            )
        ctx = self._orga(pk)
        ser = InfoSerializer(data=request.data, context={"reise": ctx.reise})
        ser.is_valid(raise_exception=True)
        daten = ser.validated_data
        daten["text"] = formattext.bereinige(daten.get("text", ""))
        info = ReiseInfo.objects.create(reise=ctx.reise, erstellt_von=request.user, **daten)
        if info.wichtig:
            sv.benachrichtige(
                sv.empfaenger(ctx.reise, info.teilgruppe_id),
                T.REISE_INFO,
                f"Wichtig: {info.titel}",
                ctx.reise.titel,
                sv.lien(ctx.reise),
                ausser=request.user,
            )
        return Response({"id": str(info.id)}, status=http.HTTP_201_CREATED)

    @action(detail=True, methods=["patch", "delete"], url_path="infos/" + UID.format("iid"))
    def info(self, request, pk=None, iid=None):
        ctx = self._orga(pk)
        info = get_object_or_404(ReiseInfo, pk=iid, reise=ctx.reise)
        if request.method == "DELETE":
            info.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        ser = InfoSerializer(info, data=request.data, partial=True, context={"reise": ctx.reise})
        ser.is_valid(raise_exception=True)
        info = ser.save()
        info.text = formattext.bereinige(info.text)
        info.save(update_fields=["text"])
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="infos/" + UID.format("iid") + "/gelesen",
    )
    def info_gelesen(self, request, pk=None, iid=None):
        ctx = self._voll(pk)
        info = get_object_or_404(ReiseInfo, pk=iid, reise=ctx.reise)
        if not ctx.im_kreis(info.teilgruppe_id):
            raise Http404
        ReiseInfoGelesen.objects.get_or_create(info=info, user=request.user)
        return Response(status=http.HTTP_204_NO_CONTENT)

    # --- Aufgaben --------------------------------------------------------------------------

    @action(detail=True, methods=["get", "post"])
    def aufgaben(self, request, pk=None):
        if request.method == "GET":
            ctx = self._voll(pk)
            return Response(
                [
                    out.aufgabe_dict(a)
                    for a in ctx.reise.aufgaben.select_related(
                        "verantwortlich__membre", "teilgruppe"
                    )
                    if ctx.im_kreis(a.teilgruppe_id)
                ]
            )
        ctx = self._orga(pk)
        a = self._aufgabe_speichern(ctx, None, request)
        return Response(out.aufgabe_dict(a), status=http.HTTP_201_CREATED)

    def _aufgabe_speichern(self, ctx, aufgabe, request):
        ser = AufgabeSerializer(
            aufgabe, data=request.data, partial=aufgabe is not None, context={"reise": ctx.reise}
        )
        ser.is_valid(raise_exception=True)
        daten = ser.validated_data
        uid = daten.pop("verantwortlich", "keine")
        if uid not in ("keine", None):
            tn = (
                ctx.reise.teilnehmer.filter(user_id=uid, status=TStatus.DABEI)
                .select_related("user")
                .first()
            )
            if tn is None:
                self._fehler("Die verantwortliche Person ist nicht dabei.")
            daten["verantwortlich"] = tn.user
        elif uid is None:
            daten["verantwortlich"] = None
        vorher = aufgabe.verantwortlich_id if aufgabe else None
        if aufgabe is None:
            aufgabe = Aufgabe(reise=ctx.reise)
        for k, v in daten.items():
            setattr(aufgabe, k, v)
        aufgabe.save()
        if aufgabe.verantwortlich_id and aufgabe.verantwortlich_id != vorher:
            sv.benachrichtige(
                [aufgabe.verantwortlich],
                T.REISE_AUFGABE,
                f"Aufgabe: {aufgabe.titel}",
                ctx.reise.titel,
                sv.lien(ctx.reise),
                ausser=ctx.user,
            )
        return aufgabe

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path="aufgaben/" + UID.format("aid"),
    )
    def aufgabe(self, request, pk=None, aid=None):
        ctx = self._voll(pk)
        a = get_object_or_404(Aufgabe, pk=aid, reise=ctx.reise)
        if not ctx.im_kreis(a.teilgruppe_id):
            raise Http404
        if request.method == "DELETE":
            if not ctx.darf_verwalten:
                raise PermissionDenied("Nur die Organisation darf löschen.")
            a.delete()
            return Response(status=http.HTTP_204_NO_CONTENT)
        if ctx.darf_verwalten:
            return Response(out.aufgabe_dict(self._aufgabe_speichern(ctx, a, request)))
        if a.verantwortlich_id != request.user.pk or set(request.data) - {"status"}:
            raise PermissionDenied("Du darfst nur den Status deiner Aufgabe ändern.")
        ser = AufgabeSerializer(
            a,
            data={"status": request.data.get("status")},
            partial=True,
            context={"reise": ctx.reise},
        )
        ser.is_valid(raise_exception=True)
        return Response(out.aufgabe_dict(ser.save()))

    # --- Kosten (nur Rechnung) -------------------------------------------------------------

    @action(detail=True, methods=["get", "post"])
    @transaction.atomic
    def kosten(self, request, pk=None):
        ctx = self._voll(pk)
        if request.method == "POST":
            self._kosten_anlegen(ctx, request)
        r = sv.kosten_rechnung(ctx.reise)
        namen = {
            t.user_id: sv.name_von(t.user)
            for t in ctx.reise.teilnehmer.select_related("user__membre")
        }
        return Response(
            {
                "hinweis": (
                    "Jede Person bucht und bezahlt selbst. Der Verein vermittelt keine Reise."
                ),
                "posten": [
                    {
                        "id": str(p.id),
                        "bezeichnung": p.bezeichnung,
                        "betrag": f"{p.betrag:.2f}",
                        "bezahlt_von": str(p.bezahlt_von_id),
                        "bezahlt_von_name": namen.get(p.bezahlt_von_id, ""),
                        "anteile": [
                            {
                                "user": str(a.user_id),
                                "name": namen.get(a.user_id, ""),
                                "gewicht": str(a.gewicht),
                            }
                            for a in p.anteile.all()
                        ],
                        "kann_loeschen": ctx.darf_verwalten or p.bezahlt_von_id == request.user.pk,
                    }
                    for p in r["posten"]
                ],
                "salden": [
                    {"user": str(u), "name": namen.get(u, ""), "cents": c}
                    for u, c in r["salden"].items()
                ],
                "ueberweisungen": [
                    {"von": namen.get(v, ""), "an": namen.get(a, ""), "cents": c}
                    for v, a, c in r["ueberweisungen"]
                ],
            }
        )

    def _kosten_anlegen(self, ctx, request):
        from decimal import Decimal, InvalidOperation

        try:
            betrag = Decimal(str(request.data.get("betrag"))).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError):
            self._fehler("Ungültiger Betrag.")
        bez = str(request.data.get("bezeichnung", "")).strip()
        if betrag <= 0 or not bez:
            self._fehler("Bezeichnung und positiver Betrag sind nötig.")
        dabei = {
            str(t.user_id): t.user_id for t in ctx.reise.teilnehmer.filter(status=TStatus.DABEI)
        }
        zahler = str(request.data.get("bezahlt_von") or request.user.pk)
        if zahler not in dabei:
            self._fehler("Die zahlende Person ist nicht dabei.")
        anteile = request.data.get("teilnehmer") or [{"user": u} for u in dabei]
        p = Kostenposten.objects.create(
            reise=ctx.reise,
            bezeichnung=bez,
            betrag=betrag,
            bezahlt_von_id=dabei[zahler],
        )
        for a in anteile:
            uid = str(a.get("user"))
            if uid not in dabei:
                self._fehler("Eine Person im Anteil ist nicht dabei.")
            try:
                gewicht = Decimal(str(a.get("gewicht", 1)))
            except InvalidOperation:
                self._fehler("Ungültiges Gewicht.")
            if gewicht <= 0:
                self._fehler("Das Gewicht muss positiv sein.")
            KostenAnteil.objects.create(posten=p, user_id=dabei[uid], gewicht=gewicht)

    @action(detail=True, methods=["delete"], url_path="kosten/" + UID.format("kid"))
    def kosten_loeschen(self, request, pk=None, kid=None):
        ctx = self._voll(pk)
        p = get_object_or_404(Kostenposten, pk=kid, reise=ctx.reise)
        if not (ctx.darf_verwalten or p.bezahlt_von_id == request.user.pk):
            raise PermissionDenied("Nur die zahlende Person oder die Organisation.")
        p.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)
