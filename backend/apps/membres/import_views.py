"""
Vue API — import Excel des membres historiques (RICEFW C-001/W-008).

Fichier séparé de views.py : ce n'est pas une action du ViewSet (le routeur
DRF standard ne gère pas bien les uploads multipart sur une action de
ModelViewSet aux côtés du parsing JSON par défaut des autres actions), et
TDD §2.4 documente explicitement un endpoint dédié `POST /membres/import/`.
"""

import magic
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsRHOrAbove

from .imports import ImportSchemaError, construire_classeur_template, importer_membres
from .imports_historique import (
    ImportHistoriqueSchemaError,
    construire_classeur_template_historique,
    importer_historique_statuts,
)
from .utils_http import xlsx_response

# ~300 lignes historiques (RICEFW C-001) → un .xlsx de cette taille ne
# dépasse jamais quelques centaines de Ko. 5 Mo laisse une large marge tout
# en bornant la mémoire consommée par la lecture intégrale ci-dessous. Même
# borne réutilisée pour l'import d'historique (imports_historique.py, ajouté
# le 2026-09-19) : même ordre de grandeur (une ligne par membre).
MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024

ALLOWED_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _fichier_xlsx_valide_ou_erreur(request):
    """
    Validation multipart partagée entre MembreImportView et
    HistoriqueStatutImportView (ajouté le 2026-09-19) : présence du champ,
    taille, MIME réel (SCD §2.3, A08 "Import Excel malveillant" — jamais
    confiance en l'extension/Content-Type déclaré par le client ; un .xlsx
    est un zip OOXML, sa signature n'est fiable qu'en lisant le fichier
    entier, d'où la lecture complète ici, bornée par MAX_IMPORT_SIZE_BYTES).

    Retourne (fichier, None) si valide, ou (None, Response-erreur) sinon —
    l'appelant fait `fichier, erreur = ...; if erreur: return erreur`.
    """
    fichier = request.FILES.get("fichier")
    if fichier is None:
        return None, Response(
            {
                "code": "fichier_requis",
                "message": "Aucun fichier reçu (champ multipart attendu : 'fichier').",
                "details": {},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if fichier.size > MAX_IMPORT_SIZE_BYTES:
        return None, Response(
            {
                "code": "fichier_trop_volumineux",
                "message": (
                    f"Fichier trop volumineux (max {MAX_IMPORT_SIZE_BYTES // (1024 * 1024)} Mo)."
                ),
                "details": {},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    contenu = fichier.read()
    fichier.seek(0)
    mime_reel = magic.from_buffer(contenu, mime=True)
    if mime_reel not in ALLOWED_MIME_TYPES:
        return None, Response(
            {
                "code": "type_fichier_invalide",
                "message": (
                    f"Format de fichier non supporté (détecté : {mime_reel}). "
                    "Seul .xlsx est accepté."
                ),
                "details": {},
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return fichier, None


class MembreImportView(APIView):
    """
    POST /api/v1/membres/import/ — réservé RH+ (même niveau que la création
    manuelle de fiches membres, voir apps.membres.permissions).
    Champ multipart attendu : `fichier`.
    """

    permission_classes = [IsRHOrAbove]
    parser_classes = [MultiPartParser]

    def post(self, request):
        fichier, erreur = _fichier_xlsx_valide_ou_erreur(request)
        if erreur:
            return erreur

        try:
            resultat = importer_membres(fichier)
        except ImportSchemaError as exc:
            return Response(
                {"code": "schema_invalide", "message": str(exc), "details": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(resultat.as_dict(), status=status.HTTP_200_OK)


class MembreImportTemplateView(APIView):
    """
    GET /api/v1/membres/import/template/ — réservé RH+ (même gate que
    MembreImportView). Sert le classeur vierge construit par
    apps.membres.imports.construire_classeur_template (même logique que la
    commande manage.py generer_template_import_membres, voir ce module).
    """

    permission_classes = [IsRHOrAbove]

    def get(self, request):
        classeur = construire_classeur_template()
        return xlsx_response(classeur, "template_import_membres.xlsx")


class HistoriqueStatutImportView(APIView):
    """
    POST /api/v1/membres/import-historique/ — import Excel de l'historique de statut associatif
    PAR ANNÉE (demande utilisateur du 2026-09-19, voir apps.membres.imports_historique) pour des
    membres DÉJÀ EN BASE. Réservé RH+, même niveau que MembreImportView — c'est aussi une
    opération de rattrapage de master data, pas une action métier courante. Champ multipart
    attendu : `fichier`.
    """

    permission_classes = [IsRHOrAbove]
    parser_classes = [MultiPartParser]

    def post(self, request):
        fichier, erreur = _fichier_xlsx_valide_ou_erreur(request)
        if erreur:
            return erreur

        try:
            resultat = importer_historique_statuts(fichier)
        except ImportHistoriqueSchemaError as exc:
            return Response(
                {"code": "schema_invalide", "message": str(exc), "details": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(resultat.as_dict(), status=status.HTTP_200_OK)


class HistoriqueStatutImportTemplateView(APIView):
    """GET /api/v1/membres/import-historique/template/ — réservé RH+ (même gate que
    HistoriqueStatutImportView). Sert le classeur vierge construit par
    apps.membres.imports_historique.construire_classeur_template_historique."""

    permission_classes = [IsRHOrAbove]

    def get(self, request):
        classeur = construire_classeur_template_historique()
        return xlsx_response(classeur, "template_import_historique_statut.xlsx")
