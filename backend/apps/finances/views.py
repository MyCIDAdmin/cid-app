from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role

from .models import (
    AktionProtokoll,
    BudgetAnnuel,
    CategorieDepense,
    Depense,
    FinanzProtokoll,
    Jahresabschluss,
    StatutDepense,
)
from .permissions import FinancesPermission
from .serializers import (
    BudgetAnnuelSerializer,
    BudgetDefinirSerializer,
    CategorieDepenseSerializer,
    DepenseSerializer,
)
from .services import (
    diff,
    etat_depense,
    jahr_gesperrt,
    nom_utilisateur,
    protokolliere,
    pruefe_jahr,
    resume_depense,
)

SCHWELLE_GROSSE_AUSGABE = 500  # € — Ausgaben ab diesem Betrag erscheinen in der Prüfungsansicht


def _annee(request, defaut=None):
    brut = request.query_params.get("annee") or request.data.get("annee")
    if not brut:
        return defaut or timezone.localdate().year
    try:
        return int(brut)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"annee": "Doit être une année numérique."}) from exc


class CategorieDepenseViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Pas de destroy : une catégorie utilisée se désactive (`actif=False`)."""

    queryset = CategorieDepense.objects.all()
    serializer_class = CategorieDepenseSerializer
    permission_classes = [FinancesPermission]
    pagination_class = None

    def perform_create(self, serializer):
        cat = serializer.save()
        protokolliere(
            self.request.user,
            AktionProtokoll.ERSTELLT,
            "categorie",
            cat.id,
            f"Kategorie „{cat.nom}“ angelegt",
        )

    def perform_update(self, serializer):
        avant = {f: getattr(serializer.instance, f) for f in ("nom", "actif", "ordre")}
        cat = serializer.save()
        aenderungen = diff(avant, {f: getattr(cat, f) for f in avant})
        if aenderungen:
            protokolliere(
                self.request.user,
                AktionProtokoll.GEAENDERT,
                "categorie",
                cat.id,
                f"Kategorie „{cat.nom}“ geändert",
                aenderungen=aenderungen,
            )


class DepenseViewSet(viewsets.ModelViewSet):
    serializer_class = DepenseSerializer
    permission_classes = [FinancesPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        qs = Depense.objects.select_related(
            "categorie", "evenement", "projet", "aufgabe", "saisie_par", "decide_par"
        )
        p = self.request.query_params
        if p.get("annee"):
            qs = qs.filter(date_depense__year=p["annee"])
        if p.get("statut"):
            qs = qs.filter(statut=p["statut"])
        if p.get("categorie"):
            qs = qs.filter(categorie_id=p["categorie"])
        if p.get("evenement"):
            qs = qs.filter(evenement_id=p["evenement"])
        if p.get("projet"):
            qs = qs.filter(projet_id=p["projet"])
        return qs

    def perform_create(self, serializer):
        pruefe_jahr(serializer.validated_data["date_depense"].year)
        depense = serializer.save(saisie_par=self.request.user)
        protokolliere(
            self.request.user,
            AktionProtokoll.ERSTELLT,
            "depense",
            depense.id,
            f"Ausgabe erfasst: {resume_depense(depense)}",
            annee=depense.date_depense.year,
        )

    def _verifier_modifiable(self, depense):
        if depense.statut == StatutDepense.APPROUVEE:
            return Response(
                {"detail": "Une dépense approuvée ne peut plus être modifiée."},
                status=status.HTTP_409_CONFLICT,
            )
        pruefe_jahr(depense.date_depense.year)
        return None

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        refus = self._verifier_modifiable(instance)
        if refus:
            return refus
        self._avant = etat_depense(instance)
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        neues_jahr = serializer.validated_data.get("date_depense")
        if neues_jahr:
            pruefe_jahr(neues_jahr.year)
        depense = serializer.save()
        depense = Depense.objects.select_related("categorie", "evenement", "projet", "aufgabe").get(
            pk=depense.pk
        )
        aenderungen = diff(self._avant, etat_depense(depense))
        if aenderungen:
            protokolliere(
                self.request.user,
                AktionProtokoll.GEAENDERT,
                "depense",
                depense.id,
                f"Ausgabe geändert: {resume_depense(depense)}",
                annee=depense.date_depense.year,
                aenderungen=aenderungen,
            )

    def destroy(self, request, *args, **kwargs):
        depense = self.get_object()
        refus = self._verifier_modifiable(depense)
        if refus:
            return refus
        resume = resume_depense(depense)
        annee, pk = depense.date_depense.year, depense.id
        depense.delete()
        protokolliere(
            request.user,
            AktionProtokoll.GELOESCHT,
            "depense",
            pk,
            f"Ausgabe gelöscht: {resume}",
            annee=annee,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _decider(self, request, nouveau_statut, motif=""):
        with transaction.atomic():
            depense = Depense.objects.select_for_update().get(pk=self.get_object().pk)
            if depense.saisie_par_id == request.user.id:
                return Response(
                    {"detail": "Principe des quatre yeux : une autre personne doit décider."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if depense.statut != StatutDepense.EN_ATTENTE:
                return Response(
                    {"detail": "Cette dépense a déjà été traitée."},
                    status=status.HTTP_409_CONFLICT,
                )
            pruefe_jahr(depense.date_depense.year)
            depense.statut = nouveau_statut
            depense.decide_par = request.user
            depense.date_decision = timezone.now()
            depense.motif_rejet = motif
            depense.save()
            freigegeben = nouveau_statut == StatutDepense.APPROUVEE
            protokolliere(
                request.user,
                AktionProtokoll.FREIGEGEBEN if freigegeben else AktionProtokoll.ABGELEHNT,
                "depense",
                depense.id,
                f"Ausgabe {'freigegeben' if freigegeben else 'abgelehnt'}: "
                f"{resume_depense(depense)}",
                annee=depense.date_depense.year,
                aenderungen={"motif": motif} if motif else {},
            )
        return Response(self.get_serializer(depense).data)

    @action(detail=True, methods=["post"])
    def approuver(self, request, pk=None):
        return self._decider(request, StatutDepense.APPROUVEE)

    @action(detail=True, methods=["post"])
    def rejeter(self, request, pk=None):
        motif = (request.data.get("motif") or "").strip()
        if not motif:
            return Response({"motif": "Motif obligatoire."}, status=status.HTTP_400_BAD_REQUEST)
        return self._decider(request, StatutDepense.REJETEE, motif)


class BudgetView(APIView):
    permission_classes = [FinancesPermission]

    def get(self, request):
        qs = BudgetAnnuel.objects.select_related("categorie")
        if request.query_params.get("annee"):
            qs = qs.filter(annee=request.query_params["annee"])
        return Response(BudgetAnnuelSerializer(qs, many=True).data)

    def post(self, request):
        """Définit en une fois le budget d'une année : montant 0 = ligne supprimée."""
        s = BudgetDefinirSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        annee = s.validated_data["annee"]
        pruefe_jahr(annee)
        with transaction.atomic():
            for ligne in s.validated_data["lignes"]:
                bestehend = BudgetAnnuel.objects.filter(
                    annee=annee, categorie=ligne["categorie"]
                ).first()
                alt = bestehend.montant if bestehend else 0
                if ligne["montant"] == 0:
                    BudgetAnnuel.objects.filter(annee=annee, categorie=ligne["categorie"]).delete()
                else:
                    BudgetAnnuel.objects.update_or_create(
                        annee=annee,
                        categorie=ligne["categorie"],
                        defaults={"montant": ligne["montant"]},
                    )
                if alt != ligne["montant"]:
                    protokolliere(
                        request.user,
                        AktionProtokoll.BUDGET,
                        "budget",
                        ligne["categorie"].id,
                        f"Budget {annee} · {ligne['categorie'].nom}",
                        annee=annee,
                        aenderungen={"montant": [str(alt), str(ligne["montant"])]},
                    )
        qs = BudgetAnnuel.objects.filter(annee=annee).select_related("categorie")
        return Response(BudgetAnnuelSerializer(qs, many=True).data)


class ProtokollView(APIView):
    """GET /finances/protokoll/?annee=&aktion=&objekt_typ=&limit= — append-only, lecture seule."""

    permission_classes = [FinancesPermission]

    def get(self, request):
        qs = FinanzProtokoll.objects.all()
        p = request.query_params
        if p.get("annee"):
            qs = qs.filter(annee=_annee(request))
        if p.get("aktion"):
            qs = qs.filter(aktion=p["aktion"])
        if p.get("objekt_typ"):
            qs = qs.filter(objekt_typ=p["objekt_typ"])
        try:
            limit = min(int(p.get("limit", 300)), 1000)
        except ValueError:
            limit = 300
        return Response(
            [
                {
                    "id": str(e.id),
                    "zeitpunkt": e.zeitpunkt,
                    "benutzer_name": e.benutzer_name,
                    "aktion": e.aktion,
                    "objekt_typ": e.objekt_typ,
                    "annee": e.annee,
                    "zusammenfassung": e.zusammenfassung,
                    "aenderungen": e.aenderungen,
                }
                for e in qs[:limit]
            ]
        )


def _abschluss_dict(annee):
    a = Jahresabschluss.objects.filter(annee=annee).first()
    if not a:
        return {"annee": annee, "abgeschlossen": False}
    return {
        "annee": annee,
        "abgeschlossen": a.aktiv,
        "abgeschlossen_am": a.abgeschlossen_am,
        "abgeschlossen_durch": nom_utilisateur(a.abgeschlossen_durch),
        "snapshot": a.snapshot,
        "wiedergeoeffnet_am": a.wiedergeoeffnet_am,
        "wiedereroeffnung_grund": a.wiedereroeffnung_grund,
    }


class AbschlussView(APIView):
    """Jahresabschluss : GET = Status + Vorab-Prüfung, POST = Jahr abschließen."""

    permission_classes = [FinancesPermission]

    def get(self, request):
        annee = _annee(request)
        offen = Depense.objects.filter(date_depense__year=annee, statut=StatutDepense.EN_ATTENTE)
        return Response(
            {**_abschluss_dict(annee), "offene_ausgaben": offen.count()},
        )

    def post(self, request):
        from apps.stats.bilan import bilan_annuel  # local : stats importe finances.models

        annee = _annee(request)
        if annee > timezone.localdate().year:
            raise ValidationError(
                {"annee": "Ein zukünftiges Jahr kann nicht abgeschlossen werden."}
            )
        if jahr_gesperrt(annee):
            return Response(
                {"detail": f"Das Geschäftsjahr {annee} ist bereits abgeschlossen."},
                status=status.HTTP_409_CONFLICT,
            )
        offen = Depense.objects.filter(
            date_depense__year=annee, statut=StatutDepense.EN_ATTENTE
        ).count()
        if offen:
            return Response(
                {"detail": f"{offen} Ausgabe(n) warten noch auf Freigabe — erst entscheiden."},
                status=status.HTTP_409_CONFLICT,
            )
        bilan = bilan_annuel(annee)
        snapshot = {
            "recettes": str(bilan["recettes"]["total"]),
            "depenses": str(bilan["depenses"]["total"]),
            "resultat": str(bilan["resultat"]),
        }
        Jahresabschluss.objects.update_or_create(
            annee=annee,
            defaults={
                "aktiv": True,
                "abgeschlossen_am": timezone.now(),
                "abgeschlossen_durch": request.user,
                "snapshot": snapshot,
                "wiedergeoeffnet_am": None,
                "wiedergeoeffnet_durch": None,
                "wiedereroeffnung_grund": "",
            },
        )
        protokolliere(
            request.user,
            AktionProtokoll.ABGESCHLOSSEN,
            "jahr",
            annee,
            f"Geschäftsjahr {annee} abgeschlossen (Ergebnis {snapshot['resultat']} €)",
            annee=annee,
            aenderungen=snapshot,
        )
        return Response(_abschluss_dict(annee), status=status.HTTP_201_CREATED)


class WiedereroeffnenView(APIView):
    """Nur der Administrator App darf ein abgeschlossenes Jahr wieder öffnen — mit Begründung."""

    permission_classes = [IsAuthenticated, FinancesPermission]

    def post(self, request):
        if request.user.role != Role.SUPER_ADMIN:
            return Response(
                {"detail": "Nur der Administrator App darf ein Jahr wiedereröffnen."},
                status=status.HTTP_403_FORBIDDEN,
            )
        annee = _annee(request)
        grund = (request.data.get("grund") or "").strip()
        if not grund:
            raise ValidationError({"grund": "Begründung erforderlich."})
        a = Jahresabschluss.objects.filter(annee=annee, aktiv=True).first()
        if a is None:
            return Response({"detail": "Dieses Jahr ist nicht abgeschlossen."}, status=409)
        a.aktiv = False
        a.wiedergeoeffnet_am = timezone.now()
        a.wiedergeoeffnet_durch = request.user
        a.wiedereroeffnung_grund = grund
        a.save()
        protokolliere(
            request.user,
            AktionProtokoll.WIEDERGEOEFFNET,
            "jahr",
            annee,
            f"Geschäftsjahr {annee} wiedereröffnet",
            annee=annee,
            aenderungen={"grund": grund},
        )
        return Response(_abschluss_dict(annee))


class PruefungView(APIView):
    """Kassenprüfer-Ansicht (read-only) : Kennzahlen und Auffälligkeiten eines Jahres."""

    permission_classes = [FinancesPermission]

    def get(self, request):
        annee = _annee(request)
        alle = Depense.objects.filter(date_depense__year=annee).select_related(
            "categorie", "evenement", "projet", "saisie_par", "decide_par"
        )
        freigegeben = alle.filter(statut=StatutDepense.APPROUVEE)

        def ser(qs):
            return DepenseSerializer(qs, many=True, context={"request": request}).data

        return Response(
            {
                "annee": annee,
                "abschluss": _abschluss_dict(annee),
                "anzahl_freigegeben": freigegeben.count(),
                "summe_freigegeben": freigegeben.aggregate(t=Sum("montant"))["t"] or 0,
                "anzahl_offen": alle.filter(statut=StatutDepense.EN_ATTENTE).count(),
                "anzahl_abgelehnt": alle.filter(statut=StatutDepense.REJETEE).count(),
                "schwelle": SCHWELLE_GROSSE_AUSGABE,
                "ohne_beleg": ser(
                    freigegeben.filter(Q(justificatif="") | Q(justificatif__isnull=True))
                ),
                "grosse_ausgaben": ser(freigegeben.filter(montant__gte=SCHWELLE_GROSSE_AUSGABE)),
            }
        )
