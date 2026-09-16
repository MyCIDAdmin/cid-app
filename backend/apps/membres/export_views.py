"""
Vue API — export Excel du répertoire des membres (demande utilisateur du 2026-09-16, RICEFW
R-002). Fichier séparé de views.py, même raison que import_views.py : ce n'est pas une action
de ModelViewSet (réponse binaire, pas de sérialisation JSON standard) et TDD §2.4 documente
déjà des endpoints "utilitaires" à part (`/membres/import/`, `/membres/import/template/`).
"""

from django.utils import timezone
from rest_framework.views import APIView

from apps.accounts.permissions import IsRHOrAbove

from .exports import construire_classeur_export, parse_ordering
from .filters import MembreFilter
from .models import Membre
from .utils_http import xlsx_response


class MembreExportView(APIView):
    """
    GET /api/v1/membres/export/ — réservé RH+ (même niveau que l'import et la gestion des
    fiches, voir apps.membres.permissions/MembreImportView). Accepte les mêmes paramètres de
    filtre que GET /membres/ (statut, ville, land, pays, nom, date_adhesion_apres/avant, q —
    voir MembreFilter), plus `ordering` (liste de champs séparés par virgules, "-" pour
    descendant — voir apps.membres.exports.ORDERING_FIELDS).

    Pas de pagination ici volontairement : un export doit contenir TOUTE la sélection filtrée,
    pas une seule page (à la différence de MembreViewSet.list, qui reste paginé pour l'écran).
    L'association compte quelques centaines de membres (voir RICEFW C-001, ~300 lignes) : un
    classeur de cette taille se construit en mémoire sans risque de dépassement.
    """

    permission_classes = [IsRHOrAbove]

    def get(self, request):
        queryset = Membre.objects.all()
        queryset = MembreFilter(request.GET, queryset=queryset).qs
        queryset = queryset.order_by(*parse_ordering(request.GET.get("ordering")))

        classeur = construire_classeur_export(queryset)
        nom_fichier = f"export_membres_{timezone.localtime():%Y%m%d_%H%M}.xlsx"
        return xlsx_response(classeur, nom_fichier)
