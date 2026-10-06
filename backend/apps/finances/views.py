from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BudgetAnnuel, CategorieDepense, Depense, StatutDepense
from .permissions import FinancesPermission
from .serializers import (
    BudgetAnnuelSerializer,
    BudgetDefinirSerializer,
    CategorieDepenseSerializer,
    DepenseSerializer,
)


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


class DepenseViewSet(viewsets.ModelViewSet):
    serializer_class = DepenseSerializer
    permission_classes = [FinancesPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None

    def get_queryset(self):
        qs = Depense.objects.select_related(
            "categorie", "evenement", "projet", "saisie_par", "decide_par"
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
        serializer.save(saisie_par=self.request.user)

    def _verifier_modifiable(self, depense):
        if depense.statut == StatutDepense.APPROUVEE:
            return Response(
                {"detail": "Une dépense approuvée ne peut plus être modifiée."},
                status=status.HTTP_409_CONFLICT,
            )
        return None

    def update(self, request, *args, **kwargs):
        refus = self._verifier_modifiable(self.get_object())
        return refus or super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        refus = self._verifier_modifiable(self.get_object())
        if refus:
            return refus
        return super().destroy(request, *args, **kwargs)

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
            depense.statut = nouveau_statut
            depense.decide_par = request.user
            depense.date_decision = timezone.now()
            depense.motif_rejet = motif
            depense.save()
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
        with transaction.atomic():
            for ligne in s.validated_data["lignes"]:
                if ligne["montant"] == 0:
                    BudgetAnnuel.objects.filter(annee=annee, categorie=ligne["categorie"]).delete()
                else:
                    BudgetAnnuel.objects.update_or_create(
                        annee=annee,
                        categorie=ligne["categorie"],
                        defaults={"montant": ligne["montant"]},
                    )
        qs = BudgetAnnuel.objects.filter(annee=annee).select_related("categorie")
        return Response(BudgetAnnuelSerializer(qs, many=True).data)
