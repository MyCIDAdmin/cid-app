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

from .imports import ImportSchemaError, importer_membres

# ~300 lignes historiques (RICEFW C-001) → un .xlsx de cette taille ne
# dépasse jamais quelques centaines de Ko. 5 Mo laisse une large marge tout
# en bornant la mémoire consommée par la lecture intégrale ci-dessous.
MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024

ALLOWED_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class MembreImportView(APIView):
    """
    POST /api/v1/membres/import/ — réservé RH+ (même niveau que la création
    manuelle de fiches membres, voir apps.membres.permissions).
    Champ multipart attendu : `fichier`.
    """

    permission_classes = [IsRHOrAbove]
    parser_classes = [MultiPartParser]

    def post(self, request):
        fichier = request.FILES.get("fichier")
        if fichier is None:
            return Response(
                {
                    "code": "fichier_requis",
                    "message": "Aucun fichier reçu (champ multipart attendu : 'fichier').",
                    "details": {},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if fichier.size > MAX_IMPORT_SIZE_BYTES:
            return Response(
                {
                    "code": "fichier_trop_volumineux",
                    "message": (
                        "Fichier trop volumineux "
                        f"(max {MAX_IMPORT_SIZE_BYTES // (1024 * 1024)} Mo)."
                    ),
                    "details": {},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validation MIME réelle (SCD §2.3, A08 "Import Excel malveillant" —
        # jamais confiance en l'extension ou au Content-Type déclaré par le
        # client). Un .xlsx est un zip OOXML : la signature qui l'identifie
        # (table des matières [Content_Types].xml) n'est fiable qu'en lisant
        # le fichier entier, pas seulement ses premiers octets — d'où la
        # lecture complète ici (bornée par MAX_IMPORT_SIZE_BYTES ci-dessus).
        contenu = fichier.read()
        fichier.seek(0)
        mime_reel = magic.from_buffer(contenu, mime=True)
        if mime_reel not in ALLOWED_MIME_TYPES:
            return Response(
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

        try:
            resultat = importer_membres(fichier)
        except ImportSchemaError as exc:
            return Response(
                {"code": "schema_invalide", "message": str(exc), "details": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(resultat.as_dict(), status=status.HTTP_200_OK)
