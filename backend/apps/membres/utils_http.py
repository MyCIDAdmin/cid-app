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


def safe_cell(wert):
    """Neutralisiert Excel-Formel-Injektion (CSV-/Formel-Einschleusung) in Nutzerdaten : openpyxl
    schreibt jeden mit "=" beginnenden Text als Formel (z. B. `=HYPERLINK(...)` in einem frei
    wählbaren Vornamen) ; ein vorangestelltes Apostroph macht daraus reinen Text. Nur für Text aus
    Nutzereingaben verwenden — eigene Formeln des Exports bleiben unverändert."""
    if isinstance(wert, str) and wert.startswith("="):
        return "'" + wert
    return wert


def safe_zeile(werte):
    """`safe_cell` für eine ganze Zeile (z. B. für `Worksheet.append`)."""
    return [safe_cell(w) for w in werte]


def safe_csv(wert):
    """Wie `safe_cell`, aber für CSV : dort werten Tabellenprogramme auch Texte mit + - @ sowie
    Tab/Wagenrücklauf am Anfang als Formel aus. Nur auf Textfelder anwenden (nie auf Beträge)."""
    if isinstance(wert, str) and wert[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + wert
    return wert
