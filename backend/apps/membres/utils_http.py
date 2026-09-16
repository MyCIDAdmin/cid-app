"""
Petits utilitaires HTTP partagés — app membres. Pour l'instant, uniquement la sérialisation
d'un classeur openpyxl en réponse HTTP téléchargeable, factorisée entre le template d'import
(MembreImportTemplateView, apps.membres.import_views) et l'export du répertoire
(MembreExportView, apps.membres.export_views) pour ne pas dupliquer ce boilerplate.
"""

import io

from django.http import HttpResponse

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def xlsx_response(classeur, nom_fichier: str) -> HttpResponse:
    buffer = io.BytesIO()
    classeur.save(buffer)
    buffer.seek(0)
    response = HttpResponse(buffer.getvalue(), content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{nom_fichier}"'
    return response
