"""
Génère un classeur .xlsx vide avec les en-têtes attendues par l'import
membres (RICEFW C-001/W-008, voir apps.membres.imports.REQUIRED_COLUMNS /
OPTIONAL_COLUMNS) — à fournir à l'association pour saisir les ~300 lignes
historiques avant de les uploader via POST /api/v1/membres/import/.

La construction du classeur est partagée avec MembreImportTemplateView
(GET /api/v1/membres/import/template/, RICEFW W-008/F-019 — téléchargement
depuis le frontend) via apps.membres.imports.construire_classeur_template :
une seule source pour les en-têtes/exemples, cette commande ne fait que
l'enregistrer sur disque.

Usage : python manage.py generer_template_import_membres [--out chemin.xlsx]
"""

from django.core.management.base import BaseCommand

from apps.membres.imports import construire_classeur_template


class Command(BaseCommand):
    help = "Génère le template Excel vide pour l'import des membres historiques (RICEFW C-001)."

    def add_arguments(self, parser):
        parser.add_argument("--out", default="template_import_membres.xlsx")

    def handle(self, *args, **options):
        classeur = construire_classeur_template()
        classeur.save(options["out"])
        self.stdout.write(self.style.SUCCESS(f"Template généré : {options['out']}"))
